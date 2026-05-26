/* eslint-disable no-control-regex */
const KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_.-]{2,127}$/;
const SENSITIVE_PATTERNS = [
  /api[_-]?key/i,
  /secret/i,
  /token/i,
  /password/i,
  /authorization/i,
  /bearer\s+[a-z0-9._-]+/i,
];

export function validateSemanticKeyFormat(key: string): boolean {
  return KEY_PATTERN.test(key);
}

export function sanitizeSemanticInput(input: string, maxLength = 500): string {
  return input
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .trim()
    .slice(0, maxLength);
}

export function maskNodeId(nodeId: string): string {
  if (nodeId.length <= 6) {
    return '***';
  }
  if (nodeId.length <= 12) {
    return `${nodeId.slice(0, 3)}...${nodeId.slice(-2)}`;
  }
  return `${nodeId.slice(0, 8)}...${nodeId.slice(-4)}`;
}

export function containsSensitiveData(value: unknown): boolean {
  if (value == null) {
    return false;
  }
  if (typeof value === 'string') {
    return SENSITIVE_PATTERNS.some((pattern) => pattern.test(value));
  }
  if (Array.isArray(value)) {
    return value.some((item) => containsSensitiveData(item));
  }
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).some(([key, item]) => (
      SENSITIVE_PATTERNS.some((pattern) => pattern.test(key)) || containsSensitiveData(item)
    ));
  }
  return false;
}
