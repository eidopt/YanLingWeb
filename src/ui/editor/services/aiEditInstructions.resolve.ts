import type { ThemeLayoutDocument, ThemeLayoutNode } from '../../layout/types';
import type {
  ApplyEditorAiEditInstructionsOptions,
  EditorAiEditInstruction,
  NodeIdAliases,
} from './aiEditInstructions.types';
import { resolveSemanticTargetNodeId } from './semanticTargets';
import { findNode } from 'domain/template';

function resolveAliasId(nodeId: string | undefined, aliases: NodeIdAliases) {
  if (!nodeId) {
    return nodeId;
  }

  return aliases.get(nodeId) ?? nodeId;
}

const GENERIC_NODE_ID_TOKENS = new Set([
  'body',
  'canvas',
  'component',
  'container',
  'content',
  'core',
  'group',
  'item',
  'layout',
  'main',
  'node',
  'page',
  'root',
  'screen',
  'section',
  'wrapper',
]);
const MIN_NODE_ID_MATCH_SCORE = 0.6;
const MIN_NODE_ID_MATCH_GAP = 0.15;

function collectNodeIds(node: ThemeLayoutNode, output: string[] = []) {
  output.push(node.id);
  node.children?.forEach((child) => collectNodeIds(child, output));
  return output;
}

function normalizeNodeId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '');
}

function nodeIdTokens(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !GENERIC_NODE_ID_TOKENS.has(token));
}

function commonPrefixRatio(left: string, right: string) {
  const max = Math.min(left.length, right.length);
  let index = 0;
  while (index < max && left[index] === right[index]) {
    index += 1;
  }
  return max > 0 ? index / max : 0;
}

function scoreNodeIdMatch(requestedId: string, existingId: string) {
  const requested = normalizeNodeId(requestedId);
  const existing = normalizeNodeId(existingId);
  if (!requested || !existing) {
    return 0;
  }
  if (requested === existing) {
    return 1;
  }
  if (requested.length >= 4 && existing.length >= 4 && (requested.includes(existing) || existing.includes(requested))) {
    return 0.92;
  }

  const requestedTokens = nodeIdTokens(requestedId);
  const existingTokens = nodeIdTokens(existingId);
  if (!requestedTokens.length || !existingTokens.length) {
    return commonPrefixRatio(requested, existing) >= 0.7 ? 0.65 : 0;
  }

  const existingTokenSet = new Set(existingTokens);
  const overlap = requestedTokens.filter((token) => existingTokenSet.has(token)).length;
  if (overlap === 0) {
    return commonPrefixRatio(requested, existing) >= 0.7 ? 0.65 : 0;
  }

  const union = new Set([...requestedTokens, ...existingTokens]).size;
  const containment = overlap / requestedTokens.length;
  const jaccard = overlap / union;
  return Math.max(jaccard, containment * 0.9);
}

function resolveNodeIdFromExistingIds(document: ThemeLayoutDocument, requestedId: string) {
  const candidates = collectNodeIds(document.layout)
    .map((nodeId) => ({
      nodeId,
      score: scoreNodeIdMatch(requestedId, nodeId),
    }))
    .filter((candidate) => candidate.score >= MIN_NODE_ID_MATCH_SCORE)
    .sort((left, right) => right.score - left.score);

  if (candidates.length === 0) {
    return null;
  }
  const [best, second] = candidates;
  if (candidates.length > 1 && best.score - second.score < MIN_NODE_ID_MATCH_GAP) {
    return null;
  }
  return best.nodeId;
}

export function resolveInstructionIds(
  instruction: EditorAiEditInstruction,
  aliases: NodeIdAliases,
): EditorAiEditInstruction {
  switch (instruction.type) {
    case 'create_page':
    case 'create_page_from_reference':
    case 'delete_page':
    case 'sync_page_navigation':
    case 'sync_footer_tabs':
      return instruction;
    case 'insert_node':
      return {
        ...instruction,
        parentId: resolveAliasId(instruction.parentId, aliases),
        targetId: resolveAliasId(instruction.targetId, aliases),
      };
    case 'clone_pattern_items':
      return {
        ...instruction,
        sourceRootNodeId: resolveAliasId(instruction.sourceRootNodeId, aliases) ?? instruction.sourceRootNodeId,
        parentId: resolveAliasId(instruction.parentId, aliases),
      };
    case 'update_props':
    case 'set_layout':
    case 'set_frame':
    case 'delete_node':
      return {
        ...instruction,
        nodeId: resolveAliasId(instruction.nodeId, aliases) ?? instruction.nodeId,
      };
    case 'move_node':
      return {
        ...instruction,
        nodeId: resolveAliasId(instruction.nodeId, aliases) ?? instruction.nodeId,
        parentId: resolveAliasId(instruction.parentId, aliases),
        targetId: resolveAliasId(instruction.targetId, aliases),
      };
    case 'update_interactions':
      return {
        ...instruction,
        nodeId: resolveAliasId(instruction.nodeId, aliases) ?? instruction.nodeId,
      };
  }
}

function getInstructionSemanticTarget(instruction: EditorAiEditInstruction) {
  return typeof instruction.semanticTarget === 'string' && instruction.semanticTarget.trim()
    ? instruction.semanticTarget
    : typeof instruction.target === 'string' && instruction.target.trim()
      ? instruction.target
      : undefined;
}

function stringifyInstructionForSemanticTarget(instruction: EditorAiEditInstruction) {
  try {
    return JSON.stringify(instruction);
  } catch {
    return instruction.type;
  }
}

function resolveSemanticNodeId(
  document: ThemeLayoutDocument,
  currentNodeId: string | undefined,
  instruction: EditorAiEditInstruction,
  options: ApplyEditorAiEditInstructionsOptions | undefined,
  fieldName: string,
) {
  if (currentNodeId) {
    if (findNode(document.layout, currentNodeId)) {
      return currentNodeId;
    }
    return resolveNodeIdFromExistingIds(document, currentNodeId) ?? undefined;
  }

  const semanticTarget = getInstructionSemanticTarget(instruction);
  if (!semanticTarget) {
    return currentNodeId;
  }

  const text = [
    options?.userPrompt,
    options?.reason,
    semanticTarget,
    currentNodeId,
    fieldName,
    stringifyInstructionForSemanticTarget(instruction),
  ]
    .filter(Boolean)
    .join('\n');
  return (
    resolveSemanticTargetNodeId(document, {
      target: semanticTarget,
      text,
      selectedNodeId: options?.selectedNodeId,
    })?.nodeId ?? currentNodeId
  );
}

type ExistingIdField = 'nodeId' | 'parentId' | 'targetId' | 'sourceRootNodeId';

function existingIdFields(instruction: EditorAiEditInstruction): readonly ExistingIdField[] {
  switch (instruction.type) {
    case 'insert_node':
      return ['parentId', 'targetId'];
    case 'clone_pattern_items':
      return ['sourceRootNodeId', 'parentId'];
    case 'move_node':
      return ['nodeId', 'parentId', 'targetId'];
    case 'update_props':
    case 'set_layout':
    case 'set_frame':
    case 'delete_node':
    case 'update_interactions':
      return ['nodeId'];
    default:
      return [];
  }
}

/** An explicit existing-node id that is neither exact nor a unique fuzzy match. */
export function explicitUnresolvedNodeId(
  document: ThemeLayoutDocument,
  instruction: EditorAiEditInstruction,
): string | undefined {
  const record = instruction as unknown as Record<string, unknown>;
  for (const field of existingIdFields(instruction)) {
    const nodeId = record[field];
    if (typeof nodeId !== 'string' || !nodeId.trim()) {
      continue;
    }
    if (findNode(document.layout, nodeId) || resolveNodeIdFromExistingIds(document, nodeId)) {
      continue;
    }
    return nodeId;
  }
  return undefined;
}

export function resolveInstructionSemanticTargets(
  document: ThemeLayoutDocument,
  instruction: EditorAiEditInstruction,
  options?: ApplyEditorAiEditInstructionsOptions,
): EditorAiEditInstruction {
  switch (instruction.type) {
    case 'create_page':
    case 'create_page_from_reference':
    case 'delete_page':
    case 'sync_page_navigation':
    case 'sync_footer_tabs':
      return instruction;
    case 'insert_node':
      return {
        ...instruction,
        parentId: resolveSemanticNodeId(document, instruction.parentId, instruction, options, 'parentId'),
        targetId: resolveSemanticNodeId(document, instruction.targetId, instruction, options, 'targetId'),
      };
    case 'clone_pattern_items':
      return {
        ...instruction,
        sourceRootNodeId:
          resolveSemanticNodeId(document, instruction.sourceRootNodeId, instruction, options, 'sourceRootNodeId') ??
          instruction.sourceRootNodeId,
        parentId: resolveSemanticNodeId(document, instruction.parentId, instruction, options, 'parentId'),
      };
    case 'update_props':
    case 'set_layout':
    case 'set_frame':
    case 'delete_node':
    case 'update_interactions':
      return {
        ...instruction,
        nodeId:
          resolveSemanticNodeId(document, instruction.nodeId, instruction, options, 'nodeId') ?? instruction.nodeId,
      };
    case 'move_node':
      return {
        ...instruction,
        nodeId:
          resolveSemanticNodeId(document, instruction.nodeId, instruction, options, 'nodeId') ?? instruction.nodeId,
        parentId: resolveSemanticNodeId(document, instruction.parentId, instruction, options, 'parentId'),
        targetId: resolveSemanticNodeId(document, instruction.targetId, instruction, options, 'targetId'),
      };
  }
}
