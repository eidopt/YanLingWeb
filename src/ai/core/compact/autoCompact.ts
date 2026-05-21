import type { ProviderMessage } from '../providers/types';
import { getContextWindow, tokenCountWithEstimation } from '../utils/tokens';

const COMPACT_CONTEXT_TOKEN_LIMIT = 500_000;
const MAX_FAILURES = 3;

export interface AutoCompactState {
  compacted: boolean;
  turnCounter: number;
  consecutiveFailures: number;
}

export function createAutoCompactState(): AutoCompactState {
  return { compacted: false, turnCounter: 0, consecutiveFailures: 0 };
}

export function getAutoCompactThreshold(model: string): number {
  return Math.min(getContextWindow(model), COMPACT_CONTEXT_TOKEN_LIMIT);
}

export function autoCompactIfNeeded(
  messages: ProviderMessage[],
  model: string,
  state: AutoCompactState,
  compactFn: (msgs: ProviderMessage[]) => ProviderMessage[],
): Promise<{ messages: ProviderMessage[]; state: AutoCompactState; wasCompacted: boolean }> {
  if (state.consecutiveFailures >= MAX_FAILURES) {
    return Promise.resolve({
      messages,
      state: { ...state, turnCounter: state.turnCounter + 1 },
      wasCompacted: false,
    });
  }

  const tokens = tokenCountWithEstimation(messages);
  if (tokens < getAutoCompactThreshold(model)) {
    return Promise.resolve({
      messages,
      state: { ...state, turnCounter: state.turnCounter + 1 },
      wasCompacted: false,
    });
  }

  try {
    const compacted = compactFn(messages);
    return Promise.resolve({
      messages: compacted,
      state: { compacted: true, turnCounter: 0, consecutiveFailures: 0 },
      wasCompacted: true,
    });
  } catch {
    return Promise.resolve({
      messages,
      state: {
        ...state,
        turnCounter: state.turnCounter + 1,
        consecutiveFailures: state.consecutiveFailures + 1,
      },
      wasCompacted: false,
    });
  }
}
