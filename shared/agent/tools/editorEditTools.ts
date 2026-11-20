import type { ProviderTool } from '../contracts/provider';
import { searchEditorNodes } from '../editor/searchEditorNodes';
import type { ThemeLayoutDocument } from '../types';

export type AgentProviderTool = ProviderTool;

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
    description: [
      'Existing node id copied from editor_search_nodes, a Resolved target line,',
      'the selected node, or a previous candidates list.',
    ].join(' '),
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

export const EDITOR_CREATE_PAGE_FROM_REFERENCE_TOOL = tool(
  'editor_create_page_from_reference',
  [
    'Create a new page by cloning an existing reference page skeleton, then',
    'patch copied nodes by referenceNodeId. Use this instead of editor_create_page',
    'when the user asks for a new page with content, so layout, spacing, footer,',
    'variants, and section density stay consistent with the current template.',
    'Only change content props through referenceNodeUpdates; do not freehand',
    'insert many nodes unless the cloned structure is insufficient.',
  ].join(' '),
  ['pageId', 'name', 'referencePageId'],
  {
    pageId: { type: 'string', description: 'New page id.' },
    name: { type: 'string', description: 'New page name/title.' },
    referencePageId: {
      type: 'string',
      description: 'Existing page id whose structure should be copied.',
    },
    rootNodeId: {
      type: 'string',
      description: 'Optional new root screen id. Defaults to `${pageId}-screen`.',
    },
    rootProps: {
      type: 'object',
      description: 'Optional root screen props, usually {"title":"Page title"}.',
    },
    referenceNodeUpdates: {
      type: 'array',
      description: [
        'Content-only patches to apply to copied nodes. Each item uses the',
        'reference page node id, not the new cloned id:',
        '{"referenceNodeId":"old-title","props":{"text":"New title"}}.',
      ].join(' '),
      items: {
        type: 'object',
        properties: {
          referenceNodeId: { type: 'string' },
          props: { type: 'object' },
        },
      },
    },
    omitReferenceNodeIds: {
      type: 'array',
      description: 'Optional reference node ids to omit from the cloned page.',
      items: { type: 'string' },
    },
    activate: { type: 'boolean', description: 'Activate page. Defaults to true.' },
    select: { type: 'boolean', description: 'Select the new root screen. Defaults to true.' },
    syncNavigation: {
      type: 'boolean',
      description: 'Sync footer/page navigation after creation. Defaults to true.',
    },
  },
);

export const EDITOR_DELETE_PAGE_TOOL = tool('editor_delete_page', 'Delete a page.', [], {
  pageId: { type: 'string', description: 'Page id.' },
  name: { type: 'string', description: 'Exact page name.' },
});

const INSERT_NODE_DESCRIPTION = [
  'Insert one component into a container. parentId must be a container:',
  'core.screen, core.panel, core.stack, core.row, core.grid, or core.html.',
  'Never use leaf nodes as parentId.',
  '',
  'The "props" object holds ALL component-specific properties. Always include',
  'the minimum required props for the alias. Examples by component type:',
  '  core.button  -> {"label":"提交","variant":"primary"}',
  '  core.text    -> {"text":"欢迎使用"}',
  '  core.input   -> {"placeholder":"请输入邮箱","type":"email"}',
  '  core.image   -> {"src":"https://images.unsplash.com/photo-1498050108023-c5249f4df085","alt":"示例图片"}',
  '  core.tag     -> {"label":"新品","tone":"info"}',
  '  core.progress -> {"value":60,"max":100,"tone":"accent"}',
  '  core.screen  -> {"title":"我的页面"}',
  '',
  'Do NOT put props at the top level - always inside the "props" object.',
].join('\n');

export const EDITOR_INSERT_NODE_TOOL = tool('editor_insert_node', INSERT_NODE_DESCRIPTION, ['parentId', 'alias'], {
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
      [
        'Common props: text, label, title, placeholder, name, variant,',
        'icon, src, alt, type, disabled, value, color, size.',
      ].join(' '),
      'Example: {"text":"提交","variant":"primary","disabled":false}',
    ].join(' '),
  },
  layout: { type: 'object', description: 'Layout values (mode, width, height, etc).' },
  select: { type: 'boolean', description: 'Select node after insert.' },
});

const UPDATE_PROPS_DESCRIPTION = [
  'Patch node props. Provide nodeId or semanticTarget to identify the node.',
  '',
  'The "props" object holds the properties to update. Only include changed props.',
  'Examples:',
  '  Change text    -> {"text":"新的文案"}',
  '  Change variant -> {"variant":"outline"}',
  '  Disable button -> {"disabled":true}',
  '  Change image   -> {"src":"https://images.unsplash.com/photo-1498050108023-c5249f4df085"}',
  '',
  'Do NOT put props at the top level - always inside the "props" object.',
].join('\n');

export const EDITOR_UPDATE_PROPS_TOOL = tool('editor_update_props', UPDATE_PROPS_DESCRIPTION, ['props'], {
  pageId: commonTargetProperties.pageId,
  nodeId: commonTargetProperties.nodeId,
  props: {
    type: 'object',
    description: [
      'Properties to update. Only include changed props.',
      [
        'Common props: text, label, title, placeholder, name, variant,',
        'icon, activeTab, src, alt, type, disabled, value, color, size.',
      ].join(' '),
      'Example: {"text":"更新后的文案","variant":"outline"}',
    ].join(' '),
  },
  semanticTarget: {
    type: 'string',
    enum: EDITOR_SEMANTIC_TARGET_ROLE_VALUES,
    description: 'Semantic target role (alternative to nodeId).',
  },
  select: { type: 'boolean' },
});

export const EDITOR_DELETE_NODE_TOOL = tool(
  'editor_delete_node',
  [
    'Delete one node. Provide nodeId or semanticTarget to identify the node.',
    'Do not invent ids. Copy nodeId from editor_search_nodes, the resolved target, or the selected node.',
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
    'Do not invent ids. Copy nodeId from editor_search_nodes, the resolved target, or the selected node.',
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
    'Do not invent ids. Copy nodeId from editor_search_nodes, the resolved target, or the selected node.',
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
    'Copy ids from editor_search_nodes, the resolved target, or the selected node.',
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

export const EDITOR_SYNC_NAVIGATION_TOOL = tool('editor_sync_navigation', 'Sync page navigation.', [], {
  semanticTarget: {
    type: 'string',
    enum: EDITOR_SEMANTIC_TARGET_ROLE_VALUES,
    description: 'Semantic target.',
  },
  select: { type: 'boolean' },
});

export const EDITOR_SUBMIT_PAGE_SPEC_TOOL = tool(
  'editor_submit_page_spec',
  'Submit a high-level PageSpec. Use this first for page creation or broad page updates.' +
    ' Do not include real nodeId values.',
  ['spec'],
  {
    spec: { type: 'object', description: 'PageSpec with intent, pageKind/pageKey, title, sections, and navigation.' },
    select: { type: 'boolean' },
  },
);

export const EDITOR_UPDATE_SLOT_TOOL = tool(
  'editor_update_slot',
  'Update an existing semantic slot by slotKey. Never use real nodeId here.',
  ['slotKey', 'props'],
  {
    slotKey: { type: 'string', description: 'Semantic slot key from TemplateProfile.' },
    pageKey: { type: 'string', description: 'Optional semantic page key.' },
    props: { type: 'object', description: 'Only editable props declared by the slot.' },
    select: { type: 'boolean' },
  },
);

export const EDITOR_FILL_PATTERN_TOOL = tool(
  'editor_fill_pattern',
  'Fill a repeated semantic pattern such as product cards, order cards, grids, or lists.',
  ['patternKey', 'items'],
  {
    patternKey: { type: 'string', description: 'Semantic pattern key from TemplateProfile.' },
    pageKey: { type: 'string', description: 'Optional semantic page key.' },
    items: { type: 'array', items: { type: 'object' }, description: 'Structured item data mapped to pattern fields.' },
    replaceExisting: { type: 'boolean' },
    select: { type: 'boolean' },
  },
);

export const EDITOR_CREATE_PAGE_FROM_PAGE_KIND_TOOL = tool(
  'editor_create_page_from_page_kind',
  'Create a page by pageKind. The system chooses the reference page; AI must not pass referencePageId.',
  ['pageKind', 'name'],
  {
    pageKind: { type: 'string', description: 'Semantic page kind such as order, profile, category, home.' },
    name: { type: 'string', description: 'New page title/name.' },
    contentIntent: { type: 'string', description: 'Short natural-language content intent.' },
    activate: { type: 'boolean' },
    select: { type: 'boolean' },
    syncNavigation: { type: 'boolean' },
  },
);

export const EDITOR_REPLACE_SECTION_TOOL = tool(
  'editor_replace_section',
  'Replace or update a replaceable semantic region using existing section patterns. Do not freehand arbitrary layout.',
  ['regionKey', 'sectionKind'],
  {
    regionKey: { type: 'string', description: 'Semantic region key from TemplateProfile.' },
    sectionKind: { type: 'string', description: 'Section kind to apply.' },
    pageKey: { type: 'string', description: 'Optional semantic page key.' },
    content: { type: 'object', description: 'Section content payload.' },
    patternKey: { type: 'string', description: 'Optional compatible pattern key.' },
    select: { type: 'boolean' },
  },
);

export const EDITOR_SEARCH_NODES_TOOL = tool(
  'editor_search_nodes',
  [
    'Find existing nodes by visible text, alias, or page.',
    'Returns real node ids. Call this before editing an existing node when its id is not already',
    'in the selected node, a Resolved target line, or a previous candidates list.',
    'This does not modify the document.',
  ].join(' '),
  [],
  {
    text: {
      type: 'string',
      description: 'Visible text, label, or words from the user request.',
    },
    alias: {
      type: 'string',
      description: 'Component alias such as core.text or core.button.',
    },
    pageId: {
      type: 'string',
      description: 'Optional page id to search.',
    },
  },
);

export function runEditorSearchTool(
  name: string,
  args: Record<string, unknown>,
  document: ThemeLayoutDocument | undefined,
): { output: string } | null {
  if (name !== EDITOR_SEARCH_NODES_TOOL.name) {
    return null;
  }
  if (!document) {
    return { output: JSON.stringify({ error: 'No document is available to search.' }) };
  }
  const text = typeof args.text === 'string' ? args.text : undefined;
  const alias = typeof args.alias === 'string' ? args.alias : undefined;
  const pageId = typeof args.pageId === 'string' ? args.pageId : undefined;
  if (!text?.trim() && !alias?.trim()) {
    return {
      output: JSON.stringify({ error: 'Provide text or alias to search existing nodes.' }),
    };
  }
  return {
    output: JSON.stringify({
      nodes: searchEditorNodes(document, { text, alias, pageId }),
    }),
  };
}

export const EDITOR_SEMANTIC_TOOLS = [
  EDITOR_SUBMIT_PAGE_SPEC_TOOL,
  EDITOR_UPDATE_SLOT_TOOL,
  EDITOR_FILL_PATTERN_TOOL,
  EDITOR_CREATE_PAGE_FROM_PAGE_KIND_TOOL,
  EDITOR_REPLACE_SECTION_TOOL,
] as const satisfies readonly AgentProviderTool[];

export const EDITOR_BATCH_EDIT_TOOL = tool(
  'editor_batch_edit',
  'Execute multiple atomic editor tool edits in a single batch call ' +
    '(e.g. updating several node props, inserting multiple sibling components, ' +
    'or combining prop updates with layout updates).',
  ['edits'],
  {
    edits: {
      type: 'array',
      minItems: 1,
      description: 'Ordered list of atomic editor tool invocations to execute together.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['tool', 'args'],
        properties: {
          tool: {
            type: 'string',
            description:
              'Name of the atomic editor tool to run ' +
              '(e.g. editor_update_props, editor_insert_node, editor_delete_node, ' +
              'editor_set_layout, editor_update_slot).',
          },
          args: {
            type: 'object',
            description: 'Arguments object for that atomic editor tool.',
          },
        },
      },
    },
    reason: { type: 'string' },
  },
);

export const EDITOR_EDIT_TOOLS = [
  EDITOR_SEARCH_NODES_TOOL,
  ...EDITOR_SEMANTIC_TOOLS,
  EDITOR_BATCH_EDIT_TOOL,
  EDITOR_CREATE_PAGE_FROM_REFERENCE_TOOL,
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

export function selectEditorEditTools(_promptText?: string): AgentProviderTool[] {
  // Keep the tool schema list stable across turns so prompt prefix caching stays intact.
  return [...EDITOR_EDIT_TOOLS];
}

function mergeFlatProps(args: Record<string, unknown>): Record<string, unknown> {
  if (typeof args.props === 'object' && args.props !== null) {
    return { ...(args.props as Record<string, unknown>) };
  }

  const legacyKeys = [
    'text',
    'label',
    'title',
    'placeholder',
    'name',
    'variant',
    'tone',
    'href',
    'icon',
    'activeTab',
    'propsJson',
    'tabs',
    'src',
    'alt',
    'objectFit',
    'type',
    'target',
    'value',
    'disabled',
    'max',
    'gap',
    'columns',
    'size',
    'color',
    'library',
    'renderer',
    'data',
  ];
  const props: Record<string, unknown> = {};
  for (const key of legacyKeys) {
    if (key === 'propsJson' && typeof args.propsJson === 'string') {
      try {
        Object.assign(props, JSON.parse(args.propsJson));
      } catch {
        /* ignore invalid JSON */
      }
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
    if (skip.has(key) || value === undefined) {
      continue;
    }
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
    case EDITOR_SEARCH_NODES_TOOL.name:
      throw new Error('editor_search_nodes is read-only and does not create operations.');
    case EDITOR_SUBMIT_PAGE_SPEC_TOOL.name: {
      return { operations: [{ type: 'submit_page_spec', spec: args.spec, select: args.select }], reason };
    }
    case EDITOR_UPDATE_SLOT_TOOL.name: {
      const base = cleanBaseArgs(args);
      return { operations: [{ ...base, type: 'update_slot' }], reason };
    }
    case EDITOR_FILL_PATTERN_TOOL.name: {
      const base = cleanBaseArgs(args);
      return { operations: [{ ...base, type: 'fill_pattern' }], reason };
    }
    case EDITOR_CREATE_PAGE_FROM_PAGE_KIND_TOOL.name: {
      const base = cleanBaseArgs(args);
      return { operations: [{ ...base, type: 'create_page_from_page_kind' }], reason };
    }
    case EDITOR_REPLACE_SECTION_TOOL.name: {
      const base = cleanBaseArgs(args);
      return { operations: [{ ...base, type: 'replace_section' }], reason };
    }
    case EDITOR_CREATE_PAGE_FROM_REFERENCE_TOOL.name: {
      const base = cleanBaseArgs(args);
      return { operations: [{ ...base, type: 'create_page_from_reference' }], reason };
    }
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
          'update_props requires at least one prop to update. ' +
            'Provide props={"key":"value"} with at least one property.',
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
        operations: [
          {
            ...base,
            type: args.semanticTarget === 'page_footer_nav' ? 'sync_footer_tabs' : 'sync_page_navigation',
          },
        ],
        reason,
      };
    }
    case EDITOR_BATCH_EDIT_TOOL.name: {
      const edits = Array.isArray(args.edits) ? args.edits : [];
      const operations: EditorOperation[] = [];
      for (const item of edits) {
        if (!item || typeof item !== 'object') {
          continue;
        }
        const subTool = typeof (item as { tool?: unknown }).tool === 'string' ? (item as { tool: string }).tool : '';
        const subArgs =
          (item as { args?: unknown }).args && typeof (item as { args?: unknown }).args === 'object'
            ? (item as { args: Record<string, unknown> }).args
            : {};
        if (!subTool || subTool === EDITOR_BATCH_EDIT_TOOL.name || subTool === EDITOR_SEARCH_NODES_TOOL.name) {
          continue;
        }
        const converted = editorToolCallToOperations(subTool, subArgs);
        operations.push(...converted.operations);
      }
      return {
        operations,
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
