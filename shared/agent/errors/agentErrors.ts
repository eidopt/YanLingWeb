export type AgentEditError =
  | { code: 'slot_not_found'; slotKey: string; availableSlots: string[]; recoverable: true }
  | { code: 'pattern_not_found'; patternKey: string; availablePatterns: string[]; recoverable: true }
  | { code: 'page_kind_not_found'; pageKind: string; availablePageKinds: string[]; recoverable: true }
  | { code: 'region_not_found'; regionKey: string; availableRegions: string[]; recoverable: true }
  | { code: 'invalid_props'; slot: string; invalidProps: string[]; allowedProps: string[]; recoverable: true }
  | { code: 'invalid_component'; slot: string; expected: string; actual: string; recoverable: false }
  | { code: 'device_violation'; device: string; violation: string; recoverable: true }
  | { code: 'compile_failed'; reason: string; recoverable: boolean }
  | { code: 'reference_page_not_found'; pageKind: string; recoverable: true }
  | { code: 'navigation_sync_failed'; reason: string; recoverable: false }
  | { code: 'apply_failed'; reason: string; partialSuccess: boolean; recoverable: false }
  | { code: 'version_conflict'; expected: number; actual: number; recoverable: true }
  | { code: 'atomic_rollback_failed'; reason: string; recoverable: false }
  | { code: 'operation_not_found'; reason: string; recoverable: false }
  | { code: 'invalid_spec'; reason: string; recoverable: true };

export interface AgentEditResult<T = void> {
  success: boolean;
  data?: T;
  error?: AgentEditError;
  warnings?: string[];
}

export const MVP_RETRY_CONFIG = {
  maxRetries: 2,
  retryableErrors: ['slot_not_found', 'pattern_not_found', 'version_conflict', 'page_kind_not_found'] as const,
  backoff: {
    initialMs: 100,
    maxMs: 1000,
    multiplier: 2,
  },
};

export function isRetryableAgentEditError(error: AgentEditError): boolean {
  return error.recoverable === true && MVP_RETRY_CONFIG.retryableErrors.includes(error.code as never);
}
