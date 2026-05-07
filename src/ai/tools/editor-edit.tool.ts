export const APPLY_EDITOR_EDITS_TOOL = {
  name: 'apply_editor_edits',
  description: `Apply local edits to the currently open editor canvas.

Use this tool for incremental UI changes instead of regenerating the whole
template. It supports inserting components, updating props, changing layout,
changing absolute frame values, moving nodes, and deleting nodes.

Prefer small, auditable operations that preserve the user's manual edits.`,
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
              enum: [
                'insert_node',
                'update_props',
                'set_layout',
                'set_frame',
                'move_node',
                'delete_node',
              ],
            },
            alias: {
              type: 'string',
              description: 'Component alias to insert, e.g. core.panel.',
            },
            nodeId: {
              type: 'string',
              description: 'Target node id, or optional id for inserted node.',
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
