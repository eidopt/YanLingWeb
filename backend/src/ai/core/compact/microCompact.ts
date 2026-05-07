import type { ProviderMessage } from '../providers/types';

const COMPACTABLE_TOOLS = new Set<string>([
  'generate_template',
  'validate_template',
]);

const DEFAULT_KEEP_RECENT = 10;
const LARGE_RESULT_THRESHOLD = 1000;
const CLEARED_MESSAGE = '[Old tool result content cleared]';

export function microcompactMessages(
  messages: ProviderMessage[],
  keepRecent = DEFAULT_KEEP_RECENT,
): ProviderMessage[] {
  const compactableIds: string[] = [];

  for (const msg of messages) {
    if (
      msg.role === 'tool_call'
      && msg.toolCallId
      && msg.toolName
      && COMPACTABLE_TOOLS.has(msg.toolName)
    ) {
      compactableIds.push(msg.toolCallId);
    }
  }

  if (compactableIds.length === 0) { return messages; }

  const sizeMap = new Map<string, number>();
  for (const msg of messages) {
    if (msg.role === 'tool_result' && msg.toolCallId) {
      const content = typeof msg.content === 'string' ? msg.content : '';
      sizeMap.set(msg.toolCallId, content.length);
    }
  }

  const large = compactableIds.filter((id) => (sizeMap.get(id) ?? 0) >= LARGE_RESULT_THRESHOLD);
  const keepSet = new Set(large.slice(-Math.max(1, keepRecent)));
  const clearSet = new Set(large.filter((id) => !keepSet.has(id)));

  if (clearSet.size === 0) { return messages; }

  return messages.map((msg) => {
    if (msg.role !== 'tool_result' || !msg.toolCallId || !clearSet.has(msg.toolCallId)) {
      return msg;
    }
    const content = typeof msg.content === 'string' ? msg.content : '';
    if (content === CLEARED_MESSAGE) { return msg; }
    return { ...msg, content: CLEARED_MESSAGE };
  });
}
