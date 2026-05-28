import type { ProviderTool } from '@shared/agent/runtime/providerTypes';

export const SUBMIT_DIVERSITY_VERDICT_TOOL: ProviderTool = {
  name: 'submit_diversity_verdict',
  description: '提交多样性审查 verdict。Stage 2 Critic 的唯一输出方式。',
  parameters: {
    type: 'object',
    required: ['verdict', 'conflicts'],
    properties: {
      verdict: { type: 'string', enum: ['pass', 'revise'] },
      conflicts: {
        type: 'array',
        items: {
          type: 'object',
          required: ['templateId', 'dimension', 'description'],
          properties: {
            templateId: { type: 'string', description: '冲突参照的模板 id' },
            dimension: {
              type: 'string',
              enum: ['archetype', 'heroMode', 'componentTemplate', 'color-hue', 'signature'],
            },
            description: { type: 'string', description: '中文一句话冲突说明' },
          },
        },
      },
      suggestion: {
        type: 'string',
        description: '如果 verdict=revise，给出明确的换什么的中文建议',
      },
    },
  },
};
