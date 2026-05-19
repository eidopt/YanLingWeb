import { SEMANTIC_TARGET_ROLE_VALUES } from 'ui/editor/services/semanticTargets';

const EDITOR_OPERATION_TYPES = [
  'create_page',
  'delete_page',
  'insert_node',
  'update_props',
  'set_layout',
  'set_frame',
  'move_node',
  'delete_node',
  'update_interactions',
  'sync_page_navigation',
  'sync_footer_tabs',
] as const;

export const APPLY_EDITOR_EDITS_TOOL = {
  name: 'apply_editor_edits',
  description: `Apply local edits to the editor's pages and current canvas.

Use this tool for incremental UI changes instead of regenerating the whole
template. It supports creating pages, inserting components, updating props,
changing layout, changing absolute frame values, moving nodes, deleting nodes,
deleting pages, updating navigation interactions, and syncing page navigation.

Prefer small, auditable operations that preserve the user's manual edits.

To add a new page, use create_page first. Then insert sections under that new
page rootNodeId. Do not insert core.screen directly.

To remove an empty or duplicate page, use delete_page with the real pageId from
Known editor pages. Do not delete a footer or root screen node to remove a page.

When page navigation should match the current pages, use sync_page_navigation.
For bottom navigation, set semanticTarget to page_footer_nav. It rewrites the
navigation tabs and targets from Known editor pages.`,
  parameters: {
    type: 'object',
    required: ['operations'],
    properties: {
      operations: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          required: ['type'],
          properties: {
            type: {
              type: 'string',
              enum: EDITOR_OPERATION_TYPES,
            },
            pageId: {
              type: 'string',
              description:
                'Target page id. Required for delete_page and optional for '
                + 'operations on a specific page.',
            },
            name: {
              type: 'string',
              description: 'Page name for create_page.',
            },
            rootNodeId: {
              type: 'string',
              description:
                'Root core.screen node id to create for create_page.',
            },
            alias: {
              type: 'string',
              description: 'Component alias to insert, e.g. core.panel.',
            },
            nodeId: {
              type: 'string',
              description:
                'Target node id from the current canvas outline, or optional '
                + 'id for inserted node. Do not invent ids.',
            },
            semanticTarget: {
              type: 'string',
              enum: SEMANTIC_TARGET_ROLE_VALUES,
              description:
                'Optional global semantic role when the user refers to a '
                + 'region like 页面底栏, 顶部栏, 搜索框, or 主按钮 and a real '
                + 'nodeId is not obvious.',
            },
            parentId: {
              type: 'string',
              description: 'Container node id for insertion or move-to-end.',
            },
            targetId: {
              type: 'string',
              description: 'Sibling node id for before/after operations.',
            },
            position: {
              type: 'string',
              enum: ['before', 'after', 'inside_end'],
            },
            axis: {
              type: 'string',
              enum: ['horizontal', 'vertical'],
            },
            props: {
              type: 'object',
              description: 'Props patch validated against component descriptors.',
            },
            layout: {
              type: 'object',
              description: 'Layout patch for mode, width, order, grid, etc.',
            },
            frame: {
              type: 'object',
              description: 'Absolute positioning frame patch.',
            },
            interactions: {
              type: 'object',
              description:
                'Interaction patch, including navigate actions and onTabClick maps.',
            },
            activate: {
              type: 'boolean',
              description: 'Whether create_page should switch to the new page.',
            },
            select: {
              type: 'boolean',
              description: 'Whether the editor should select the affected node.',
            },
          },
        },
      },
      reason: {
        type: 'string',
        description: 'Short user-facing summary of the intended edit.',
      },
    },
  },
} as const;
