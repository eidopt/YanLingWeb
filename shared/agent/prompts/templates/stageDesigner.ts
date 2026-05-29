import { TEMPLATE_PIPELINE_SHARED_SPEC } from './sharedSpec';

/**
 * Stage 1 — Designer
 *
 * 输入：业务种子（关键词 / 行业 / 平台 / 目标用户）
 * 输出：结构化设计 brief — 不写 schema，只写设计决策。
 *
 * 关键约束：
 *  - 必须显式选 archetype + heroMode，并说出"为什么"
 *  - brief 通过工具调用以结构化 JSON 返回，便于下游 stage 程序化消费
 *  - 不输出 markdown 解释，只输出工具调用
 */
const STAGE_DESIGNER_TAIL = [
  '',
  '# Stage 1 — Designer',
  '',
  '你是流水线的设计师。给定业务种子，产出**设计 brief**（不是 schema）。',
  '',
  '## 必须决定的字段',
  '',
  '1. archetype：fresh / immersive / editorial / vibrant / dark-pro',
  '2. heroMode：8 种入口模式之一',
  '3. platform：mini-program / mobile-app / web',
  '4. 业务场景：一句话锚定（"X 的 Y 服务"）',
  '5. 目标用户画像：一句话',
  '6. 信息架构：3-6 个页面，每页明确用户任务 + 主操作',
  '7. cssVars 设计 token：**按业务品类自选主色**（餐饮暖橙、医疗清爽蓝绿、',
  '   金融稳重墨色、社交活泼撞色…，不要默认紫蓝），主色1+强调1+中性梯度；',
  '   **必须完整输出主题色契约必填键**（--accent, --surface, --surface-muted,',
  '   --text-heading-color, --text-body-color, --text-muted-color, --panel-bg,',
  '   --panel-border, --border-color），渲染器不会回退到平台色；',
  '   按 archetype 再加 --hero-bg / --metric-card-bg 等场景 token',
  '8. componentTemplates 草案：列出 2-4 个 biz-* alias 和它们的角色',
  '9. 跨页一致性：bottom tabs label、卡片骨架、tag tone 语义',
  '',
  '## 必须给出的理由',
  '',
  '- whyArchetype：为什么这个原型适配这个业务（不可空）',
  '- whyHeroMode：为什么这个首屏模式适配这个业务（不可空）',
  '- diversitySignature：一行字描述视觉签名（用于下游 diversity check）',
  '',
  '## 输出语言',
  '',
  '- 所有中文字段（模板名、tagline、页面名、bottom tabs label、',
  '  componentTemplates 描述）必须用简体中文',
  '- 结构性字段（templateId、archetype、heroMode、category、alias slug、',
  '  whyArchetype、whyHeroMode、diversitySignature、scenario、audience）',
  '  用英文',
  '',
  '## 输出',
  '',
  '调用工具 `submit_template_brief` 一次。不要输出 markdown 或解释文字。',
].join('\n');

export const STAGE_DESIGNER_SYSTEM_PROMPT = TEMPLATE_PIPELINE_SHARED_SPEC + STAGE_DESIGNER_TAIL;
