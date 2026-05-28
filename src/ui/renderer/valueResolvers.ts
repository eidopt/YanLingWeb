export function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

export function asNumber(value: unknown, fallback: number) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

export function asBoolean(value: unknown, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

export function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

export function asCssLength(value: unknown, fallback = '') {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `${value}px`;
  }

  if (typeof value !== 'string') {
    return fallback;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }

  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    return `${trimmed}px`;
  }

  if (
    trimmed === '0' ||
    trimmed === 'auto' ||
    /^-?\d+(?:\.\d+)?(?:px|%|rem|em|vh|vw|vmin|vmax|svh|svw|lvh|lvw|dvh|dvw|ch|ex)$/.test(trimmed) ||
    /^(?:var|calc|min|max|clamp)\(.+\)$/.test(trimmed)
  ) {
    return trimmed;
  }

  return fallback;
}
