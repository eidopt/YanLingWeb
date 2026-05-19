import { AI_SEMANTIC_TARGET_ROLE_VALUES } from '../semantic-targets.config';

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

Only use node ids that appear in the current canvas outline. Component catalog
aliases are insertable components, not existing node ids. Existing backend static
templates are concrete core.* nodes; edit text by updating exact node props such
as core.text.text, core.button.label, core.tag.label, core.search.placeholder,
core.tabs.activeTab, or core.screen.title.

To add a new page, use create_page first. Then insert sections under that new
page rootNodeId. Do not insert core.screen directly. Use pageId only when an
operation should target a specific existing page; without pageId, operations
after create_page target the newly created page.

To remove an empty or duplicate page, use delete_page with the real pageId from
Known editor pages. Do not delete a footer or root screen node to remove a page.

When page navigation should match the current pages, use sync_page_navigation.
For bottom navigation, set semanticTarget to page_footer_nav. It rewrites the
navigation tabs and targets from Known editor pages.

Only core.screen, core.panel, core.stack, core.row, and core.grid can receive
children. Other aliases are leaf nodes; update their props instead of inserting
inside them.`,
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
              description: 'Target node id, or optional id for inserted node.',
            },
            semanticTarget: {
              type: 'string',
              enum: AI_SEMANTIC_TARGET_ROLE_VALUES,
              description:
                'Optional global semantic role when the user refers to a '
                + 'region like 页面底栏, 顶部栏, 搜索框, or 主按钮 and a real '
                + 'nodeId is not obvious.',
            },
            parentId: {
              type: 'string',
              description:
                'Container node id for insertion or move-to-end. Must be one '
                + 'of core.screen, core.panel, core.stack, core.row, or core.grid.',
            },
            targetId: {
              type: 'string',
              description:
                'Sibling node id for before/after operations. Use with the '
                + 'sibling parent as parentId.',
            },
            position: {
              type: 'string',
              description:
                'For insert_node, use before/after only. For move_node, '
                + 'inside_end means append to parentId.',
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
                'Interaction patch, e.g. { onClick: { type: "navigate", '
                + 'targetPageId: "page-id" } } or onTabClick map.',
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
