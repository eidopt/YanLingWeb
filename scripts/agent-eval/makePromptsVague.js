import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const scenariosPath = path.join(__dirname, 'scenarios.json');

const componentHints = [
  ['primary-button', '主按钮'],
  ['search', '搜索入口'],
  ['notice', '提示区域'],
  ['filter', '商品筛选那块'],
  ['coupon', '领券入口'],
  ['shipping', '配送说明'],
  ['contact', '联系入口'],
  ['stats', '数据概览'],
  ['member', '会员信息'],
  ['empty', '空状态'],
  ['service', '服务卡片'],
  ['subtitle', '副标题'],
  ['promo', '营销入口'],
  ['tag', '标签区域'],
  ['announcement', '公告区域'],
  ['image', '图片文案'],
  ['panel', '商品面板'],
  ['tab', '底部切换'],
  ['nav', '底部切换'],
  ['button', '按钮'],
  ['title', '标题'],
];

const pageHints = new Map([
  ['support', '客服相关'],
  ['order-detail', '订单详情'],
  ['settings', '设置相关'],
  ['notifications', '消息提醒'],
  ['member', '会员权益'],
  ['analytics', '数据运营'],
  ['help', '帮助反馈'],
  ['product-detail', '商品详情'],
  ['orders', '订单相关'],
  ['profile', '个人中心'],
  ['home', '首页'],
  ['faq', '常见问题'],
]);

const generationHints = new Map([
  ['template-generation-001', '健身私教'],
  ['template-generation-002', '本地咖啡店'],
  ['template-generation-003', '宠物医院预约'],
  ['template-generation-004', '校园二手书'],
  ['template-generation-005', '企业内部工单'],
  ['template-generation-006', '在线课程学习'],
  ['template-generation-007', '社区活动报名'],
  ['template-generation-008', '家政上门预约'],
  ['template-generation-009', 'SaaS 数据看板'],
  ['template-generation-010', '餐厅排队取号'],
  ['template-generation-011', '美甲门店预约'],
  ['template-generation-012', '房源浏览'],
  ['template-generation-013', '电商会员中心'],
  ['template-generation-014', '心理咨询预约'],
  ['template-generation-015', '旅行行程规划'],
  ['template-generation-016', '社区生鲜团购'],
  ['template-generation-017', '招聘职位管理'],
  ['template-generation-018', '物业报修'],
  ['template-generation-019', '个人记账'],
  ['template-generation-020', '设计作品集'],
]);

function componentHint(scenario) {
  const ids = [
    scenario.selectedNodeId,
    scenario.expected?.mustHave?.[0]?.nodeId,
    scenario.mock?.operations?.[0]?.nodeId,
    scenario.mock?.operations?.[0]?.targetNodeId,
  ]
    .filter(Boolean)
    .join(' ');

  for (const [needle, label] of componentHints) {
    if (ids.includes(needle)) return label;
  }
  return '这块内容';
}

function pageHint(scenario) {
  const expected = scenario.expected?.mustHave?.[0];
  const op = scenario.mock?.operations?.[0];
  const ids = [expected?.pageId, ...(expected?.targetPageIds || []), op?.pageId, op?.targetPageId].filter(Boolean);

  for (const id of ids) {
    if (pageHints.has(id)) return pageHints.get(id);
  }
  return '相关页面';
}

function vagueComponentPrompt(scenario) {
  const op = scenario.mock?.operations?.[0];
  const hint = componentHint(scenario);

  switch (op?.type) {
    case 'insert_node':
      return `${hint}这里感觉少了点东西，按当前页面语境补一个合适的小入口`;
    case 'delete_node':
      return `${hint}看着有点多余，帮我精简掉一处就好`;
    case 'update_props':
      return `${hint}现在不太贴切，帮我换成更合适的表达`;
    case 'sync_page_navigation':
      return '底部切换好像有点乱，帮我顺一下';
    case 'update_interactions':
      return `${hint}点起来应该去相关位置，帮我接顺`;
    default:
      return '这块感觉不太对，帮我按当前页面语境调整一下';
  }
}

function vaguePagePrompt(scenario) {
  const op = scenario.mock?.operations?.[0];
  const hint = pageHint(scenario);

  switch (op?.type) {
    case 'create_page':
      return `这个流程里好像还缺一个偏${hint}的页面，先补个简单可用的`;
    case 'delete_page':
      return `${hint}那块这版先不用，帮我整理干净`;
    case 'update_props':
      return `${hint}的叫法和顶部表达有点普通，帮我顺成新版感觉`;
    case 'sync_page_navigation':
      return '几个页面之间的底部切换不太稳，帮我统一整理一下';
    case 'insert_node':
      return `${hint}里感觉少个基础动作，补一个就行`;
    case 'delete_node':
      return `${hint}里有个信息块不太需要了，帮我拿掉`;
    default:
      return `${hint}相关的页面结构帮我顺一下，别大改`;
  }
}

function vagueUnrelatedPrompt(scenario) {
  const op = scenario.mock?.operations?.[0];
  const hint = op?.type === 'create_page' || op?.type === 'delete_page' ? pageHint(scenario) : componentHint(scenario);

  switch (op?.type) {
    case 'insert_node':
      return `${hint}可以补一点，但其他区域不要顺手调整`;
    case 'delete_node':
      return `${hint}里多余的那处拿掉就行，周围内容保持住`;
    case 'update_props':
      return `只把${hint}那处表达顺一下，其他同类内容别跟着改`;
    case 'sync_page_navigation':
      return '只把底部切换关系顺一下，页面主体别动';
    case 'create_page':
      return `补一个偏${hint}的页面就好，现有首页布局保持原样`;
    case 'delete_page':
      return `${hint}那页先去掉，关键页面别误删`;
    case 'move_node':
      return `${hint}位置稍微挪一下就好，文字和样式别改`;
    case 'update_interactions':
      return `${hint}只接一下跳转，别新增别的东西`;
    default:
      return `只处理${hint}这一小处，其他地方保持原样`;
  }
}

function vagueGenerationPrompt(scenario) {
  const hint = generationHints.get(scenario.id) || '这个方向';
  return `想做一个偏${hint}的小应用，先搭个能点的雏形，页面和细节你看着安排`;
}

function vaguePrompt(scenario) {
  if (scenario.mode === 'template_generation') return vagueGenerationPrompt(scenario);
  if (scenario.group === 'unrelated-diff') return vagueUnrelatedPrompt(scenario);
  if (scenario.group === 'page-crud') return vaguePagePrompt(scenario);
  return vagueComponentPrompt(scenario);
}

const scenarios = JSON.parse(fs.readFileSync(scenariosPath, 'utf8'));
for (const scenario of scenarios) {
  scenario.prompt = vaguePrompt(scenario);
}

fs.writeFileSync(scenariosPath, `${JSON.stringify(scenarios, null, 2)}\n`);
console.log(`Updated ${scenarios.length} prompts in ${path.relative(process.cwd(), scenariosPath)}`);
