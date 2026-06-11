export type SemanticToolName =
  | 'editor_update_slot'
  | 'editor_fill_pattern'
  | 'editor_create_page_from_page_kind'
  | 'editor_replace_section'
  | 'editor_submit_page_spec';

const SEMANTIC_TOOL_NAMES: ReadonlySet<SemanticToolName> = new Set<SemanticToolName>([
  'editor_update_slot',
  'editor_fill_pattern',
  'editor_create_page_from_page_kind',
  'editor_replace_section',
  'editor_submit_page_spec',
]);

export function isSemanticTool(name: string): name is SemanticToolName {
  return SEMANTIC_TOOL_NAMES.has(name as SemanticToolName);
}

export function parseSemanticArgs(name: SemanticToolName, args: Record<string, unknown>): Record<string, unknown> {
  assertSemanticToolName(name);
  // Strip undefined values; keep structure as-is
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (value !== undefined) {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

export function assertSemanticToolName(name: string): asserts name is SemanticToolName {
  if (!isSemanticTool(name)) {
    throw new Error(`Unknown semantic tool: ${name}`);
  }
}
