import type { ThemeLayoutDocument, ThemeLayoutNode } from '../types';
import type { ApplyEditorAiEditInstructionsOptions } from './applyEditorInstructions.helpers';
import { findNode, findParentId } from './applyEditorInstructions.helpers';

export interface NodeResolutionCandidate {
  nodeId: string;
  alias: string;
  summary: string;
  score: number;
  matchReason: string;
}

export interface NodeResolutionErrorInfo {
  error: string;
  failedId: string;
  candidates: NodeResolutionCandidate[];
  siblingIds: string[];
  parentAlias: string | null;
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

function collectNodeIds(node: ThemeLayoutNode, output: string[] = []): string[] {
  output.push(node.id);
  node.children?.forEach((child) => collectNodeIds(child, output));
  return output;
}

function normalizeNodeId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9一-鿿]+/g, '');
}

function nodeIdTokens(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .split(/[^a-z0-9一-鿿]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !GENERIC_NODE_ID_TOKENS.has(token));
}

function commonPrefixRatio(left: string, right: string): number {
  const max = Math.min(left.length, right.length);
  let index = 0;
  while (index < max && left[index] === right[index]) {
    index += 1;
  }
  return max > 0 ? index / max : 0;
}

function scoreNodeIdMatch(requestedId: string, existingId: string): number {
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

function resolveNodeIdFromExistingIds(root: ThemeLayoutNode, requestedId: string): string | null {
  const candidates = collectNodeIds(root)
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

function summarizeNodeForError(node: ThemeLayoutNode): string {
  const entries = Object.entries(node.props ?? {})
    .filter(([_, v]) => typeof v === 'string' || typeof v === 'number')
    .map(([k, v]) => `${k}=${String(v).slice(0, 40)}`)
    .slice(0, 3);
  return entries.length > 0 ? entries.join(', ') : 'no text props';
}

function buildNodeResolutionError(root: ThemeLayoutNode, requestedId: string): NodeResolutionErrorInfo {
  const allIds = collectNodeIds(root);

  const scoredCandidates = allIds
    .map((nodeId) => {
      const node = findNode(root, nodeId);
      return {
        nodeId,
        alias: node?.alias ?? 'unknown',
        summary: node ? summarizeNodeForError(node) : '',
        score: scoreNodeIdMatch(requestedId, nodeId),
        matchReason: '',
      };
    })
    .sort((a, b) => b.score - a.score);

  const candidates: NodeResolutionCandidate[] = [];
  for (const item of scoredCandidates) {
    if (item.score <= 0) {
      break;
    }
    let matchReason = 'no match';
    if (item.score >= 0.92) {
      matchReason = 'substring match';
    } else if (item.score >= 0.65) {
      matchReason = 'token overlap';
    } else if (item.score > 0) {
      matchReason = 'partial prefix match';
    }
    candidates.push({ ...item, matchReason });
    if (candidates.length >= 5) {
      break;
    }
  }

  const parentInfo = findParentAndSiblings(root, requestedId);

  return {
    error: `Node not found: ${requestedId}. See candidates below for possible matches.`,
    failedId: requestedId,
    candidates,
    siblingIds: parentInfo.siblingIds,
    parentAlias: parentInfo.parentAlias,
  };
}

function findParentAndSiblings(
  root: ThemeLayoutNode,
  targetId: string,
): { siblingIds: string[]; parentAlias: string | null } {
  const parentId = findParentId(root, targetId);
  if (!parentId) {
    return { siblingIds: [], parentAlias: null };
  }
  const parent = findNode(root, parentId);
  if (!parent?.children?.length) {
    return { siblingIds: [], parentAlias: parent?.alias ?? null };
  }
  const siblingIds = parent.children
    .filter((child) => child.id !== targetId)
    .map((child) => child.id)
    .slice(0, 10);
  return { siblingIds, parentAlias: parent.alias };
}

function searchNodeByProps(root: ThemeLayoutNode, query: string): string | null {
  const queryNorm = normalizeNodeId(query);
  if (!queryNorm || queryNorm.length < 2) {
    return null;
  }

  let bestMatchNodeId: string | null = null;
  let bestMatchScore = 0;

  const walk = (node: ThemeLayoutNode) => {
    const propText = [
      node.props?.text,
      node.props?.label,
      node.props?.title,
      node.props?.placeholder,
      node.props?.name,
      node.props?.activeTab,
      node.alias,
    ]
      .filter((v): v is string => typeof v === 'string')
      .join(' ');

    const normPropText = normalizeNodeId(propText);
    if (!normPropText) {
      node.children?.forEach(walk);
      return;
    }

    let score = 0;
    if (normPropText.includes(queryNorm)) {
      score = 0.85;
    } else if (queryNorm.includes(normPropText) && normPropText.length >= 3) {
      score = 0.7;
    }

    if (score > bestMatchScore) {
      bestMatchNodeId = node.id;
      bestMatchScore = score;
    }

    node.children?.forEach(walk);
  };

  walk(root);
  return bestMatchNodeId;
}

export interface ResolveNodeIdMultiStrategyInput {
  root: ThemeLayoutNode;
  document: ThemeLayoutDocument;
  instruction: { semanticTarget?: string; target?: string };
  requestedId?: string;
  selectedNodeId?: string | null;
  alias?: string;
  parentId?: string;
  resolveSemanticTarget?: ApplyEditorAiEditInstructionsOptions['resolveSemanticTarget'];
}

export interface ResolveNodeIdMultiStrategyResult {
  resolvedId: string | null;
  strategy: 'exact' | 'fuzzy_token' | 'prop_search' | 'semantic_role' | 'structural' | 'failed';
  node?: ThemeLayoutNode;
  error?: NodeResolutionErrorInfo;
}

export function multiStrategyResolveNodeId(input: ResolveNodeIdMultiStrategyInput): ResolveNodeIdMultiStrategyResult {
  const { root, document, instruction, requestedId, selectedNodeId, alias, parentId, resolveSemanticTarget } = input;

  // semanticTarget first when no explicit nodeId — true one-of semantics
  if (!requestedId && instruction.semanticTarget && resolveSemanticTarget) {
    const semanticResult = resolveSemanticTarget(document, instruction.semanticTarget, selectedNodeId);
    if (semanticResult) {
      const semNode = findNode(root, semanticResult.nodeId);
      if (semNode) {
        return { resolvedId: semanticResult.nodeId, strategy: 'semantic_role', node: semNode };
      }
    }
  }

  // requestedId-based strategies (exact → fuzzy → prop_search)
  if (requestedId) {
    const exact = findNode(root, requestedId);
    if (exact) {
      return { resolvedId: requestedId, strategy: 'exact', node: exact };
    }

    const fuzzy = resolveNodeIdFromExistingIds(root, requestedId);
    if (fuzzy) {
      return { resolvedId: fuzzy, strategy: 'fuzzy_token', node: findNode(root, fuzzy) ?? undefined };
    }

    const propMatch = searchNodeByProps(root, requestedId);
    if (propMatch) {
      return { resolvedId: propMatch, strategy: 'prop_search', node: findNode(root, propMatch) ?? undefined };
    }

    // Also try semanticTarget as fallback when requestedId failed all strategies
    if (instruction.semanticTarget && resolveSemanticTarget) {
      const semanticResult = resolveSemanticTarget(document, instruction.semanticTarget, selectedNodeId);
      if (semanticResult) {
        const semNode = findNode(root, semanticResult.nodeId);
        if (semNode) {
          return { resolvedId: semanticResult.nodeId, strategy: 'semantic_role', node: semNode };
        }
      }
    }
  }

  if (parentId && alias) {
    const parent = findNode(root, parentId);
    if (parent?.children) {
      const child = parent.children.find((c) => c.alias === alias);
      if (child) {
        return { resolvedId: child.id, strategy: 'structural', node: child };
      }
    }
  }

  const fallbackId = requestedId ?? instruction.semanticTarget ?? instruction.target ?? '';
  const error = buildNodeResolutionError(root, fallbackId);
  return { resolvedId: null, strategy: 'failed', error };
}
