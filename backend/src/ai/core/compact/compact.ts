import type { ProviderMessage } from '../providers/types';

const KEEP_RECENT = 12;

export function compactConversation(messages: ProviderMessage[]): ProviderMessage[] {
  if (messages.length <= KEEP_RECENT + 1) { return messages; }

  const system = messages.filter((m) => m.role === 'system');
  const nonSystem = messages.filter((m) => m.role !== 'system');

  const recent = nonSystem.slice(-KEEP_RECENT);
  const old = nonSystem.slice(0, -KEEP_RECENT);

  const summary = buildSummary(old);

  return [
    ...system,
    {
      role: 'user',
      content: [
        '[Compaction Summary — prior context compressed]',
        '',
        summary,
        '',
        '[Continue from here. Do not repeat completed work.]',
      ].join('\n'),
    },
    ...recent,
  ];
}

function buildSummary(messages: ProviderMessage[]): string {
  if (messages.length === 0) { return 'Prior work recorded.'; }

  const lines: string[] = [];
  let currentGoal = '';

  for (const msg of messages) {
    if (msg.role === 'user' && typeof msg.content === 'string') {
      const text = msg.content.trim();
      if (text && !text.startsWith('[')) {
        currentGoal = text.slice(0, 120);
      }
    }
    if (msg.role === 'tool_call' && msg.toolName === 'generate_template') {
      try {
        const args = JSON.parse(msg.toolArguments ?? '{}') as { name?: string; category?: string; };
        lines.push(`- Generated template: ${args.name ?? 'unnamed'} (${args.category ?? ''})`);
      } catch { /* ignore */ }
    }
  }

  if (currentGoal) { lines.unshift(`- Goal: ${currentGoal}`); }
  return lines.join('\n') || 'Prior work recorded.';
}
