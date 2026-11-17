import type { ThemeLayoutDocument, ThemeLayoutNode } from '../types';
import {
  applyEditorAiEditInstructions,
  type EditorAiEditInstruction,
} from './applyEditorInstructions';
import { findNode } from './applyEditorInstructions.helpers';
import {
  buildNodeResolutionError,
  type NodeResolutionErrorInfo,
} from './applyEditorInstructions.resolution';
import { resolveEditorSemanticTarget } from './semanticTargetResolver';

const EXISTING_NODE_OPS = new Set([
  'update_props',
  'delete_node',
  'set_layout',
  'set_frame',
  'move_node',
  'update_interactions',
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function documentRoots(document: ThemeLayoutDocument): ThemeLayoutNode[] {
  const roots: ThemeLayoutNode[] = [];
  const seen = new Set<ThemeLayoutNode>();
  const push = (root: ThemeLayoutNode | undefined) => {
    if (!root || seen.has(root)) {
      return;
    }
    seen.add(root);
    roots.push(root);
  };
  push(document.layout);
  for (const page of document.pages) {
    push(page.layout);
  }
  return roots;
}

export function findNodeInDocument(document: ThemeLayoutDocument, nodeId: string): ThemeLayoutNode | null {
  for (const root of documentRoots(document)) {
    const found = findNode(root, nodeId);
    if (found) {
      return found;
    }
  }
  return null;
}

function candidateRoot(document: ThemeLayoutDocument, pageId: string | undefined): ThemeLayoutNode {
  if (pageId) {
    const page = document.pages.find((item) => item.id === pageId);
    if (page?.layout) {
      return page.layout;
    }
  }
  return document.layout;
}

function identityError(message: string, failedId = ''): NodeResolutionErrorInfo {
  return {
    error: message,
    failedId,
    candidates: [],
    siblingIds: [],
    parentAlias: null,
  };
}

function missingNode(
  document: ThemeLayoutDocument,
  pageId: string | undefined,
  nodeId: string,
): NodeResolutionErrorInfo {
  return buildNodeResolutionError(candidateRoot(document, pageId), nodeId);
}

function requireExisting(
  document: ThemeLayoutDocument,
  pageId: string | undefined,
  nodeId: string | undefined,
): NodeResolutionErrorInfo | null {
  if (!nodeId) {
    return null;
  }
  return findNodeInDocument(document, nodeId) ? null : missingNode(document, pageId, nodeId);
}

function referenceIds(record: Record<string, unknown>): string[] {
  const ids: string[] = [];
  if (Array.isArray(record.referenceNodeUpdates)) {
    for (const update of record.referenceNodeUpdates) {
      const item = asRecord(update);
      const referenceNodeId = item ? stringField(item, 'referenceNodeId') : undefined;
      if (referenceNodeId) {
        ids.push(referenceNodeId);
      }
    }
  }
  if (Array.isArray(record.omitReferenceNodeIds)) {
    for (const id of record.omitReferenceNodeIds) {
      if (typeof id === 'string' && id.trim()) {
        ids.push(id.trim());
      }
    }
  }
  if (Array.isArray(record.fields)) {
    for (const field of record.fields) {
      const item = asRecord(field);
      const referenceNodeId = item ? stringField(item, 'referenceNodeId') : undefined;
      if (referenceNodeId) {
        ids.push(referenceNodeId);
      }
    }
  }
  return ids;
}

/**
 * Exact-id gate for edits of nodes that already exist.
 * New insert ids are allowed. A miss returns candidates and must not be applied.
 */
export function firstMissingExistingNode(
  document: ThemeLayoutDocument,
  operations: readonly unknown[],
): NodeResolutionErrorInfo | null {
  for (const operation of operations) {
    const record = asRecord(operation);
    if (!record) {
      continue;
    }
    const type = stringField(record, 'type') ?? '';
    const pageId = stringField(record, 'pageId');
    const nodeId = stringField(record, 'nodeId');
    const parentId = stringField(record, 'parentId');
    const targetId = stringField(record, 'targetId');
    const semanticTarget = stringField(record, 'semanticTarget') ?? stringField(record, 'target');

    if (EXISTING_NODE_OPS.has(type)) {
      if (!nodeId && !semanticTarget) {
        return identityError(
          `${type} requires an existing nodeId. Call editor_search_nodes, or pass semanticTarget.`,
        );
      }
      const missing = requireExisting(document, pageId, nodeId);
      if (missing) {
        return missing;
      }
    }

    if (type === 'insert_node') {
      if (!parentId && !semanticTarget) {
        return identityError(
          'insert_node requires an existing parentId. Call editor_search_nodes to find a container.',
        );
      }
      const missingParent = requireExisting(document, pageId, parentId);
      if (missingParent) {
        return missingParent;
      }
    }

    if (type === 'move_node' || type === 'insert_node') {
      const missingTarget = requireExisting(document, pageId, targetId);
      if (missingTarget) {
        return missingTarget;
      }
    }

    if (type === 'move_node') {
      if (!parentId) {
        return identityError('move_node requires an existing parentId.');
      }
      const missingParent = requireExisting(document, pageId, parentId);
      if (missingParent) {
        return missingParent;
      }
    }

    if (type === 'clone_pattern_items') {
      const sourceRootNodeId = stringField(record, 'sourceRootNodeId');
      if (!sourceRootNodeId) {
        return identityError('clone_pattern_items requires an existing sourceRootNodeId.');
      }
      const missingSource = requireExisting(document, pageId, sourceRootNodeId);
      if (missingSource) {
        return missingSource;
      }
      const missingParent = requireExisting(document, pageId, parentId);
      if (missingParent) {
        return missingParent;
      }
    }

    for (const referenceId of referenceIds(record)) {
      const missingReference = requireExisting(document, pageId, referenceId);
      if (missingReference) {
        return missingReference;
      }
    }
  }

  return null;
}

export interface EditorSnapshotCommit {
  document?: ThemeLayoutDocument;
  error?: string;
}

/** Apply accepted operations onto the in-loop document so later tools see the new tree. */
export function commitEditorDocumentSnapshot(
  document: ThemeLayoutDocument,
  operations: readonly unknown[],
): EditorSnapshotCommit {
  const applied = applyEditorAiEditInstructions(document, operations as readonly EditorAiEditInstruction[], {
    skipValidation: true,
    resolveSemanticTarget: resolveEditorSemanticTarget,
  });
  if (applied.errors.length > 0) {
    return { error: applied.errors.join('\n') };
  }
  return { document: applied.document };
}
