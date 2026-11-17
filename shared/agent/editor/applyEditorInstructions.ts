import {
  compileSemanticEditorInstruction,
  isSemanticEditorInstruction,
  type SemanticEditorInstruction,
} from '../compiler/semanticInstructionCompiler';
import type { LayoutNodeFrame, LayoutNodeLayout, ThemeLayoutDocument, ThemeLayoutNodeInteractions } from '../types';
import { validateThemeLayoutDocument } from '../validation/themeLayoutValidator';
import {
  type ApplyOneResult,
  buildNode,
  cloneDocument,
  coerceProps,
  CONTAINER_ALIASES,
  descriptorForAlias,
  findNode,
  findParentId,
  multiStrategyResolveNodeId,
  normalizeChildOrder,
  removeNode,
  resolveTargetPage,
  sanitizeFramePatch,
  sanitizeLayoutPatch,
  syncPageNavigation,
  syncRootLayout,
} from './applyEditorInstructions.helpers';
import {
  applyClonePatternItems,
  applyCreatePage,
  applyCreatePageFromReference,
  applyDeletePage,
} from './applyEditorInstructions.operations';

export type {
  ApplyEditorAiEditInstructionsOptions,
  ApplyEditorAiEditInstructionsResult,
  EditorAiInstructionTarget,
  NodeResolutionCandidate,
  NodeResolutionErrorInfo,
} from './applyEditorInstructions.helpers';
export { findNode } from './applyEditorInstructions.helpers';

import type {
  ApplyEditorAiEditInstructionsOptions,
  ApplyEditorAiEditInstructionsResult,
  EditorAiInstructionTarget,
} from './applyEditorInstructions.helpers';

export type EditorAiEditInstruction =
  | SemanticEditorInstruction
  | ({
      type: 'create_page';
      pageId: string;
      name?: string;
      rootNodeId?: string;
      props?: Record<string, unknown>;
      layout?: Partial<LayoutNodeLayout>;
      select?: boolean;
      activate?: boolean;
    } & EditorAiInstructionTarget)
  | ({
      type: 'create_page_from_reference';
      pageId: string;
      name: string;
      referencePageId: string;
      rootNodeId?: string;
      rootProps?: Record<string, unknown>;
      referenceNodeUpdates?: {
        referenceNodeId: string;
        props: Record<string, unknown>;
      }[];
      omitReferenceNodeIds?: string[];
      select?: boolean;
      activate?: boolean;
      syncNavigation?: boolean;
    } & EditorAiInstructionTarget)
  | ({
      type: 'delete_page';
      name?: string;
      select?: boolean;
      activate?: boolean;
    } & EditorAiInstructionTarget)
  | ({ type: 'sync_page_navigation'; select?: boolean } & EditorAiInstructionTarget)
  | ({ type: 'sync_footer_tabs'; select?: boolean } & EditorAiInstructionTarget)
  | ({
      type: 'insert_node';
      alias: string;
      nodeId?: string;
      parentId?: string;
      targetId?: string;
      position?: 'before' | 'after' | 'inside_end';
      axis?: 'horizontal' | 'vertical';
      props?: Record<string, unknown>;
      layout?: Partial<LayoutNodeLayout>;
      frame?: Partial<LayoutNodeFrame>;
      select?: boolean;
    } & EditorAiInstructionTarget)
  | ({
      type: 'clone_pattern_items';
      sourceRootNodeId: string;
      parentId?: string;
      replaceExisting?: boolean;
      select?: boolean;
      items: Record<string, unknown>[];
      fields: {
        fieldKey: string;
        referenceNodeId: string;
        prop: string;
        required?: boolean;
      }[];
    } & EditorAiInstructionTarget)
  | ({
      type: 'update_props';
      nodeId?: string;
      props: Record<string, unknown>;
      select?: boolean;
    } & EditorAiInstructionTarget)
  | ({
      type: 'set_layout';
      nodeId?: string;
      layout: Partial<LayoutNodeLayout>;
      select?: boolean;
    } & EditorAiInstructionTarget)
  | ({
      type: 'set_frame';
      nodeId?: string;
      frame: Partial<LayoutNodeFrame>;
      select?: boolean;
    } & EditorAiInstructionTarget)
  | ({
      type: 'move_node';
      nodeId?: string;
      parentId?: string;
      targetId?: string;
      position?: 'before' | 'after' | 'inside_end';
      axis?: 'horizontal' | 'vertical';
      select?: boolean;
    } & EditorAiInstructionTarget)
  | ({ type: 'delete_node'; nodeId?: string } & EditorAiInstructionTarget)
  | ({
      type: 'update_interactions';
      nodeId?: string;
      interactions: Partial<ThemeLayoutNodeInteractions>;
      select?: boolean;
    } & EditorAiInstructionTarget);

function applyOneInstruction(
  document: ThemeLayoutDocument,
  instruction: EditorAiEditInstruction,
  options?: ApplyEditorAiEditInstructionsOptions,
): ApplyOneResult {
  if (isSemanticEditorInstruction(instruction)) {
    const compiled = compileSemanticEditorInstruction(document, instruction);
    if (!compiled.success || !compiled.data) {
      return { document, error: JSON.stringify(compiled.error) };
    }
    let nextDocument = document;
    const messages: string[] = [];
    let selectedNodeId: string | null | undefined;
    for (const operation of compiled.data.operations) {
      const result = applyOneInstruction(nextDocument, operation, options);
      if (result.error) {
        return { document, error: result.error };
      }
      nextDocument = result.document;
      if (result.message) {
        messages.push(result.message);
      }
      if (result.selectedNodeId !== undefined) {
        selectedNodeId = result.selectedNodeId;
      }
    }
    return {
      document: nextDocument,
      message: messages.length
        ? `Semantic ${instruction.type}: ${messages.join('; ')}`
        : `Semantic ${instruction.type} compiled`,
      selectedNodeId,
    };
  }

  if (instruction.type === 'create_page') {
    return applyCreatePage(document, instruction);
  }
  if (instruction.type === 'create_page_from_reference') {
    return applyCreatePageFromReference(document, instruction);
  }
  if (instruction.type === 'clone_pattern_items') {
    return applyClonePatternItems(document, instruction);
  }
  if (instruction.type === 'delete_page') {
    return applyDeletePage(document, instruction);
  }
  if (instruction.type === 'sync_page_navigation' || instruction.type === 'sync_footer_tabs') {
    syncPageNavigation(document);
    syncRootLayout(document);
    return { document, message: 'Synced page navigation' };
  }

  const page = resolveTargetPage(document, instruction.pageId);
  if (!page) {
    return { document, error: `Page not found: ${instruction.pageId ?? document.defaultPageId}` };
  }

  if (instruction.type === 'insert_node') {
    // semanticTarget as parentId takes priority over root default
    let effectiveParentId = instruction.parentId;
    if (!effectiveParentId && instruction.semanticTarget && options?.resolveSemanticTarget) {
      const semResult = options.resolveSemanticTarget(document, instruction.semanticTarget, options.selectedNodeId);
      if (semResult) {
        effectiveParentId = semResult.nodeId;
      }
    }
    // Fall back to root only if neither parentId nor semanticTarget resolved
    effectiveParentId ??= page.layout.id;

    const parentResolution = multiStrategyResolveNodeId({
      root: page.layout,
      document,
      instruction,
      requestedId: effectiveParentId,
      selectedNodeId: options?.selectedNodeId,
      parentId: undefined,
      alias: undefined,
      resolveSemanticTarget: options?.resolveSemanticTarget,
    });
    if (!parentResolution.resolvedId || !parentResolution.node) {
      if (parentResolution.error) {
        return { document, error: JSON.stringify(parentResolution.error) };
      }
      return { document, error: `AI referenced unknown parentId: ${instruction.parentId ?? page.layout.id}` };
    }
    const parent = parentResolution.node;
    if (!CONTAINER_ALIASES.has(parent.alias)) {
      const validContainers = [...CONTAINER_ALIASES].join(', ');
      return {
        document,
        error: `Node ${parentResolution.resolvedId} (${parent.alias}) cannot receive children. ` +
          `Valid container aliases: ${validContainers}. Pick one of these as parentId.`,
      };
    }
    const built = buildNode(document, instruction.alias, instruction.nodeId, instruction.props, instruction.layout);
    if (built.error || !built.node) {
      return { document, error: built.error ?? 'Failed to build inserted node' };
    }
    if (instruction.frame) {
      built.node.layout.mode = 'absolute';
      built.node.frame = { position: 'absolute', ...sanitizeFramePatch(instruction.frame) };
    }
    parent.children ??= [];
    if (instruction.targetId && instruction.position && instruction.position !== 'inside_end') {
      const targetResolution = multiStrategyResolveNodeId({
        root: page.layout,
        document,
        instruction,
        requestedId: instruction.targetId,
        selectedNodeId: options?.selectedNodeId,
        resolveSemanticTarget: options?.resolveSemanticTarget,
      });
      if (!targetResolution.resolvedId) {
        if (targetResolution.error) {
          return { document, error: JSON.stringify(targetResolution.error) };
        }
        return { document, error: `AI referenced unknown targetId: ${instruction.targetId}` };
      }
      const targetId = targetResolution.resolvedId;
      const index = parent.children.findIndex((child) => child.id === targetId);
      if (index >= 0) {
        parent.children.splice(instruction.position === 'before' ? index : index + 1, 0, built.node);
      } else {
        return {
          document,
          error: `Resolved targetId ${targetId} not found among children of ${parentResolution.resolvedId}`,
        };
      }
    } else {
      parent.children.push(built.node);
    }
    normalizeChildOrder(parent);
    syncRootLayout(document);
    return {
      document,
      message: `Inserted ${instruction.alias}`,
      selectedNodeId: instruction.select === false ? undefined : built.node.id,
    };
  }

  const nodeResolution = multiStrategyResolveNodeId({
    root: page.layout,
    document,
    instruction,
    requestedId: instruction.nodeId,
    selectedNodeId: options?.selectedNodeId,
    resolveSemanticTarget: options?.resolveSemanticTarget,
  });
  if (!nodeResolution.resolvedId || !nodeResolution.node) {
    if (nodeResolution.error) {
      return { document, error: JSON.stringify(nodeResolution.error) };
    }
    return { document, error: `Node not found: ${instruction.nodeId}` };
  }
  const nodeId = nodeResolution.resolvedId;
  const target = nodeResolution.node;

  if (instruction.type === 'update_props') {
    if (Object.keys(instruction.props).length === 0) {
      return { document, error: 'update_props requires at least one prop to update' };
    }
    const descriptor = descriptorForAlias(document, target.alias);
    if (!descriptor) {
      return { document, error: `Unknown component alias: ${target.alias}` };
    }
    const coerced = coerceProps(descriptor, instruction.props);
    if (coerced.errors.length > 0) {
      return { document, error: coerced.errors.join('; ') };
    }
    target.props = { ...(target.props ?? {}), ...coerced.props };
    syncRootLayout(document);
    return {
      document,
      message: `Updated ${nodeId} props`,
      selectedNodeId: instruction.select === false ? undefined : nodeId,
    };
  }

  if (instruction.type === 'set_layout') {
    target.layout = { ...target.layout, ...sanitizeLayoutPatch(instruction.layout) };
    syncRootLayout(document);
    return {
      document,
      message: `Updated ${nodeId} layout`,
      selectedNodeId: instruction.select === false ? undefined : nodeId,
    };
  }

  if (instruction.type === 'set_frame') {
    target.layout = { ...target.layout, mode: 'absolute' };
    target.frame = { position: 'absolute', ...target.frame, ...sanitizeFramePatch(instruction.frame) };
    syncRootLayout(document);
    return {
      document,
      message: `Updated ${nodeId} frame`,
      selectedNodeId: instruction.select === false ? undefined : nodeId,
    };
  }

  if (instruction.type === 'delete_node') {
    if (nodeId === page.layout.id) {
      return { document, error: 'Cannot delete the root screen node' };
    }
    if (!removeNode(page.layout, nodeId)) {
      return { document, error: `Node not found: ${instruction.nodeId}` };
    }
    syncRootLayout(document);
    return { document, message: `Deleted ${nodeId}`, selectedNodeId: null };
  }

  if (instruction.type === 'move_node') {
    if (nodeId === page.layout.id) {
      return { document, error: 'Cannot move the root screen node' };
    }
    let parentId = instruction.parentId ?? findParentId(page.layout, nodeId);
    if (instruction.parentId && !findNode(page.layout, instruction.parentId)) {
      const parentResolution = multiStrategyResolveNodeId({
        root: page.layout,
        document,
        instruction,
        requestedId: instruction.parentId,
        selectedNodeId: options?.selectedNodeId,
        resolveSemanticTarget: options?.resolveSemanticTarget,
      });
      if (parentResolution.resolvedId) {
        parentId = parentResolution.resolvedId;
      }
    }
    const parent = parentId ? findNode(page.layout, parentId) : null;
    if (!parent || !CONTAINER_ALIASES.has(parent.alias)) {
      return { document, error: `Invalid target parent: ${parentId ?? ''}` };
    }
    if (!removeNode(page.layout, nodeId)) {
      return { document, error: `Node not found: ${instruction.nodeId}` };
    }
    parent.children ??= [];
    parent.children.push(target);
    normalizeChildOrder(parent);
    syncRootLayout(document);
    return {
      document,
      message: `Moved ${nodeId}`,
      selectedNodeId: instruction.select === false ? undefined : nodeId,
    };
  }

  target.interactions = { ...(target.interactions ?? {}), ...instruction.interactions };
  syncRootLayout(document);
  return {
    document,
    message: `Updated ${nodeId} interactions`,
    selectedNodeId: instruction.select === false ? undefined : nodeId,
  };
}

export function applyEditorAiEditInstructions(
  document: ThemeLayoutDocument,
  instructions: readonly EditorAiEditInstruction[],
  options?: ApplyEditorAiEditInstructionsOptions,
): ApplyEditorAiEditInstructionsResult {
  const currentDocument = cloneDocument(document);
  const applied: string[] = [];
  const errors: string[] = [];
  let selectedNodeId: string | null | undefined;
  let aborted = false;

  instructions.forEach((instruction, index) => {
    if (aborted) {
      return;
    }

    const result = applyOneInstruction(currentDocument, instruction, options);
    if (result.error) {
      errors.push(`Instruction ${index + 1}: ${result.error}`);
      aborted = true;
      return;
    }
    if (result.message) {
      applied.push(result.message);
    }
    if (result.selectedNodeId !== undefined) {
      selectedNodeId = result.selectedNodeId;
    }
  });

  if (errors.length > 0) {
    return {
      applied,
      document: currentDocument,
      errors,
      selectedNodeId,
    };
  }

  if (options?.skipValidation) {
    return { applied, document: currentDocument, errors, selectedNodeId };
  }

  const validation = validateThemeLayoutDocument(currentDocument, {
    componentTemplates: currentDocument.componentTemplates,
    failOnUnknownProps: false,
  });

  if (!validation.valid) {
    return {
      applied,
      document: cloneDocument(document),
      errors: validation.errors.map((error) => `Validation ${error.path}: ${error.message}`),
      selectedNodeId,
      rollbackReason: 'validation',
    };
  }

  return { applied, document: currentDocument, errors, selectedNodeId };
}
