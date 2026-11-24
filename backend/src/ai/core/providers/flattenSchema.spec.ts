import { analyzeSchema, flattenSchema, type JsonSchema, nestArguments } from './flattenSchema';

describe('flattenSchema', () => {
  it('leaves a shallow schema unchanged', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: {
        nodeId: { type: 'string' },
        text: { type: 'string' },
      },
      required: ['nodeId'],
    };

    expect(analyzeSchema(schema).shouldFlatten).toBe(false);
    expect(flattenSchema(schema)).toBe(schema);
  });

  it('flattens object properties deeper than two levels and preserves required paths', () => {
    const schema: JsonSchema = {
      type: 'object',
      required: ['operation'],
      properties: {
        operation: {
          type: 'object',
          required: ['target'],
          properties: {
            type: { type: 'string' },
            target: {
              type: 'object',
              required: ['path'],
              properties: {
                path: { type: 'string', description: 'File path' },
                range: { type: 'string' },
              },
            },
          },
        },
      },
    };

    const flat = flattenSchema(schema);

    expect(flat.properties?.['operation.type']).toEqual({ type: 'string' });
    expect(flat.properties?.['operation.target.path']).toEqual({
      type: 'string',
      description: 'File path',
    });
    expect(flat.properties?.['operation.target.range']).toEqual({ type: 'string' });
    expect(flat.required).toEqual(['operation.target.path']);
    expect(analyzeSchema(flat).maxDepth).toBeLessThanOrEqual(2);
  });

  it('flattens object fields inside array items and nests arguments back', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: {
        edits: {
          type: 'array',
          items: {
            type: 'object',
            required: ['tool'],
            properties: {
              tool: { type: 'string' },
              args: {
                type: 'object',
                required: ['nodeId'],
                properties: {
                  nodeId: { type: 'string' },
                  props: {
                    type: 'object',
                    properties: { text: { type: 'string' } },
                  },
                },
              },
            },
          },
        },
      },
    };

    const flat = flattenSchema(schema);
    const editsSchema = flat.properties?.edits;
    const items = editsSchema === undefined ? undefined : editsSchema.items;
    const itemSchema = items && !Array.isArray(items) ? items : undefined;

    expect(itemSchema?.properties?.tool).toEqual({ type: 'string' });
    expect(itemSchema?.properties?.['args.nodeId']).toEqual({ type: 'string' });
    expect(itemSchema?.properties?.['args.props.text']).toEqual({ type: 'string' });
    expect(itemSchema?.required).toEqual(['tool']);

    expect(
      nestArguments({
        edits: [
          { tool: 'editor_update_props', 'args.nodeId': 'title', 'args.props.text': '新标题' },
        ],
      }),
    ).toEqual({
      edits: [
        { tool: 'editor_update_props', args: { nodeId: 'title', props: { text: '新标题' } } },
      ],
    });
  });
});
