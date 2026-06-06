/**
 * Type guard utilities shared across the backend.
 * Eliminates duplication between TemplatesService, template-layout-validation,
 * and shared/theme-layout/migrations.
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === 'string');
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isCssVarRecord(value: unknown): value is Record<string, string> {
  return isStringRecord(value) && Object.keys(value).every((key) => key.startsWith('--'));
}
