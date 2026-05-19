import type { ProviderMessage } from '../providers/types';

const DEFAULT_KEEP_RECENT = 6;
const LARGE_RESULT_THRESHOLD = 1000;
const TRUNCATE_HEAD = 200;
const TRUNCATE_TAIL = 80;

function truncateContent(content: string, toolName: string): string {
  if (content.length <= TRUNCATE_HEAD + TRUNCATE_TAIL + 60) {
    return content;
  }

  const head = content.slice(0, TRUNCATE_HEAD);
  const tail = content.slice(-TRUNCATE_TAIL);

  let resultType = '';
  try {
    const parsed = JSON.parse(content) as unknown;
    if (parsed && typeof parsed === 'object') {
      const result = parsed as Record<string, unknown>;
      resultType = result.error ? 'error' : (result.success ? 'success' : '');
    }
  } catch { /* non-JSON content */ }

  return [
    `[Tool result truncated — ${toolName} (${resultType || 'content'}):`,
    `  original ${content.length} chars → ${TRUNCATE_HEAD + TRUNCATE_TAIL} retained]`,
    '',
    head,
    '...',
    tail,
  ].join('\n');
}

export function microcompactMessages(
  messages: ProviderMessage[],
  keepRecent = DEFAULT_KEEP_RECENT,
): ProviderMessage[] {
  // Track ALL tool calls (not just a whitelist) for potential compaction
  const toolIdsInOrder: string[] = [];

  for (const msg of messages) {
    if (msg.role === 'tool_call' && msg.toolCallId) {
      toolIdsInOrder.push(msg.toolCallId);
    }
  }

  if (toolIdsInOrder.length === 0) {
    return messages;
  }

  // Build size map and tool name map for all tool results
  const sizeMap = new Map<string, number>();
  const nameMap = new Map<string, string>();
  for (const msg of messages) {
    if (msg.role === 'tool_result' && msg.toolCallId) {
      const content = typeof msg.content === 'string' ? msg.content : '';
      sizeMap.set(msg.toolCallId, content.length);
    }
    if (msg.role === 'tool_call' && msg.toolCallId && msg.toolName) {
      nameMap.set(msg.toolCallId, msg.toolName);
    }
  }

  // Keep only large tool results for compaction consideration
  const large = toolIdsInOrder.filter(
    (id) => (sizeMap.get(id) ?? 0) >= LARGE_RESULT_THRESHOLD,
  );

  if (large.length <= keepRecent) {
    return messages;
  }

  // Keep the most recent N large results, truncate the rest
  const keepSet = new Set(large.slice(-keepRecent));
  const trimSet = new Set(large.filter((id) => !keepSet.has(id)));

  if (trimSet.size === 0) {
    return messages;
  }

  return messages.map((msg) => {
    if (
      msg.role !== 'tool_result'
      || !msg.toolCallId
      || !trimSet.has(msg.toolCallId)
    ) {
      return msg;
    }
    const content = typeof msg.content === 'string' ? msg.content : '';
    if (content.includes('[Tool result truncated')) {
      return msg;
    }
    const toolName = nameMap.get(msg.toolCallId) ?? 'unknown';
    return { ...msg, content: truncateContent(content, toolName) };
  });
}
