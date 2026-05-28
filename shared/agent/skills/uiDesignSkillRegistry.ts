export type UiTargetPlatform =
  | 'mini-program'
  | 'mobile-app'
  | 'tablet-app'
  | 'web';

export type UiRenderSurface = 'app-shell' | 'web-page';

export interface UiDesignSkill {
  id: string;
  targetPlatforms: UiTargetPlatform[];
  intentCategories: string[];
  promptSummary: string;
  sourcePath?: string;
}

export interface UiDesignSkillContext {
  targetPlatforms: UiTargetPlatform[];
  renderSurface: UiRenderSurface;
  selectedSkillIds: string[];
  selectedSkills: UiDesignSkill[];
}

const UI_DESIGN_SKILLS: UiDesignSkill[] = [
  {
    id: 'wechat-miniprogram-ui',
    targetPlatforms: ['mini-program'],
    intentCategories: ['mini_program', 'commerce', 'service_booking'],
    sourcePath: '.claude/skills/wechat-miniprogram-ui/SKILL.md',
    promptSummary: [
      'WeChat mini program UI rules:',
      '- Use compact phone-first screens with clear WeChat-style top chrome and safe-area-aware bottom navigation.',
      '- Prefer core.screen with props.surface="mini-program" and props.chrome="wechat".',
      '- Use bottom tabs for multi-page consumer flows, large tap targets, list/card patterns.',
      '- Include loading, empty, and error states.',
      '- Keep all generated ThemeLayoutDocument units web-compatible; do not use rpx in schema style values.',
    ].join('\n'),
  },
  {
    id: 'mobile-app-ui',
    targetPlatforms: ['mobile-app', 'tablet-app'],
    intentCategories: ['mobile_app', 'web_app', 'commerce', 'service_booking', 'dashboard'],
    sourcePath: '.claude/skills/mobile-app-ui/SKILL.md',
    promptSummary: [
      'Mobile app UI rules:',
      '- Design for iOS/Android app surfaces, not WeChat-specific WXML/TDesign conventions.',
      '- Prefer core.screen with props.surface="mobile-app" and props.chrome="app".',
      '- Use app navigation patterns: bottom tabs for consumer apps.',
      '- Use toolbar/sidebar only when tablet or dashboard use is explicit.',
      '- Keep controls touch-friendly, stateful, and scannable.',
      '- Include loading, empty, disabled, success, and error states.',
    ].join('\n'),
  },
  {
    id: 'website-ui',
    targetPlatforms: ['web'],
    intentCategories: ['marketing_site', 'web_app', 'dashboard', 'presentation'],
    sourcePath: '.claude/skills/website-ui/SKILL.md',
    promptSummary: [
      'Website UI rules:',
      '- Design for responsive web pages rather than phone app chrome.',
      '- Prefer core.screen with props.surface="web" and props.chrome="none".',
      '- Use long-page sections, desktop-friendly grids, clear navigation, and mobile-safe stacking.',
      '- Make first viewport content strong and explicit.',
      '- For SaaS/admin dashboards, prioritize dense scannable layouts.',
      '- For marketing sites, prioritize CTA clarity and proof.',
    ].join('\n'),
  },
];

const PLATFORM_KEYWORDS: Record<UiTargetPlatform, string[]> = {
  'mini-program': [
    'mini program',
    'miniprogram',
    'wechat',
    'weixin',
    '\u5c0f\u7a0b\u5e8f',
    '\u5fae\u4fe1',
  ],
  'mobile-app': [
    'mobile app',
    'ios',
    'android',
    '\u624b\u673aapp',
    '\u79fb\u52a8app',
    '\u624b\u673a\u5e94\u7528',
    '\u79fb\u52a8\u5e94\u7528',
  ],
  'tablet-app': [
    'tablet',
    'ipad',
    'pad',
    '\u5e73\u677f',
  ],
  web: [
    'website',
    'web site',
    'web app',
    'landing',
    'saas',
    'desktop',
    '\u7f51\u7ad9',
    '\u5b98\u7f51',
    '\u7f51\u9875',
    '\u684c\u9762',
    '\u540e\u53f0',
    '\u7ba1\u7406\u7cfb\u7edf',
  ],
};

function normalizePrompt(prompt: string): string {
  return prompt.trim().toLowerCase();
}

function matchesAny(prompt: string, keywords: readonly string[]): boolean {
  return keywords.some((keyword) => prompt.includes(keyword.toLowerCase()));
}

function uniquePlatforms(platforms: UiTargetPlatform[]): UiTargetPlatform[] {
  return Array.from(new Set(platforms));
}

export function inferUiDesignSkillContext(
  prompt: string,
  matchedCategories: readonly string[] = [],
): UiDesignSkillContext {
  const normalizedPrompt = normalizePrompt(prompt);
  const platforms = uniquePlatforms(
    (Object.keys(PLATFORM_KEYWORDS) as UiTargetPlatform[])
      .filter((platform) => matchesAny(normalizedPrompt, PLATFORM_KEYWORDS[platform])),
  );
  const targetPlatforms: UiTargetPlatform[] = platforms.length
    ? platforms
    : ['mobile-app'];
  const renderSurface: UiRenderSurface =
    targetPlatforms.includes('web') && !targetPlatforms.includes('mini-program')
      && !targetPlatforms.includes('mobile-app')
      ? 'web-page'
      : 'app-shell';
  const matchedCategorySet = new Set(matchedCategories);
  const selectedSkills = UI_DESIGN_SKILLS.filter((skill) => {
    const platformMatched = skill.targetPlatforms.some((platform) =>
      targetPlatforms.includes(platform));
    const categoryMatched = skill.intentCategories.some((category) =>
      matchedCategorySet.has(category));
    return platformMatched || categoryMatched;
  });

  return {
    targetPlatforms,
    renderSurface,
    selectedSkillIds: selectedSkills.map((skill) => skill.id),
    selectedSkills,
  };
}

export function formatUiDesignSkillContextForPrompt(
  context: UiDesignSkillContext,
): string {
  return [
    'Selected UI design skills:',
    `- targetPlatforms: ${context.targetPlatforms.join(', ')}`,
    `- renderSurface: ${context.renderSurface}`,
    `- selectedSkillIds: ${context.selectedSkillIds.join(', ') || 'none'}`,
    ...context.selectedSkills.map((skill) => [
      '',
      `Skill: ${skill.id}`,
      skill.promptSummary,
    ].join('\n')),
  ].join('\n');
}

export function getUiDesignSkills(): readonly UiDesignSkill[] {
  return UI_DESIGN_SKILLS;
}
