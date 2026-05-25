import type { AIProvider, ProviderMessage } from '../providers/types';
import { compactConversation, compactConversationWithLLM, needsCompaction } from './compact';

const MAX_FAILURES = 3;

export interface AutoCompactState {
  compacted: boolean;
  turnCounter: number;
  consecutiveFailures: number;
}

export function createAutoCompactState(): AutoCompactState {
  return { compacted: false, turnCounter: 0, consecutiveFailures: 0 };
}

export interface AutoCompactOptions {
  provider?: AIProvider;
  compactionModel?: string;
  forceSynchronous?: boolean;
}

/**
 * Check if compaction is needed and apply it.
 * Uses model-specific context window threshold via needsCompaction(messages, model).
 * When provider is available, uses LLM-based semantic compaction.
 * Falls back to synchronous rule-based compaction otherwise.
 */
export async function autoCompactIfNeeded(
  messages: ProviderMessage[],
  model: string,
  state: AutoCompactState,
  options?: AutoCompactOptions,
): Promise<{ messages: ProviderMessage[]; state: AutoCompactState; wasCompacted: boolean }> {
  if (state.consecutiveFailures >= MAX_FAILURES) {
    return {
      messages,
      state: { ...state, turnCounter: state.turnCounter + 1 },
      wasCompacted: false,
    };
  }

  if (!needsCompaction(messages, model)) {
    return {
      messages,
      state: { ...state, turnCounter: state.turnCounter + 1 },
      wasCompacted: false,
    };
  }

  try {
    let compacted: ProviderMessage[];

    if (options?.provider && !options.forceSynchronous) {
      // LLM-based semantic compaction
      compacted = await compactConversationWithLLM(
        messages,
        options.provider,
        options.compactionModel,
      );
    } else {
      // Synchronous fallback
      compacted = compactConversation(messages, model);
    }

    return {
      messages: compacted,
      state: { compacted: true, turnCounter: 0, consecutiveFailures: 0 },
      wasCompacted: true,
    };
  } catch {
    return {
      messages,
      state: {
        ...state,
        turnCounter: state.turnCounter + 1,
        consecutiveFailures: state.consecutiveFailures + 1,
      },
      wasCompacted: false,
    };
  }
}
