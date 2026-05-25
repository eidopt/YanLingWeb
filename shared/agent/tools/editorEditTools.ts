export interface AgentProviderTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

type EditorOperation = Record<string, unknown> & { type: string };

export const EDITOR_SEMANTIC_TARGET_ROLE_VALUES = [
  'page_footer_nav',
  'page_header',
  'page_title',
  'primary_cta',
  'search_box',
  'main_content',
  'section_header',
  'selected_node',
] as const;

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
): AgentProviderTool {
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
  [
    'Create a new page/canvas. Use this before adding a new bottom navigation',
    'destination such as My/Profile/account/user info. After creating the page,',
    'insert content into rootNodeId or another container on that new page, then',
    'call editor_sync_navigation.',
  ].join(' '),
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

const INSERT_NODE_DESCRIPTION = [
  'Insert one component into a container. parentId must be a container:',
  'core.screen, core.panel, core.stack, core.row, core.grid, or core.html.',
  'Never use leaf nodes as parentId.',
  '',
  'The "props" object holds ALL component-specific properties. Always include',
  'the minimum required props for the alias. Examples by component type:',
  '  core.button  -> {"label":"Submit","variant":"primary"}',
  '  core.text    -> {"text":"Hello world"}',
  '  core.input   -> {"placeholder":"Enter email","type":"email"}',
  '  core.image   -> {"src":"/img/photo.jpg","alt":"description"}',
  '  core.tag     -> {"label":"New","tone":"info"}',
  '  core.progress -> {"value":60,"max":100,"tone":"accent"}',
  '  core.screen  -> {"title":"My Page"}',
  '',
  'Do NOT put props at the top level - always inside the "props" object.',
].join('\n');

export const EDITOR_INSERT_NODE_TOOL = tool(
  'editor_insert_node',
  INSERT_NODE_DESCRIPTION,
  ['parentId', 'alias'],
  {
    pageId: commonTargetProperties.pageId,
    parentId: { type: 'string', description: 'Exact existing container node id.' },
    alias: { type: 'string', description: 'Component alias (e.g. core.text, core.button, core.panel).' },
    nodeId: { type: 'string', description: 'Suggested inserted node id.' },
    targetId: { type: 'string', description: 'Exact existing sibling node id.' },
    position: { type: 'string', enum: ['before', 'after', 'inside_end'] },
    props: {
      type: 'object',
      description: [
        'Component-specific properties. Include the minimum required props for the alias.',
        'Common props: text, label, title, placeholder, name, variant, href, icon, src, alt, type, disabled, value, color, size.',
        'Example: {"text":"Submit","variant":"primary","disabled":false}',
      ].join(' '),
    },
    layout: { type: 'object', description: 'Layout values (mode, width, height, etc).' },
    select: { type: 'boolean', description: 'Select node after insert.' },
  },
);

const UPDATE_PROPS_DESCRIPTION = [
  'Patch node props. Provide nodeId or semanticTarget to identify the node.',
  '',
  'The "props" object holds the properties to update. Only include changed props.',
  'Examples:',
  '  Change text    -> {"text":"New label"}',
  '  Change variant -> {"variant":"outline"}',
  '  Disable button -> {"disabled":true}',
  '  Change image   -> {"src":"/new-photo.jpg"}',
  '',
  'Do NOT put props at the top level - always inside the "props" object.',
].join('\n');

export const EDITOR_UPDATE_PROPS_TOOL = tool(
  'editor_update_props',
  UPDATE_PROPS_DESCRIPTION,
  ['props'],
  {
    pageId: commonTargetProperties.pageId,
    nodeId: commonTargetProperties.nodeId,
    props: {
      type: 'object',
      description: [
        'Properties to update. Only include changed props.',
        'Common props: text, label, title, placeholder, name, variant, href, icon, activeTab, src, alt, type, disabled, value, color, size.',
        'Example: {"text":"Updated label","variant":"outline"}',
      ].join(' '),
    },
    semanticTarget: {
      type: 'string',
      enum: EDITOR_SEMANTIC_TARGET_ROLE_VALUES,
      description: 'Semantic target role (alternative to nodeId).',
    },
    select: { type: 'boolean' },
  },
);

export const EDITOR_DELETE_NODE_TOOL = tool(
  'editor_delete_node',
  [
    'Delete one node. Provide nodeId or semanticTarget to identify the node.',
    'Do not invent ids - use exact ids from context or semanticTarget.',
  ].join(' '),
  [],
  {
    pageId: commonTargetProperties.pageId,
    nodeId: commonTargetProperties.nodeId,
    semanticTarget: {
      type: 'string',
      enum: EDITOR_SEMANTIC_TARGET_ROLE_VALUES,
      description: 'Semantic target role (alternative to nodeId).',
    },
  },
);

export const EDITOR_SET_LAYOUT_TOOL = tool(
  'editor_set_layout',
  [
    'Patch node layout. Provide nodeId or semanticTarget to identify the node.',
    'Do not invent ids - use exact ids from context or semanticTarget.',
  ].join(' '),
  ['layout'],
  {
    pageId: commonTargetProperties.pageId,
    nodeId: commonTargetProperties.nodeId,
    semanticTarget: {
      type: 'string',
      enum: EDITOR_SEMANTIC_TARGET_ROLE_VALUES,
      description: 'Semantic target role (alternative to nodeId).',
    },
    layout: { type: 'object', description: 'Layout patch.' },
  },
);

export const EDITOR_SET_FRAME_TOOL = tool(
  'editor_set_frame',
  [
    'Patch node frame. Provide nodeId or semanticTarget to identify the node.',
    'Do not invent ids - use exact ids from context or semanticTarget.',
  ].join(' '),
  ['frame'],
  {
    pageId: commonTargetProperties.pageId,
    nodeId: commonTargetProperties.nodeId,
    semanticTarget: {
      type: 'string',
      enum: EDITOR_SEMANTIC_TARGET_ROLE_VALUES,
      description: 'Semantic target role (alternative to nodeId).',
    },
    frame: { type: 'object', description: 'Frame patch.' },
  },
);

export const EDITOR_MOVE_NODE_TOOL = tool(
  'editor_move_node',
  [
    'Move one node. Provide nodeId or semanticTarget to identify the node.',
    'parentId is required (destination container). Do not invent ids.',
  ].join(' '),
  ['parentId'],
  {
    pageId: commonTargetProperties.pageId,
    nodeId: commonTargetProperties.nodeId,
    semanticTarget: {
      type: 'string',
      enum: EDITOR_SEMANTIC_TARGET_ROLE_VALUES,
      description: 'Semantic target role (alternative to nodeId).',
    },
    parentId: { type: 'string', description: 'Destination container id.' },
    targetId: { type: 'string', description: 'Sibling node id.' },
    position: { type: 'string', enum: ['before', 'after', 'inside_end'] },
  },
);

export const EDITOR_UPDATE_INTERACTIONS_TOOL = tool(
  'editor_update_interactions',
  'Patch node interactions. Provide nodeId or semanticTarget.',
  ['interactions'],
  {
    pageId: commonTargetProperties.pageId,
    nodeId: commonTargetProperties.nodeId,
    semanticTarget: {
      type: 'string',
      enum: EDITOR_SEMANTIC_TARGET_ROLE_VALUES,
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
      enum: EDITOR_SEMANTIC_TARGET_ROLE_VALUES,
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
] as const satisfies readonly AgentProviderTool[];

export const EDITOR_EDIT_TOOL_NAMES = new Set(EDITOR_EDIT_TOOLS.map((item) => item.name));

export function selectEditorEditTools(_intentText: string): AgentProviderTool[] {
  return [...EDITOR_EDIT_TOOLS];
}

function mergeFlatProps(args: Record<string, unknown>): Record<string, unknown> {
  if (typeof args.props === 'object' && args.props !== null) {
    return { ...(args.props as Record<string, unknown>) };
  }

  const legacyKeys = [
    'text', 'label', 'title', 'placeholder', 'name',
    'variant', 'href', 'icon', 'activeTab', 'propsJson',
  ];
  const props: Record<string, unknown> = {};
  for (const key of legacyKeys) {
    if (key === 'propsJson' && typeof args.propsJson === 'string') {
      try {
        Object.assign(props, JSON.parse(args.propsJson));
      } catch { /* ignore invalid JSON */ }
    } else if (args[key] !== undefined) {
      props[key] = args[key];
    }
  }
  return props;
}

function cleanBaseArgs(args: Record<string, unknown>): Record<string, unknown> {
  const skip = new Set(['reason', 'props', 'propsJson']);
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (skip.has(key) || value === undefined) continue;
    cleaned[key] = value;
  }
  return cleaned;
}

export function editorToolCallToOperations(
  name: string,
  args: Record<string, unknown>,
): { operations: EditorOperation[]; reason: string } {
  const reason = typeof args.reason === 'string' ? args.reason : '';

  switch (name) {
    case EDITOR_CREATE_PAGE_TOOL.name: {
      const base = cleanBaseArgs(args);
      return { operations: [{ ...base, type: 'create_page' }], reason };
    }
    case EDITOR_DELETE_PAGE_TOOL.name: {
      const base = cleanBaseArgs(args);
      return { operations: [{ ...base, type: 'delete_page' }], reason };
    }
    case EDITOR_INSERT_NODE_TOOL.name: {
      const base = cleanBaseArgs(args);
      const mergedProps = mergeFlatProps(args);
      if (Object.keys(mergedProps).length > 0) {
        base.props = mergedProps;
      }
      return { operations: [{ ...base, type: 'insert_node' }], reason };
    }
    case EDITOR_UPDATE_PROPS_TOOL.name: {
      const base = cleanBaseArgs(args);
      const mergedProps = mergeFlatProps(args);
      if (Object.keys(mergedProps).length === 0) {
        throw new Error(
          'update_props requires at least one prop to update. '
            + 'Provide props={"key":"value"} with at least one property.',
        );
      }
      base.props = mergedProps;
      return { operations: [{ ...base, type: 'update_props' }], reason };
    }
    case EDITOR_DELETE_NODE_TOOL.name: {
      const base = cleanBaseArgs(args);
      return { operations: [{ ...base, type: 'delete_node' }], reason };
    }
    case EDITOR_SET_LAYOUT_TOOL.name: {
      const base = cleanBaseArgs(args);
      return { operations: [{ ...base, type: 'set_layout' }], reason };
    }
    case EDITOR_SET_FRAME_TOOL.name: {
      const base = cleanBaseArgs(args);
      return { operations: [{ ...base, type: 'set_frame' }], reason };
    }
    case EDITOR_MOVE_NODE_TOOL.name: {
      const base = cleanBaseArgs(args);
      return { operations: [{ ...base, type: 'move_node' }], reason };
    }
    case EDITOR_UPDATE_INTERACTIONS_TOOL.name: {
      const base = cleanBaseArgs(args);
      return { operations: [{ ...base, type: 'update_interactions' }], reason };
    }
    case EDITOR_SYNC_NAVIGATION_TOOL.name: {
      const base = cleanBaseArgs(args);
      return {
        operations: [{
          ...base,
          type: args.semanticTarget === 'page_footer_nav'
            ? 'sync_footer_tabs'
            : 'sync_page_navigation',
        }],
        reason,
      };
    }
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
