export type ConversationHistoryAction = 'ignore' | 'keep' | 'replace';

export interface ConversationHistoryDecisionInput {
  requestEpoch: number;
  currentEpoch: number;
  live: boolean;
  localCompletedCount: number;
  remoteCount: number;
}

/**
 * History is a snapshot, not a stream.
 * A live run or a newer local transcript wins over a late remote payload.
 */
export function decideConversationHistoryLoad(
  input: ConversationHistoryDecisionInput,
): ConversationHistoryAction {
  if (input.live || input.requestEpoch !== input.currentEpoch) {
    return 'ignore';
  }
  if (input.remoteCount === 0 || input.localCompletedCount > input.remoteCount) {
    return 'keep';
  }
  return 'replace';
}
