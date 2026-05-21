import type { ProviderMessage } from '../providers/types';
import { tokenCountWithEstimation } from '../utils/tokens';

const MAX_CONTEXT_TOKENS = 500_000;
const RECENT_CONTEXT_TARGET_TOKENS = 450_000;

export function compactConversation(messages: ProviderMessage[]): ProviderMessage[] {
  if (tokenCountWithEstimation(messages) <= MAX_CONTEXT_TOKENS) { return messages; }

  const system = messages.filter((m) => m.role === 'system');
  const nonSystem = messages.filter((m) => m.role !== 'system');

  const recent: ProviderMessage[] = [];
  for (let index = nonSystem.length - 1; index >= 0; index -= 1) {
    const next = [nonSystem[index], ...recent];
    if (tokenCountWithEstimation([...system, ...next]) > RECENT_CONTEXT_TARGET_TOKENS) {
      break;
    }
    recent.unshift(nonSystem[index]);
  }
  const old = nonSystem.slice(0, Math.max(0, nonSystem.length - recent.length));

  const summary = buildSummary(old);
  const note = [
    '[Compaction — prior context compressed]',
    '',
    summary,
    '',
    '[Continue from here. Do not repeat completed work. '
      + 'If a tool was already called, do not call it again with the same intent.]',
  ].join('\n');

  return [
    ...system,
    { role: 'user', content: note },
    ...recent,
  ];
}

function buildSummary(messages: ProviderMessage[]): string {
  if (messages.length === 0) {
    return 'Prior work recorded.';
  }

  const lines: string[] = [];
  const userMessages: string[] = [];

  for (const msg of messages) {
    if (msg.role === 'user' && typeof msg.content === 'string') {
      const text = msg.content.trim();
      // Skip system-injected messages
      if (text && !text.startsWith('[') && !text.startsWith('[系统提示]')) {
        userMessages.push(text.slice(0, 100));
      }
    }
    if (msg.role === 'tool_call' && msg.toolName) {
      const args = tryParseArgs(msg.toolArguments ?? '{}');
      const detail = buildToolDetail(msg.toolName, args);
      if (detail) {
        lines.push(`- Tool: ${msg.toolName} — ${detail}`);
      }
    }
    if (msg.role === 'tool_result' && typeof msg.content === 'string') {
      const truncated = msg.content.slice(0, 200);
      const isError = truncated.startsWith('{"error');
      if (isError) {
        try {
          const { error } = JSON.parse(msg.content) as { error?: string };
          if (error) {
            lines.push(`  Error: ${error.slice(0, 80)}`);
          }
        } catch { /* non-JSON content */ }
      }
    }
  }

  if (userMessages.length > 0) {
    // Deduplicate and show user requests
    const unique = [...new Set(userMessages)];
    if (unique.length > 1) {
      lines.unshift(
        `- User requests (${unique.length}): ${unique.map((m) => `"${m}"`).join(' | ')}`,
      );
    } else {
      lines.unshift(`- Goal: ${unique[0]}`);
    }
  }

  return lines.join('\n') || 'Prior work recorded.';
}

function tryParseArgs(raw: string): Record<string, unknown> {
  try { return JSON.parse(raw) as Record<string, unknown>; }
  catch { return {}; }
}

function buildToolDetail(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case 'generate_template':
      return `${stringArg(args.name, 'unnamed')} (${stringArg(args.category)})`;
    case 'apply_editor_edits':
      if (Array.isArray(args.operations)) {
        return `${args.operations.length} operation(s) — ${stringArg(args.reason)}`;
      }
      return '';
    default:
      return Object.keys(args).slice(0, 2).join(', ');
  }
}

function stringArg(value: unknown, fallback = ''): string {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return String(value);
  }

  return fallback;
}
