export interface LightweightIntentPlan {
  category: 'create' | 'edit' | 'delete' | 'navigate' | 'unknown';
  confidence: number;
  keywords: string[];
}

export function planLightweightIntent(prompt: string): LightweightIntentPlan {
  const normalized = prompt.toLowerCase();
  const rules: [LightweightIntentPlan['category'], string[]][] = [
    ['create', ['新增', '添加', '创建', '生成', 'add', 'create', 'generate']],
    ['edit', ['修改', '改成', '更新', '调整', 'edit', 'update', 'change']],
    ['delete', ['删除', '移除', 'delete', 'remove']],
    ['navigate', ['导航', '跳转', '同步', 'tab', 'tabs', 'navigation']],
  ];
  for (const [category, keywords] of rules) {
    const matched = keywords.filter((keyword) => normalized.includes(keyword));
    if (matched.length > 0) {
      return { category, confidence: Math.min(1, 0.55 + matched.length * 0.15), keywords: matched };
    }
  }
  return { category: 'unknown', confidence: 0.2, keywords: [] };
}

export function formatLightweightIntentPlanForPrompt(plan: LightweightIntentPlan): string {
  return [
    'Lightweight intent plan:',
    `category: ${plan.category}`,
    `confidence: ${plan.confidence.toFixed(2)}`,
    `keywords: ${plan.keywords.join(', ') || 'none'}`,
  ].join('\n');
}
