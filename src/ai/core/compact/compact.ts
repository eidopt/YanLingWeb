import type { AIProvider, ProviderMessage } from '../providers/types';
import { getContextWindow, tokenCountWithEstimation } from '../utils/tokens';

const DEFAULT_MAX_CONTEXT_TOKENS = 500_000;
const RECENT_CONTEXT_TARGET_RATIO = 0.8; // keep 80% of max as recent context target
const COMPACTION_MODEL = 'deepseek-v4-flash';

const COMPACTION_SYSTEM_PROMPT = [
  'You are a conversation compactor. Summarize the following conversation history into a concise, structured summary.',
  '',
  'Rules:',
  '- Preserve ALL tool call results, especially node IDs, page IDs, and operation outcomes.',
  '- Preserve ALL error messages and their context.',
  '- Preserve the user\'s original requests and intent.',
  '- Do NOT invent information that was not in the conversation.',
  '- Use bullet points for clarity.',
  '- Structure: User Requests → Operations Performed → Results/Errors → Current State.',
].join('\n');

function valueToString(value: unknown, fallback = ''): string {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return String(value);
  }
  return fallback;
}

function messageContentToString(content: ProviderMessage['content']): string {
  return typeof content === 'string' ? content : JSON.stringify(content);
}

/**
 * Check if messages exceed the compaction threshold.
 * Uses model-specific context window when available, falls back to default.
 */
export function needsCompaction(messages: readonly ProviderMessage[], model?: string): boolean {
  const maxTokens = model ? getContextWindow(model) : DEFAULT_MAX_CONTEXT_TOKENS;
  return tokenCountWithEstimation(messages) > maxTokens;
}

/**
 * Get the recent-context target for a given model.
 * Used by compaction to decide how many recent messages to keep.
 */
export function getRecentContextTarget(model?: string): number {
  const maxTokens = model ? getContextWindow(model) : DEFAULT_MAX_CONTEXT_TOKENS;
  return Math.floor(maxTokens * RECENT_CONTEXT_TARGET_RATIO);
}

/**
 * Compaction: appends summary to the last system message.
 *
 * NOTE on prefix caching: Appending to the system message DOES change the
 * message content, which invalidates the prefix cache for that request.
 * This is an inherent trade-off — compaction always breaks the prefix once.
 * The benefit is that subsequent requests after compaction will have a
 * stable, shorter prefix that caches well.
 */
export function applyCompaction(
  messages: ProviderMessage[],
  summary: string,
  model?: string,
): ProviderMessage[] {
  const system = messages.filter((m) => m.role === 'system');
  const nonSystem = messages.filter((m) => m.role !== 'system');
  const recentTarget = getRecentContextTarget(model);

  // Keep recent messages up to token budget
  const recent: ProviderMessage[] = [];
  for (let index = nonSystem.length - 1; index >= 0; index -= 1) {
    const next = [nonSystem[index], ...recent];
    const estimatedTokens = tokenCountWithEstimation([...system, ...next]);
    if (estimatedTokens > recentTarget) {
      break;
    }
    recent.unshift(nonSystem[index]);
  }

  // Append compaction summary to the LAST system message.
  // This changes the system message content (breaks prefix cache once),
  // but avoids inserting new messages before the conversation history.
  // Subsequent requests will have a stable, shorter prefix.
  const compactedSystem = [...system];
  const compactionNote = [
    '',
    '[Compaction — prior context compressed]',
    '',
    summary,
    '',
    '[Continue from here. Do not repeat completed work. '
      + 'If a tool was already called, do not call it again with the same intent.]',
  ].join('\n');

  if (compactedSystem.length > 0) {
    const lastIndex = compactedSystem.length - 1;
    compactedSystem[lastIndex] = {
      ...compactedSystem[lastIndex],
      content: messageContentToString(compactedSystem[lastIndex].content) + compactionNote,
    };
  } else {
    compactedSystem.push({ role: 'system', content: compactionNote });
  }

  return [...compactedSystem, ...recent];
}

/**
 * LLM-based compaction: uses the provider to generate a semantic summary
 * of the old messages, then applies cache-aware compaction.
 */
export async function compactConversationWithLLM(
  messages: ProviderMessage[],
  provider: AIProvider,
  model: string = COMPACTION_MODEL,
): Promise<ProviderMessage[]> {
  if (!needsCompaction(messages, model)) {
    return messages;
  }

  const system = messages.filter((m) => m.role === 'system');
  const nonSystem = messages.filter((m) => m.role !== 'system');
  const recentTarget = getRecentContextTarget(model);

  // Find the boundary: keep recent messages, summarize old ones
  const recent: ProviderMessage[] = [];
  for (let index = nonSystem.length - 1; index >= 0; index -= 1) {
    const next = [nonSystem[index], ...recent];
    if (tokenCountWithEstimation([...system, ...next]) > recentTarget) {
      break;
    }
    recent.unshift(nonSystem[index]);
  }
  const old = nonSystem.slice(0, Math.max(0, nonSystem.length - recent.length));

  if (old.length === 0) {
    return messages;
  }

  // Build conversation transcript for summarization
  const transcript = buildTranscript(old);

  // Call LLM for semantic summary
  const summary = await generateSummary(provider, model, transcript);

  return applyCompaction(messages, summary, model);
}

/**
 * Synchronous fallback compaction (no LLM call).
 * Used when provider is not available or LLM call fails.
 */
export function compactConversation(messages: ProviderMessage[], model?: string): ProviderMessage[] {
  if (!needsCompaction(messages, model)) {
    return messages;
  }

  const system = messages.filter((m) => m.role === 'system');
  const nonSystem = messages.filter((m) => m.role !== 'system');
  const recentTarget = getRecentContextTarget(model);

  const recent: ProviderMessage[] = [];
  for (let index = nonSystem.length - 1; index >= 0; index -= 1) {
    const next = [nonSystem[index], ...recent];
    if (tokenCountWithEstimation([...system, ...next]) > recentTarget) {
      break;
    }
    recent.unshift(nonSystem[index]);
  }
  const old = nonSystem.slice(0, Math.max(0, nonSystem.length - recent.length));

  const summary = buildFallbackSummary(old);
  return applyCompaction(messages, summary, model);
}

function buildTranscript(messages: ProviderMessage[]): string {
  const lines: string[] = [];

  for (const msg of messages) {
    if (msg.role === 'user' && typeof msg.content === 'string') {
      const text = msg.content.trim();
      if (text && !text.startsWith('[')) {
        lines.push(`USER: ${text.slice(0, 500)}`);
      }
    } else if (msg.role === 'assistant' && typeof msg.content === 'string') {
      const text = msg.content.trim();
      if (text) {
        lines.push(`ASSISTANT: ${text.slice(0, 300)}`);
      }
    } else if (msg.role === 'tool_call' && msg.toolName) {
      const args = tryParseArgs(msg.toolArguments ?? '{}');
      const detail = buildToolDetail(msg.toolName, args);
      lines.push(`TOOL_CALL: ${msg.toolName}${detail ? ` — ${detail}` : ''}`);
    } else if (msg.role === 'tool_result' && typeof msg.content === 'string') {
      const truncated = msg.content.slice(0, 300);
      const isError = truncated.startsWith('{"error') || truncated.startsWith('{"success":false');
      lines.push(`TOOL_RESULT${isError ? ' (ERROR)' : ''}: ${truncated}`);
    }
  }

  return lines.join('\n');
}

async function generateSummary(
  provider: AIProvider,
  model: string,
  transcript: string,
): Promise<string> {
  const maxTranscriptChars = 50_000;
  const truncatedTranscript = transcript.length > maxTranscriptChars
    ? transcript.slice(-maxTranscriptChars) // Keep the most recent part
    : transcript;

  let summary = '';

  try {
    const stream = provider.stream({
      model,
      messages: [
        { role: 'system', content: COMPACTION_SYSTEM_PROMPT },
        { role: 'user', content: `Summarize this conversation:\n\n${truncatedTranscript}` },
      ],
    });

    for await (const event of stream) {
      if (event.type === 'text_delta') {
        summary += event.text;
      }
      if (event.type === 'error') {
        throw new Error(event.message);
      }
    }
  } catch {
    // Fallback to rule-based summary if LLM fails
    return buildFallbackSummaryFromTranscript(truncatedTranscript);
  }

  return summary.trim() || buildFallbackSummaryFromTranscript(truncatedTranscript);
}

function buildFallbackSummary(messages: ProviderMessage[]): string {
  const lines: string[] = [];
  const userRequests: string[] = [];
  const toolOps: string[] = [];
  const errors: string[] = [];

  for (const msg of messages) {
    if (msg.role === 'user' && typeof msg.content === 'string') {
      const text = msg.content.trim();
      if (text && !text.startsWith('[') && !text.startsWith('[系统提示]')) {
        userRequests.push(text.slice(0, 150));
      }
    }
    if (msg.role === 'tool_call' && msg.toolName) {
      const args = tryParseArgs(msg.toolArguments ?? '{}');
      const detail = buildToolDetail(msg.toolName, args);
      if (detail) {
        toolOps.push(`${msg.toolName}: ${detail}`);
      }
    }
    if (msg.role === 'tool_result' && typeof msg.content === 'string') {
      try {
        const parsed = JSON.parse(msg.content) as { error?: string; success?: boolean; errors?: string[] };
        if (parsed.error) {
          errors.push(parsed.error.slice(0, 100));
        } else if (parsed.errors?.length) {
          errors.push(...parsed.errors.map((e) => e.slice(0, 100)));
        }
      } catch { /* non-JSON content */ }
    }
  }

  if (userRequests.length > 0) {
    const unique = [...new Set(userRequests)];
    lines.push(`**User Requests**: ${unique.map((m) => `"${m}"`).join(' → ')}`);
  }
  if (toolOps.length > 0) {
    lines.push(`**Operations Performed** (most recent):`);
    toolOps.slice(-15).forEach((op) => lines.push(`  - ${op}`));
  }
  if (errors.length > 0) {
    lines.push(`**Errors Encountered**:`);
    [...new Set(errors)].slice(-5).forEach((err) => lines.push(`  - ${err}`));
  }

  return lines.join('\n') || 'Prior work recorded.';
}

function buildFallbackSummaryFromTranscript(transcript: string): string {
  const lines = transcript.split('\n').filter(Boolean);
  const recent = lines.slice(-30);
  return `**Conversation Summary** (truncated):\n${recent.map((l) => `  ${l}`).join('\n')}`;
}

function tryParseArgs(raw: string): Record<string, unknown> {
  try { return JSON.parse(raw) as Record<string, unknown>; }
  catch { return {}; }
}

function buildToolDetail(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case 'editor_insert_node':
      return `alias=${valueToString(args.alias, '?')} parent=${valueToString(args.parentId, '?')}`;
    case 'editor_update_props':
      return `node=${valueToString(args.nodeId, '?')}`;
    case 'editor_delete_node':
      return `node=${valueToString(args.nodeId, '?')}`;
    case 'editor_move_node':
      return `node=${valueToString(args.nodeId, '?')} → parent=${valueToString(args.parentId, '?')}`;
    case 'editor_create_page':
      return `name=${valueToString(args.name, '?')}`;
    case 'editor_delete_page':
      return `page=${valueToString(args.pageId, '?')}`;
    case 'editor_sync_navigation':
      return `target=${valueToString(args.semanticTarget, '?')}`;
    case 'apply_editor_edits':
      if (Array.isArray(args.operations)) {
        return `${args.operations.length} operation(s) — ${valueToString(args.reason)}`;
      }
      return '';
    default:
      return Object.keys(args).slice(0, 2).join(', ');
  }
}
