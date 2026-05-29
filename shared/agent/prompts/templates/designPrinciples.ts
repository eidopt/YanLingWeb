/**
 * 设计原则契约 — 注入模板生成流水线，约束生成模板的视觉品质与主题色完整性。
 *
 * 两个职责：
 *  1. `TEMPLATE_DESIGN_PRINCIPLES`：反「AI 味」、现代活泼、配色/对比/排版规则的文本，
 *     被 sharedSpec 拼入所有 stage prompt（缓存前缀的一部分，须为静态字符串）。
 *  2. `REQUIRED_THEME_CONTRACT_KEYS` / `RECOMMENDED_THEME_CONTRACT_KEYS`：渲染器消费的
 *     主题色 cssVars 契约。模板必须在 cssVars 显式输出这些键 —— 渲染器不再回退到平台
 *     `--app-*` token（见 src/styles/render-contract.css）。校验器据此强制。
 *
 * 注意：下方契约键列表的「文本说明」与 REQUIRED/RECOMMENDED 数组必须保持同步。
 */

/** 必填：缺失会被 cssVars 契约校验器判为 error。 */
export const REQUIRED_THEME_CONTRACT_KEYS = [
  '--accent',
  '--surface',
  '--surface-muted',
  '--text-heading-color',
  '--text-body-color',
  '--text-muted-color',
  '--panel-bg',
  '--panel-border',
  '--border-color',
] as const;

/** 推荐：缺失仅 warning，建议补全以获得完整视觉。 */
export const RECOMMENDED_THEME_CONTRACT_KEYS = [
  '--text-subheading-color',
  '--text-caption-color',
  '--btn-pill-bg',
  '--btn-pill-color',
  '--tag-neutral-bg',
  '--tag-neutral-color',
  '--tag-success-bg',
  '--tag-success-color',
  '--tag-warning-bg',
  '--tag-warning-color',
] as const;

export const TEMPLATE_DESIGN_PRINCIPLES = [
  '## 设计原则（反 AI · 现代活泼）',
  '',
  '生成的模板必须看起来像「真实产品团队做的」，而不是「AI 默认审美」。',
  '',
  '### 禁止的 AI 套路',
  '- 禁止「紫→蓝渐变铺满深色背景 + 居中卡片网格 + 通体 glow」这套默认审美',
  '- 禁止用低饱和安全灰糊出「没人味」的界面',
  '- 禁止只靠把主色改一下来表达模板身份（必须有结构/排版差异）',
  '- 不要每页都是 panel+text+button 的重复堆叠',
  '',
  '### 现代活泼的做法',
  '- 明确三种角色：主色（品牌）/ 强调色（点睛，仅用于关键 CTA 和高亮）/ 中性梯度（大面积底与文字）',
  '- 足够的对比：前景文字与背景对比至少达到 WCAG AA',
  '- 克制而有重点的留白与圆角；点睛色不要大面积铺',
  '- 大面积背景用中性或极低透明度的品牌色，不要用高饱和色块铺底',
  '',
  '### 按品类自选配色（不强制统一色）',
  '- 餐饮/生活：暖橙、珊瑚、番茄红等暖色；电商：活力主色 + 中性',
  '- 医疗/健康：清爽蓝绿；金融/工具：稳重蓝/墨色 + 克制强调',
  '- 社交/内容：活泼撞色；教育：友好明亮',
  '- 每个模板：主色 1 + 强调 1 + 中性梯度；语义色（成功/警告/危险）需与主色可区分',
  '',
  '### 排版',
  '- 清晰层级：display/heading/subheading/body/caption 各司其职，字重拉开对比',
  '- 行长与行高适度；每页最多 1 个 display',
  '',
  '## 主题色契约（cssVars 必填 —— 硬规则）',
  '',
  '渲染器只认模板自己声明的主题色，**不会**回退到平台主题。因此每个模板的 cssVars',
  '必须**显式且完整**地输出下列键（否则渲染会落到中性默认、丢失模板个性）：',
  '',
  '- 必填：--accent, --surface, --surface-muted, --text-heading-color,',
  '  --text-body-color, --text-muted-color, --panel-bg, --panel-border, --border-color',
  '- 推荐补全：--text-subheading-color, --text-caption-color, --btn-pill-bg,',
  '  --btn-pill-color, 以及用到的 --tag-*-bg / --tag-*-color',
  '- 可加业务语义 token：--hero-bg, --metric-card-bg, --coupon-bg, --radius-card 等',
  '- 所有颜色值用合法 CSS 颜色（#hex / rgb() / hsl()），值与背景对比满足可读性',
].join('\n');
