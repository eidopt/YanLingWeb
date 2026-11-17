export const REQUIRED_THEME_CONTRACT_KEYS = [
  '--accent', '--surface', '--surface-muted', '--text-heading-color',
  '--text-body-color', '--text-muted-color', '--panel-bg', '--panel-border', '--border-color',
] as const;

export const RECOMMENDED_THEME_CONTRACT_KEYS = [
  '--text-subheading-color', '--text-caption-color', '--btn-pill-bg', '--btn-pill-color',
  '--tag-neutral-bg', '--tag-neutral-color', '--tag-success-bg', '--tag-success-color',
  '--tag-warning-bg', '--tag-warning-color',
] as const;

export const TEMPLATE_DESIGN_PRINCIPLES = [
  '## 设计原则',
  '',
  '三个颜色角色：主色(品牌)/强调色(CTA/高亮)/中性梯度(大面积底/文字)',
  '对比达 WCAG AA；点睛色不铺大面积；大面积背景用低透明品牌色',
  '',
  '按行业选配色：commerce=暖橙/珊瑚，service=青绿/松石，health=蓝绿/薄荷，',
  'finance=深蓝/墨色，content=墨蓝/靛蓝，education=明黄/天蓝，',
  'social=渐变紫/粉，marketing=品牌色+对比补色',
  '',
  '每个模板检查：页面拓扑是否与同品类模板不同？hero 入口模式是否不同？',
  '卡片组合方式是否不同？主色系是否拉开差距？用了至少 2 种 variant 特征？',
  '',
  '## 主题色契约（cssVars 必填）',
  '',
  '渲染器只认模板自己的 cssVars，不会回退到平台主题。必须显式完整输出：',
  '- 必填：--accent, --surface, --surface-muted, --text-heading-color,',
  '  --text-body-color, --text-muted-color, --panel-bg, --panel-border, --border-color',
  '- 推荐补全：--text-subheading-color, --text-caption-color, --btn-pill-*, --tag-*-*',
  '- 可加业务语义：--hero-bg, --metric-card-bg, --coupon-bg, --radius-card 等',
  '- 所有颜色合法 CSS（#hex/rgb/hsl），值与背景对比满足可读性',
].join('\n');
