import type { ProviderTool } from '@shared/agent/contracts/provider';

export const SUBMIT_VERIFIER_VERDICT_TOOL: ProviderTool = {
  name: 'submit_verifier_verdict',
  description:
    '提交 verifier 审查 verdict。Stage 4 的唯一输出方式（无论哪个 lens 都用同一个工具）。',
  parameters: {
    type: 'object',
    required: ['pass', 'failures', 'summary'],
    properties: {
      pass: {
        type: 'boolean',
        description: '是否通过审查。任何 error 都必须 pass=false',
      },
      failures: {
        type: 'array',
        items: {
          type: 'object',
          required: ['rule', 'severity', 'description'],
          properties: {
            rule: {
              type: 'string',
              description: '违反的规则名（如 "archetype-not-landed"、"flex-conflict"）',
            },
            severity: { type: 'string', enum: ['error', 'warning'] },
            description: { type: 'string', description: '中文一句话说明' },
            location: { type: 'string', description: '可选：节点 id 或页面 id' },
          },
        },
      },
      summary: { type: 'string', description: '一句话总结审查结论（中文）' },
    },
  },
};
