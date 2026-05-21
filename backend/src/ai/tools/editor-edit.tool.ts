import { AI_SEMANTIC_TARGET_ROLE_VALUES } from '../semantic-targets.config';
import type { ProviderTool } from '../core/providers/types';

type EditorOperation = Record<string, unknown> & { type: string };

const commonTargetProperties = {
  pageId: {
    type: 'string',
    description: 'Target page id.',
  },
  nodeId: {
    type: 'string',
    description: 'Target node id.',
  },
  reason: {
    type: 'string',
    description: 'Short edit summary.',
  },
} satisfies Record<string, Record<string, unknown>>;

function tool(
  name: string,
  description: string,
  required: string[],
  properties: Record<string, unknown>,
): ProviderTool {
  return {
    name,
    description,
    parameters: {
      type: 'object',
      required,
      properties: {
        ...properties,
        reason: commonTargetProperties.reason,
      },
    },
  };
}

export const EDITOR_CREATE_PAGE_TOOL = tool(
  'editor_create_page',
  'Create a page.',
  ['pageId', 'name'],
  {
    pageId: { type: 'string', description: 'New page id.' },
    name: { type: 'string', description: 'Page name.' },
    rootNodeId: { type: 'string', description: 'Root screen id.' },
    activate: { type: 'boolean', description: 'Activate page.' },
  },
);

export const EDITOR_DELETE_PAGE_TOOL = tool(
  'editor_delete_page',
  'Delete a page.',
  [],
  {
    pageId: { type: 'string', description: 'Page id.' },
    name: { type: 'string', description: 'Exact page name.' },
  },
);

export const EDITOR_INSERT_NODE_TOOL = tool(
  'editor_insert_node',
  'Insert one component into a container.',
  ['parentId', 'alias'],
  {
    pageId: commonTargetProperties.pageId,
    parentId: { type: 'string', description: 'Container node id.' },
    alias: { type: 'string', description: 'Component alias.' },
    nodeId: { type: 'string', description: 'Inserted node id.' },
    targetId: { type: 'string', description: 'Sibling node id.' },
    position: { type: 'string', enum: ['before', 'after', 'inside_end'] },
    props: { type: 'object', description: 'Component props.' },
    layout: { type: 'object', description: 'Layout values.' },
    select: { type: 'boolean', description: 'Select node.' },
  },
);

export const EDITOR_UPDATE_PROPS_TOOL = tool(
  'editor_update_props',
  'Patch node props.',
  ['nodeId', 'props'],
  {
    pageId: commonTargetProperties.pageId,
    nodeId: commonTargetProperties.nodeId,
    props: { type: 'object', description: 'Props patch.' },
    semanticTarget: {
      type: 'string',
      enum: AI_SEMANTIC_TARGET_ROLE_VALUES,
      description: 'Semantic target.',
    },
    select: { type: 'boolean' },
  },
);

export const EDITOR_DELETE_NODE_TOOL = tool(
  'editor_delete_node',
  'Delete one node.',
  ['nodeId'],
  {
    pageId: commonTargetProperties.pageId,
    nodeId: commonTargetProperties.nodeId,
  },
);

export const EDITOR_SET_LAYOUT_TOOL = tool(
  'editor_set_layout',
  'Patch node layout.',
  ['nodeId', 'layout'],
  {
    pageId: commonTargetProperties.pageId,
    nodeId: commonTargetProperties.nodeId,
    layout: { type: 'object', description: 'Layout patch.' },
  },
);

export const EDITOR_SET_FRAME_TOOL = tool(
  'editor_set_frame',
  'Patch node frame.',
  ['nodeId', 'frame'],
  {
    pageId: commonTargetProperties.pageId,
    nodeId: commonTargetProperties.nodeId,
    frame: { type: 'object', description: 'Frame patch.' },
  },
);

export const EDITOR_MOVE_NODE_TOOL = tool(
  'editor_move_node',
  'Move one node.',
  ['nodeId', 'parentId'],
  {
    pageId: commonTargetProperties.pageId,
    nodeId: commonTargetProperties.nodeId,
    parentId: { type: 'string', description: 'Destination container id.' },
    targetId: { type: 'string', description: 'Sibling node id.' },
    position: { type: 'string', enum: ['before', 'after', 'inside_end'] },
  },
);

export const EDITOR_UPDATE_INTERACTIONS_TOOL = tool(
  'editor_update_interactions',
  'Patch node interactions.',
  ['nodeId', 'interactions'],
  {
    pageId: commonTargetProperties.pageId,
    nodeId: commonTargetProperties.nodeId,
    semanticTarget: {
      type: 'string',
      enum: AI_SEMANTIC_TARGET_ROLE_VALUES,
      description: 'Semantic target.',
    },
    interactions: {
      type: 'object',
      description: 'Interaction patch.',
    },
  },
);

export const EDITOR_SYNC_NAVIGATION_TOOL = tool(
  'editor_sync_navigation',
  'Sync page navigation.',
  [],
  {
    semanticTarget: {
      type: 'string',
      enum: AI_SEMANTIC_TARGET_ROLE_VALUES,
      description: 'Semantic target.',
    },
    select: { type: 'boolean' },
  },
);

export const EDITOR_EDIT_TOOLS = [
  EDITOR_CREATE_PAGE_TOOL,
  EDITOR_DELETE_PAGE_TOOL,
  EDITOR_INSERT_NODE_TOOL,
  EDITOR_UPDATE_PROPS_TOOL,
  EDITOR_DELETE_NODE_TOOL,
  EDITOR_SET_LAYOUT_TOOL,
  EDITOR_SET_FRAME_TOOL,
  EDITOR_MOVE_NODE_TOOL,
  EDITOR_UPDATE_INTERACTIONS_TOOL,
  EDITOR_SYNC_NAVIGATION_TOOL,
] as const satisfies readonly ProviderTool[];

export const EDITOR_EDIT_TOOL_NAMES = new Set(EDITOR_EDIT_TOOLS.map((item) => item.name));

export function selectEditorEditTools(_intentText: string): ProviderTool[] {
  return [...EDITOR_EDIT_TOOLS];
}

export function editorToolCallToOperations(
  name: string,
  args: Record<string, unknown>,
): { operations: EditorOperation[]; reason: string } {
  const reason = typeof args.reason === 'string' ? args.reason : '';
  const base = Object.fromEntries(
    Object.entries(args).filter(([key, value]) => key !== 'reason' && value !== undefined),
  );

  switch (name) {
    case EDITOR_CREATE_PAGE_TOOL.name:
      return { operations: [{ ...base, type: 'create_page' }], reason };
    case EDITOR_DELETE_PAGE_TOOL.name:
      return { operations: [{ ...base, type: 'delete_page' }], reason };
    case EDITOR_INSERT_NODE_TOOL.name:
      return { operations: [{ ...base, type: 'insert_node' }], reason };
    case EDITOR_UPDATE_PROPS_TOOL.name:
      return { operations: [{ ...base, type: 'update_props' }], reason };
    case EDITOR_DELETE_NODE_TOOL.name:
      return { operations: [{ ...base, type: 'delete_node' }], reason };
    case EDITOR_SET_LAYOUT_TOOL.name:
      return { operations: [{ ...base, type: 'set_layout' }], reason };
    case EDITOR_SET_FRAME_TOOL.name:
      return { operations: [{ ...base, type: 'set_frame' }], reason };
    case EDITOR_MOVE_NODE_TOOL.name:
      return { operations: [{ ...base, type: 'move_node' }], reason };
    case EDITOR_UPDATE_INTERACTIONS_TOOL.name:
      return { operations: [{ ...base, type: 'update_interactions' }], reason };
    case EDITOR_SYNC_NAVIGATION_TOOL.name:
      return {
        operations: [{
          ...base,
          type: args.semanticTarget === 'page_footer_nav'
            ? 'sync_footer_tabs'
            : 'sync_page_navigation',
        }],
        reason,
      };
    default:
      throw new Error(`Unknown editor tool: ${name}`);
  }
}

export const APPLY_EDITOR_EDITS_TOOL = tool(
  'apply_editor_edits',
  'Deprecated batched editor edit tool.',
  ['operations'],
  {
    operations: {
      type: 'array',
      minItems: 1,
      items: { type: 'object' },
    },
  },
);
