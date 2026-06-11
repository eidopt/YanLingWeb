import type { ProviderTool } from '@shared/agent/contracts/provider';

/**
 * PR-B.1: extend the tool schema with optional `reviseActions` so the LLM
 * can return structured, machine-parseable fix instructions alongside the
 * human-readable `suggestion`. The runtime parse path (see
 * `DiversityCriticAgent.parseVerdict`) validates each action by `type` and
 * forwards the surviving list through `CriticVerdict.reviseActions` so the
 * pipeline can format it into the next attempt's revise suggestion.
 *
 * Each `type` has its own required fields — see the discriminator. Variants
 * mirror `ReviseAction` in `pipeline.types.ts` and stay in sync with it.
 */
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
      reviseActions: {
        type: 'array',
        description: '结构化的修订动作清单（可选）。与 suggestion 互补，方便下游按动作类型路由。',
        items: {
          type: 'object',
          required: ['type'],
          properties: {
            type: {
              type: 'string',
              enum: ['add_section', 'replace_section', 'adjust_layout', 'improve_contrast'],
            },
            afterRegion: { type: 'string', description: 'add_section: 插入位置参考 region' },
            sectionKind: { type: 'string', description: 'add_section: 期望新增的 section 类型' },
            regionKey: {
              type: 'string',
              description: 'replace_section / adjust_layout / improve_contrast: 目标 region key',
            },
            newKind: { type: 'string', description: 'replace_section: 替换后的 kind' },
            direction: {
              type: 'string',
              enum: ['row', 'column'],
              description: 'adjust_layout: 期望的布局方向',
            },
            suggestion: { type: 'string', description: 'improve_contrast: 对比度调整建议' },
          },
        },
      },
    },
  },
};
