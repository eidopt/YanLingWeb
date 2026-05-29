import type { ProviderMessage } from '../providers/types';
import { tokenCountWithEstimation } from '../utils/tokens';

const MAX_CONTEXT_TOKENS = 500_000;
const RECENT_CONTEXT_TARGET_TOKENS = 450_000;

export function compactConversation(messages: ProviderMessage[]): ProviderMessage[] {
  if (tokenCountWithEstimation(messages) <= MAX_CONTEXT_TOKENS) {
    return messages;
  }

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

  return [
    ...system,
    {
      role: 'user',
      content: [
        '[Compaction Summary - prior context compressed]',
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
  if (messages.length === 0) {
    return 'Prior work recorded.';
  }

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
        const args = JSON.parse(msg.toolArguments ?? '{}') as { name?: string; category?: string };
        lines.push(`- Generated template: ${args.name ?? 'unnamed'} (${args.category ?? ''})`);
      } catch {
        /* ignore */
      }
    }
  }

  if (currentGoal) {
    lines.unshift(`- Goal: ${currentGoal}`);
  }
  return lines.join('\n') || 'Prior work recorded.';
}
