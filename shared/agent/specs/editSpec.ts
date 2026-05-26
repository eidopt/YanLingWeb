export interface UpdateSlotSpec {
  intent: 'update_slot';
  slotKey: string;
  props: Record<string, unknown>;
  pageKey?: string;
}

export interface FillPatternSpec {
  intent: 'fill_pattern';
  patternKey: string;
  items: Record<string, unknown>[];
  pageKey?: string;
  replaceExisting?: boolean;
}

export interface ReplaceSectionSpec {
  intent: 'replace_section';
  regionKey: string;
  sectionKind: string;
  content?: Record<string, unknown>;
  patternKey?: string;
  pageKey?: string;
}

export type EditSpec = UpdateSlotSpec | FillPatternSpec | ReplaceSectionSpec;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function isEditSpec(value: unknown): value is EditSpec {
  if (!isRecord(value)) {return false;}
  if (value.intent === 'update_slot') {
    return typeof value.slotKey === 'string' && isRecord(value.props);
  }
  if (value.intent === 'fill_pattern') {
    return typeof value.patternKey === 'string' && Array.isArray(value.items);
  }
  if (value.intent === 'replace_section') {
    return typeof value.regionKey === 'string' && typeof value.sectionKind === 'string';
  }
  return false;
}
