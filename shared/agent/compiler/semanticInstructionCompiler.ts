import type { EditorAiEditInstruction } from '../editor/applyEditorInstructions';
import type { AgentEditResult } from '../errors/agentErrors';
import type { EditSpec, FillPatternSpec, ReplaceSectionSpec, UpdateSlotSpec } from '../specs/editSpec';
import type { PageSpec } from '../specs/pageSpec';
import { buildTemplateProfile } from '../template/buildTemplateProfile';
import type { TemplateProfile } from '../template/templateProfile';
import { resolvePageByKind, resolvePattern, resolveRegion, resolveSlot } from '../template/templateProfileResolver';
import { sanitizeSemanticInput } from '../template/templateSecurity';
import type { ThemeLayoutDocument, ThemeLayoutNode } from '../types';

export type SemanticEditorInstruction =
  | ({ type: 'submit_page_spec'; spec: PageSpec; select?: boolean } & SemanticInstructionTarget)
  | ({
      type: 'update_slot';
      slotKey: string;
      props: Record<string, unknown>;
      select?: boolean;
    } & SemanticInstructionTarget)
  | ({
      type: 'fill_pattern';
      patternKey: string;
      items: Record<string, unknown>[];
      replaceExisting?: boolean;
      select?: boolean;
    } & SemanticInstructionTarget)
  | ({
      type: 'create_page_from_page_kind';
      pageKind: string;
      name: string;
      contentIntent?: string;
      select?: boolean;
      activate?: boolean;
      syncNavigation?: boolean;
    } & SemanticInstructionTarget)
  | ({
      type: 'replace_section';
      regionKey: string;
      sectionKind: string;
      content?: Record<string, unknown>;
      patternKey?: string;
      select?: boolean;
    } & SemanticInstructionTarget);

export interface SemanticInstructionTarget {
  pageKey?: string;
  pageId?: string;
  semanticTarget?: string;
  target?: string;
}

export interface CompiledSemanticInstruction {
  operations: EditorAiEditInstruction[];
  profile: TemplateProfile;
  warnings: string[];
}

export function isSemanticEditorInstruction(instruction: { type: string }): instruction is SemanticEditorInstruction {
  return ['submit_page_spec', 'update_slot', 'fill_pattern', 'create_page_from_page_kind', 'replace_section'].includes(
    instruction.type,
  );
}

function ok(data: CompiledSemanticInstruction): AgentEditResult<CompiledSemanticInstruction> {
  return { success: true, data };
}

function slug(value: string, fallback = 'generated'): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || fallback;
}

function uniquePageId(document: ThemeLayoutDocument, base: string): string {
  const used = new Set(document.pages.map((page) => page.id));
  let candidate = base;
  let index = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${index}`;
    index += 1;
  }
  return candidate;
}

function allowedPropsForSlot(profile: TemplateProfile, slotKey: string, props: Record<string, unknown>) {
  const slotResult = resolveSlot(profile, slotKey);
  if (!slotResult.success || !slotResult.data) {
    return slotResult;
  }
  const allowed = new Set(slotResult.data.editableProps);
  const invalid = Object.keys(props).filter((prop) => !allowed.has(prop));
  if (invalid.length > 0) {
    return {
      success: false as const,
      error: {
        code: 'invalid_props' as const,
        slot: slotKey,
        invalidProps: invalid,
        allowedProps: slotResult.data.editableProps,
        recoverable: true as const,
      },
    };
  }
  return slotResult;
}

function compileUpdateSlot(
  profile: TemplateProfile,
  spec: UpdateSlotSpec,
): AgentEditResult<CompiledSemanticInstruction> {
  const slotResult = allowedPropsForSlot(profile, spec.slotKey, spec.props);
  if (!slotResult.success || !slotResult.data) {
    return { success: false, error: slotResult.error };
  }
  return ok({
    profile,
    warnings: [],
    operations: [
      {
        type: 'update_props',
        pageId: spec.pageKey ? profile.pages.find((page) => page.pageKey === spec.pageKey)?.pageId : undefined,
        nodeId: slotResult.data.nodeId,
        props: spec.props,
        select: true,
      },
    ],
  });
}

function compileCreatePageFromKind(
  document: ThemeLayoutDocument,
  profile: TemplateProfile,
  pageKind: string,
  name: string,
  options: { activate?: boolean; select?: boolean; syncNavigation?: boolean } = {},
): AgentEditResult<CompiledSemanticInstruction> {
  const pageResult = resolvePageByKind(profile, pageKind);
  if (!pageResult.success || !pageResult.data) {
    return { success: false, error: pageResult.error };
  }
  const safeName = sanitizeSemanticInput(name, 80) || '新页面';
  const pageId = uniquePageId(document, slug(safeName, `${pageKind}-page`));
  return ok({
    profile,
    warnings: [],
    operations: [
      {
        type: 'create_page_from_reference',
        pageId,
        name: safeName,
        referencePageId: pageResult.data.pageId,
        rootNodeId: `${pageId}-screen`,
        rootProps: { title: safeName },
        activate: options.activate ?? true,
        select: options.select ?? true,
        syncNavigation: options.syncNavigation ?? true,
      },
    ],
  });
}

function compileFillPattern(
  profile: TemplateProfile,
  spec: FillPatternSpec,
): AgentEditResult<CompiledSemanticInstruction> {
  const patternResult = resolvePattern(profile, spec.patternKey);
  if (!patternResult.success || !patternResult.data) {
    return { success: false, error: patternResult.error };
  }
  const pattern = patternResult.data;
  const warnings: string[] = [];
  const pageId = profile.pages.find((page) => page.pageKey === pattern.pageKey)?.pageId;
  const items = spec.items.slice(0, pattern.maxItems ?? 50);
  const fields = pattern.fields.flatMap((field) => {
    const slot = profile.slots.find((profileSlot) => profileSlot.slotKey === field.slotKey);
    if (!slot) {
      warnings.push(`Pattern field ${field.fieldKey} references missing slot ${field.slotKey}`);
      return [];
    }
    return [
      {
        fieldKey: field.fieldKey,
        referenceNodeId: slot.nodeId,
        prop: field.prop,
        required: field.required,
      },
    ];
  });

  if (items.length < (pattern.minItems ?? 0)) {
    warnings.push(`Pattern ${pattern.patternKey} received ${items.length} items, below minItems ${pattern.minItems}`);
  }

  return ok({
    profile,
    warnings,
    operations: [
      {
        type: 'clone_pattern_items',
        pageId,
        sourceRootNodeId: pattern.sourceRootNodeId,
        parentId: pattern.parentNodeId,
        replaceExisting: spec.replaceExisting ?? true,
        select: true,
        items,
        fields,
      },
    ],
  });
}

function compileReplaceSection(
  profile: TemplateProfile,
  spec: ReplaceSectionSpec,
): AgentEditResult<CompiledSemanticInstruction> {
  const regionResult = resolveRegion(profile, spec.regionKey);
  if (!regionResult.success || !regionResult.data) {
    return { success: false, error: regionResult.error };
  }
  const region = regionResult.data;
  if (!region.replaceable) {
    return {
      success: false,
      error: { code: 'compile_failed', reason: `Region is not replaceable: ${spec.regionKey}`, recoverable: true },
    };
  }
  const operations: EditorAiEditInstruction[] = [];
  const text =
    typeof spec.content?.title === 'string'
      ? spec.content.title
      : typeof spec.content?.text === 'string'
        ? spec.content.text
        : undefined;
  if (text) {
    const slot = profile.slots.find(
      (item) => item.regionKey === region.regionKey && item.editableProps.includes('text'),
    );
    if (slot) {
      operations.push({
        type: 'update_props',
        pageId: profile.pages.find((page) => page.pageKey === region.pageKey)?.pageId,
        nodeId: slot.nodeId,
        props: { text },
        select: true,
      });
    }
  }
  if (operations.length === 0) {
    return {
      success: false,
      error: {
        code: 'compile_failed',
        reason: `No editable slots found for region: ${spec.regionKey}`,
        recoverable: true,
      },
    };
  }
  return ok({ profile, operations, warnings: [] });
}

function pageSpecToEditSpecs(spec: PageSpec): EditSpec[] {
  const edits: EditSpec[] = [];
  for (const section of spec.sections ?? []) {
    if (section.patternKey && section.items?.length) {
      edits.push({
        intent: 'fill_pattern',
        patternKey: section.patternKey,
        items: section.items,
      } satisfies FillPatternSpec);
      continue;
    }
    if (section.regionKey) {
      edits.push({
        intent: 'replace_section',
        regionKey: section.regionKey,
        sectionKind: section.sectionKind,
        content: section.content ?? { title: section.title },
      } satisfies ReplaceSectionSpec);
    }
  }
  return edits;
}

export function compileSemanticEditorInstruction(
  document: ThemeLayoutDocument,
  instruction: SemanticEditorInstruction,
  profile = buildTemplateProfile(document),
): AgentEditResult<CompiledSemanticInstruction> {
  if (instruction.type === 'update_slot') {
    return compileUpdateSlot(profile, {
      intent: 'update_slot',
      slotKey: instruction.slotKey,
      props: instruction.props,
      pageKey: instruction.pageKey,
    });
  }
  if (instruction.type === 'create_page_from_page_kind') {
    return compileCreatePageFromKind(document, profile, instruction.pageKind, instruction.name, instruction);
  }
  if (instruction.type === 'fill_pattern') {
    return compileFillPattern(profile, {
      intent: 'fill_pattern',
      patternKey: instruction.patternKey,
      items: instruction.items,
      replaceExisting: instruction.replaceExisting,
      pageKey: instruction.pageKey,
    });
  }
  if (instruction.type === 'replace_section') {
    return compileReplaceSection(profile, {
      intent: 'replace_section',
      regionKey: instruction.regionKey,
      sectionKind: instruction.sectionKind,
      content: instruction.content,
      patternKey: instruction.patternKey,
      pageKey: instruction.pageKey,
    });
  }

  if (instruction.spec.intent === 'create_page') {
    if (!instruction.spec.pageKind) {
      return {
        success: false,
        error: {
          code: 'invalid_spec',
          reason: 'create_page requires pageKind',
          recoverable: true,
        },
      };
    }
    const createResult = compileCreatePageFromKind(
      document,
      profile,
      instruction.spec.pageKind,
      instruction.spec.title ?? instruction.spec.pageKind,
      { select: instruction.select },
    );
    if (!createResult.success || !createResult.data) {
      return createResult;
    }
    return createResult;
  }

  const editSpecs = pageSpecToEditSpecs(instruction.spec);
  const operations: EditorAiEditInstruction[] = [];
  const warnings: string[] = [];
  for (const editSpec of editSpecs) {
    const result =
      editSpec.intent === 'fill_pattern'
        ? compileFillPattern(profile, editSpec)
        : editSpec.intent === 'replace_section'
          ? compileReplaceSection(profile, editSpec)
          : compileUpdateSlot(profile, editSpec);
    if (!result.success || !result.data) {
      return result;
    }
    operations.push(...result.data.operations);
    warnings.push(...result.data.warnings);
  }
  return ok({ profile, operations, warnings });
}

export function findNode(root: ThemeLayoutNode, nodeId: string): ThemeLayoutNode | null {
  if (root.id === nodeId) {
    return root;
  }
  for (const child of root.children ?? []) {
    const found = findNode(child, nodeId);
    if (found) {
      return found;
    }
  }
  return null;
}
