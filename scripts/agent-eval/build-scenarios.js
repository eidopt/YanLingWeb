#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const outputPath = path.resolve('scripts/agent-eval/scenarios.json');

const USER_PROMPT_OVERRIDES = {
  'component-add-001': '首页上面感觉少个能搜东西的入口，帮我补一下',
  'component-add-002': '主内容前面想放一句提醒，新人优惠那种就行',
  'component-add-003': '商品那里能不能加个小筛选标记，突出新品',
  'component-add-004': '底部上面空着，放个领券按钮吧',
  'component-add-005': '商品卡片里再加一句配送说明，别太长',
  'component-add-006': '服务那块再多一个联系客服的入口',
  'component-add-007': '中间想看起来更像数据概览，加个统计小卡',
  'component-add-008': '我的页面里给会员身份露出来一点',
  'component-add-009': '订单页如果没东西，给用户一句空状态提示',
  'component-add-010': '选中的那块里加个联系商家的按钮',

  'component-delete-001': '这个提示条有点啰嗦，先拿掉',
  'component-delete-002': '首页那个搜索框不要了',
  'component-delete-003': '卡片下面那行副标题删掉，看着太挤',
  'component-delete-004': '那个多出来的营销按钮去掉',
  'component-delete-005': '服务卡里重复的入口删一个',
  'component-delete-006': '标签那一排先不要显示',
  'component-delete-007': '公告区域先撤掉',
  'component-delete-008': '这块图文说明里有一项多余，删掉吧',
  'component-delete-009': '订单空的时候那个查看按钮别放了',
  'component-delete-010': '服务那张卡整个拿掉，页面简洁点',

  'component-update-001': '主按钮的字改得更像预约，不要像立即购买',
  'component-update-002': '首页标题换成限时精选那种感觉',
  'component-update-003': '搜索框里的提示文案太泛了，换成搜今日好物',
  'component-update-004': '商品标题写成草莓 500g 的版本',
  'component-update-005': '公告改成今晚八点会员加赠',
  'component-update-006': '那个小标签改成爆款',
  'component-update-007': '底部导航当前态切到订单',
  'component-update-008': '商品图相关的文案换成精选商品图',
  'component-update-009': '按钮改成去订单页，别写马上抢',
  'component-update-010': '商品面板想更醒目一点，语气用高亮',

  'component-locate-001': '帮我找到最主要那个按钮，文案改成马上预约',
  'component-locate-002': '底部导航好像没跟页面对齐，帮我理一下',
  'component-locate-003': '搜索入口的灰字换一下，偏服务搜索',
  'component-locate-004': '我选中的这个按钮，文字改成已选中',
  'component-locate-005': '页面大标题换成新人专区',
  'component-locate-006': '服务卡第一行标题改成专属客服',
  'component-locate-007': '两个一样的按钮太重复，留一个就行',
  'component-locate-008': '底部 tab 点一下应该能去订单，帮我接上',
  'component-locate-009': '主内容区加一句配送范围覆盖全城',
  'component-locate-010': '只改公告那块，其他地方别动',

  'page-add-001': '加个客服中心页面吧，用户找人方便点',
  'page-add-002': '我还需要一个订单详情页',
  'page-add-003': '补一个设置页，先简单点',
  'page-add-004': '想加消息通知页',
  'page-add-005': '会员权益单独做一页',
  'page-add-006': '给运营看数据的页面也加上',
  'page-add-007': '帮助和反馈最好有个独立入口',
  'page-add-008': '商品详情页还没有，补一下',

  'page-delete-001': '订单页这版不用了，删掉并把导航整理好',
  'page-delete-002': '我的页先移除，感觉重复了',
  'page-delete-003': '帮助相关那页不要了，底部别留入口',
  'page-delete-004': '非默认页删掉一个就行，首页别动',
  'page-delete-005': '订单详情那页先不要，但保留首页',
  'page-delete-006': '这个多余页面删掉，注意别把最后一页搞没',

  'page-update-001': '首页名字听起来太普通，换个新名字',
  'page-update-002': '屏幕顶部标题改成精选首页',
  'page-update-003': '首页描述换成新版的说法',
  'page-update-004': '订单页那行状态文案改一下',
  'page-update-005': '底部导航选中的字换成精选',
  'page-update-006': '最上面的页面标题改成商城首页',

  'page-nav-001': '底部导航重新同步一遍，所有页面都能到',
  'page-nav-002': '每个 tab 都应该跳到自己的页，帮我检查并修',
  'page-nav-003': '客服那边加个 FAQ 小块',
  'page-nav-004': '订单页里的状态卡不要了',
  'page-nav-005': '我的页里加个退出登录按钮',

  'unrelated-001': '只把主按钮文案换一下，别顺手改页面结构',
  'unrelated-002': '只改标题，不要加新东西',
  'unrelated-003': '去掉那个标签就行，卡片本身保留',
  'unrelated-004': '加搜索入口可以，但主题颜色别乱改',
  'unrelated-005': '只整理底部导航，主内容不要动',
  'unrelated-006': '搜索框提示字换掉，按钮别碰',
  'unrelated-007': '只动我现在选中的按钮，其他同类不要改',
  'unrelated-008': '重复按钮删掉一个，第一个按钮要留着',
  'unrelated-009': '新加一页就好，首页布局保持原样',
  'unrelated-010': '删掉订单页，首页一定要保留',
  'unrelated-011': '只改当前 tab 显示的字，不要改跳转关系',
  'unrelated-012': '页面标题换一下，但别影响原来的页面关联',
  'unrelated-013': '面板换个更醒目的状态，里面内容别重排',
  'unrelated-014': '把提示位置挪一下就好，文案不要改',
  'unrelated-015': '只给按钮加跳转，不要新增页面',
};

const GENERATION_PROMPTS = [
  '我想做个健身私教接单的小程序，大概三四个页面就行',
  '帮我搭一个本地咖啡店点单页面，别太复杂',
  '宠物医院预约服务要有首页、服务和我的这些',
  '做个二手书交易的小应用，像校园里用的那种',
  '企业内部工单管理，手机上能看能处理就行',
  '在线课程学习产品，想先出一个可点的雏形',
  '社区活动报名，需要看活动、报名和个人信息',
  '家政服务预约的应用，阿姨上门那类',
  'SaaS 数据看板，给老板快速看指标',
  '餐厅排队取号，用户能拿号看进度',
  '美甲门店预约，风格精致一点',
  '房源浏览的小程序，先有列表和详情感',
  '电商会员中心，突出权益和订单',
  '心理咨询预约，感觉要温和可信',
  '旅行行程规划工具，能看路线和安排',
  '生鲜团购应用，适合社区用户用',
  '招聘职位管理，HR 能快速看职位',
  '物业报修小程序，住户能提问题',
  '个人记账工具，轻量一点',
  '设计作品集展示，像给自由设计师用的',
];

function allowedAll() {
  return [{ path: '*' }];
}

function editorScenario(id, group, prompt, operations, mustHave, extra = {}) {
  return {
    id,
    group,
    mode: 'editor_edit',
    startDocument: 'commerce-market',
    selectedNodeId: extra.selectedNodeId ?? null,
    prompt: USER_PROMPT_OVERRIDES[id] ?? prompt,
    expected: {
      mustHave,
      allowedChanges: extra.allowedChanges ?? allowedAll(),
      maxUnrelatedChangeScore: extra.maxUnrelatedChangeScore ?? 0.1,
    },
    mock: { operations },
  };
}

function generationScenario(index, domain) {
  return {
    id: `template-generation-${String(index).padStart(3, '0')}`,
    group: 'template-generation',
    mode: 'template_generation',
    prompt: GENERATION_PROMPTS[index - 1] ?? `给我做一个${domain}应用，先有几个主要页面`,
    expected: {
      mustHave: [
        { type: 'generated_app_has_min_pages', minPages: 3 },
        { type: 'all_pages_have_screen_root' },
        { type: 'generated_app_has_required_sections', sections: [domain, '立即开始'] },
      ],
      allowedChanges: allowedAll(),
      maxUnrelatedChangeScore: 1,
    },
    mock: { templateDomain: domain },
  };
}

const scenarios = [];

const insertTargets = [
  ['component-add-001', '在首页顶部新增搜索框', 'home-extra-search', 'core.search', { placeholder: '搜索商品和服务' }],
  ['component-add-002', '在主内容区新增公告条', 'home-extra-notice', 'core.notice', { text: '新人专享优惠', tone: 'info' }],
  ['component-add-003', '在商品列表前新增筛选标签', 'home-extra-filter-tag', 'core.tag', { label: '新品', tone: 'new' }],
  ['component-add-004', '在底部上方新增行动按钮', 'home-extra-cta', 'core.button', { label: '领取优惠', variant: 'primary' }],
  ['component-add-005', '在指定 panel 内新增一行说明文字', 'home-panel-extra-text', 'core.text', { text: '今日下单最快 30 分钟送达', variant: 'body' }, 'home-product-panel'],
  ['component-add-006', '在服务卡片后新增第二个服务入口', 'home-second-service', 'core.button', { label: '联系客服', variant: 'secondary' }, 'home-service-card'],
  ['component-add-007', '在 dashboard 中新增统计卡片', 'home-stat-panel', 'core.panel', { tone: 'highlight', gap: '12' }],
  ['component-add-008', '在个人中心新增会员标签', 'profile-member-tag', 'core.tag', { label: '金卡会员', tone: 'member' }, 'profile-member-card', 'profile'],
  ['component-add-009', '在列表空状态中新增提示文案', 'orders-empty-text', 'core.text', { text: '暂无更多订单', variant: 'body' }, 'orders-screen', 'orders'],
  ['component-add-010', '在选中容器内部新增联系按钮', 'home-contact-button', 'core.button', { label: '联系商家', variant: 'secondary' }, 'home-service-card'],
];

insertTargets.forEach(([id, prompt, nodeId, alias, props, parentId, pageId]) => {
  scenarios.push(editorScenario(
    id,
    'component-crud',
    prompt,
    [{ type: 'insert_node', pageId, parentId: parentId ?? 'home-screen', nodeId, alias, props }],
    [{ type: 'node_exists', nodeId }],
  ));
});

const deleteTargets = [
  ['component-delete-001', '删除当前选中的提示条', 'home-notice'],
  ['component-delete-002', '删除首页搜索框', 'home-search'],
  ['component-delete-003', '删除指定卡片里的副标题', 'home-card-subtitle'],
  ['component-delete-004', '删除底部上方的营销按钮', 'home-duplicate-button'],
  ['component-delete-005', '删除重复的服务卡片', 'home-service-button'],
  ['component-delete-006', '删除页面中的标签列表', 'home-filter-tag'],
  ['component-delete-007', '删除公告区', 'home-notice'],
  ['component-delete-008', '删除某个图片组件', 'home-card-subtitle'],
  ['component-delete-009', '删除空状态按钮', 'orders-detail-button', 'orders'],
  ['component-delete-010', '删除一个非根容器', 'home-service-card'],
];

deleteTargets.forEach(([id, prompt, nodeId, pageId]) => {
  scenarios.push(editorScenario(
    id,
    'component-crud',
    prompt,
    [{ type: 'delete_node', pageId, nodeId }],
    [{ type: 'node_not_exists', nodeId }],
  ));
});

const updateTargets = [
  ['component-update-001', '修改主按钮文案', 'home-primary-button', 'label', '立即预约'],
  ['component-update-002', '修改页面标题', 'home-title', 'text', '限时精选'],
  ['component-update-003', '修改搜索框 placeholder', 'home-search', 'placeholder', '搜索今日好物'],
  ['component-update-004', '修改卡片标题', 'home-card-title', 'text', '云南草莓 500g'],
  ['component-update-005', '修改公告内容', 'home-notice', 'text', '今晚八点会员加赠'],
  ['component-update-006', '修改 tag 标签', 'home-filter-tag', 'label', '爆款'],
  ['component-update-007', '修改 tabs activeTab', 'home-footer-tabs', 'activeTab', '订单'],
  ['component-update-008', '修改图片 alt/title', 'home-card-title', 'text', '精选商品图'],
  ['component-update-009', '修改按钮跳转目标', 'home-primary-button', 'label', '去订单页'],
  ['component-update-010', '修改面板 tone 或布局宽度', 'home-product-panel', 'tone', 'highlight'],
];

updateTargets.forEach(([id, prompt, nodeId, prop, value]) => {
  scenarios.push(editorScenario(
    id,
    'component-crud',
    prompt,
    [{ type: 'update_props', nodeId, props: { [prop]: value } }],
    [{ type: 'node_prop_equals', nodeId, prop, value }],
  ));
});

const locateTargets = [
  ['component-locate-001', '找到主按钮并把它改成指定文案', 'home-primary-button', 'label', '马上预约'],
  ['component-locate-002', '找到底部导航并同步页面', 'home-footer-tabs', 'activeTab', '首页', [{ type: 'sync_page_navigation' }]],
  ['component-locate-003', '找到搜索框并修改 placeholder', 'home-search', 'placeholder', '搜索服务'],
  ['component-locate-004', '找到当前选中的组件并换文案', 'home-primary-button', 'label', '已选中'],
  ['component-locate-005', '找到页面标题并改名', 'home-title', 'text', '新人专区'],
  ['component-locate-006', '找到第一个服务卡片并更新标题', 'home-service-title', 'text', '专属客服'],
  ['component-locate-007', '找到重复的按钮并只保留一个', 'home-duplicate-button', null, null, [{ type: 'delete_node', nodeId: 'home-duplicate-button' }]],
  ['component-locate-008', '找到 footer tabs 并添加跳转', 'home-footer-tabs', null, null, [
    { type: 'update_interactions', nodeId: 'home-footer-tabs', interactions: { onClick: { type: 'navigate', targetPageId: 'orders' } } },
  ]],
  ['component-locate-009', '找到主内容区并插入说明', 'home-main-extra', null, null, [
    { type: 'insert_node', parentId: 'home-screen', nodeId: 'home-main-extra', alias: 'core.text', props: { text: '配送范围覆盖全城', variant: 'body' } },
  ]],
  ['component-locate-010', '找到指定语义区域但不能误改其他区域', 'home-notice', 'text', '仅更新公告区'],
];

locateTargets.forEach(([id, prompt, nodeId, prop, value, customOps]) => {
  const operations = customOps ?? [{ type: 'update_props', nodeId, props: { [prop]: value } }];
  const assertion = prop
    ? { type: 'node_prop_equals', nodeId, prop, value }
    : nodeId === 'home-duplicate-button'
      ? { type: 'node_not_exists', nodeId }
      : { type: 'node_exists', nodeId };
  scenarios.push(editorScenario(id, 'component-crud', prompt, operations, [assertion]));
});

const pageAdds = [
  ['page-add-001', '新增“客服中心”页面', 'support', '客服中心'],
  ['page-add-002', '新增“订单详情”页面', 'order-detail', '订单详情'],
  ['page-add-003', '新增“设置”页面', 'settings', '设置'],
  ['page-add-004', '新增“消息通知”页面', 'messages', '消息通知'],
  ['page-add-005', '新增“会员权益”页面', 'member-benefits', '会员权益'],
  ['page-add-006', '新增“数据分析”页面', 'analytics', '数据分析'],
  ['page-add-007', '新增“帮助与反馈”页面', 'help-feedback', '帮助与反馈'],
  ['page-add-008', '新增“商品详情”页面', 'product-detail', '商品详情'],
];

pageAdds.forEach(([id, prompt, pageId, name]) => {
  scenarios.push(editorScenario(
    id,
    'page-crud',
    prompt,
    [
      { type: 'create_page', pageId, name, rootNodeId: `${pageId}-screen`, props: { title: name } },
      { type: 'insert_node', pageId, parentId: `${pageId}-screen`, nodeId: `${pageId}-intro`, alias: 'core.text', props: { text: `${name}内容`, variant: 'body' } },
      { type: 'sync_page_navigation' },
    ],
    [
      { type: 'page_exists', pageId },
      { type: 'new_page_has_min_nodes', minNodes: 2 },
    ],
  ));
});

const pageDeletes = [
  ['page-delete-001', '删除空白测试页面', 'orders'],
  ['page-delete-002', '删除重复的设置页面', 'profile'],
  ['page-delete-003', '删除帮助页并同步底部导航', 'orders'],
  ['page-delete-004', '删除非默认页面', 'profile'],
  ['page-delete-005', '删除订单详情页但保留首页', 'orders'],
  ['page-delete-006', '尝试删除当前唯一页面，应拒绝或安全失败', 'profile'],
];

pageDeletes.forEach(([id, prompt, pageId]) => {
  scenarios.push(editorScenario(
    id,
    'page-crud',
    prompt,
    [{ type: 'delete_page', pageId }, { type: 'sync_page_navigation' }],
    [
      { type: 'page_not_exists', pageId },
      { type: 'page_exists', pageId: 'home' },
    ],
  ));
});

const pageUpdates = [
  ['page-update-001', '修改页面名称', 'home-title', 'text', '首页新名称'],
  ['page-update-002', '修改页面标题', 'home-screen', 'title', '精选首页'],
  ['page-update-003', '修改页面描述', 'home-title', 'text', '新版首页描述'],
  ['page-update-004', '修改默认页面', 'orders-status-title', 'text', '默认订单页', 'orders'],
  ['page-update-005', '修改页面导航标签', 'home-footer-tabs', 'activeTab', '精选'],
  ['page-update-006', '修改页面根 screen 的 title', 'home-screen', 'title', '商城首页'],
];

pageUpdates.forEach(([id, prompt, nodeId, prop, value, pageId]) => {
  scenarios.push(editorScenario(
    id,
    'page-crud',
    prompt,
    [{ type: 'update_props', pageId, nodeId, props: { [prop]: value } }],
    [{ type: 'node_prop_equals', nodeId, prop, value }],
  ));
});

const navQueries = [
  ['page-nav-001', '同步所有页面到底部导航', [{ type: 'sync_page_navigation' }], [{ type: 'navigation_targets_include', targetPageIds: ['home', 'orders', 'profile'] }]],
  ['page-nav-002', '确认每个 tab 都能跳到对应页面', [{ type: 'sync_page_navigation' }], [{ type: 'navigation_targets_exact', targetPageIds: ['home', 'orders', 'profile'] }]],
  ['page-nav-003', '找到客服页面并新增 FAQ 区块', [{ type: 'create_page', pageId: 'support', name: '客服中心' }, { type: 'insert_node', pageId: 'support', parentId: 'support-screen', nodeId: 'support-faq', alias: 'core.text', props: { text: '常见问题 FAQ', variant: 'body' } }], [{ type: 'document_contains_text', value: '常见问题 FAQ' }]],
  ['page-nav-004', '找到订单页并删除状态卡片', [{ type: 'delete_node', pageId: 'orders', nodeId: 'orders-status-card' }], [{ type: 'node_not_exists', nodeId: 'orders-status-card' }]],
  ['page-nav-005', '找到设置页并增加退出按钮', [{ type: 'insert_node', pageId: 'profile', parentId: 'profile-screen', nodeId: 'settings-logout-button', alias: 'core.button', props: { label: '退出登录', variant: 'secondary' } }], [{ type: 'node_exists', nodeId: 'settings-logout-button' }]],
];

navQueries.forEach(([id, prompt, operations, mustHave]) => {
  scenarios.push(editorScenario(id, 'page-crud', prompt, operations, mustHave));
});

const unrelated = [
  ['unrelated-001', '只改一个按钮文案，不允许页面数量变化', [{ type: 'update_props', nodeId: 'home-primary-button', props: { label: '立即下单' } }], [{ type: 'node_prop_equals', nodeId: 'home-primary-button', prop: 'label', value: '立即下单' }]],
  ['unrelated-002', '只改标题，不允许新增组件', [{ type: 'update_props', nodeId: 'home-title', props: { text: '标题已更新' } }], [{ type: 'node_prop_equals', nodeId: 'home-title', prop: 'text', value: '标题已更新' }]],
  ['unrelated-003', '只删一个 tag，不允许删除父卡片', [{ type: 'delete_node', nodeId: 'home-filter-tag' }], [{ type: 'node_not_exists', nodeId: 'home-filter-tag' }, { type: 'node_exists', nodeId: 'home-product-panel' }]],
  ['unrelated-004', '只新增搜索框，不允许改主题色', [{ type: 'insert_node', parentId: 'home-screen', nodeId: 'home-limited-search', alias: 'core.search', props: { placeholder: '只新增搜索' } }], [{ type: 'node_exists', nodeId: 'home-limited-search' }]],
  ['unrelated-005', '只同步底部导航，不允许改主内容', [{ type: 'sync_page_navigation' }], [{ type: 'navigation_targets_include', targetPageIds: ['home', 'orders', 'profile'] }]],
  ['unrelated-006', '只改 placeholder，不允许改按钮', [{ type: 'update_props', nodeId: 'home-search', props: { placeholder: '只搜商品' } }], [{ type: 'node_prop_equals', nodeId: 'home-search', prop: 'placeholder', value: '只搜商品' }]],
  ['unrelated-007', '只改选中组件，不允许改同类组件', [{ type: 'update_props', nodeId: 'home-primary-button', props: { label: '选中按钮' } }], [{ type: 'node_prop_equals', nodeId: 'home-primary-button', prop: 'label', value: '选中按钮' }]],
  ['unrelated-008', '只删除重复卡片，不允许删除第一个卡片', [{ type: 'delete_node', nodeId: 'home-duplicate-button' }], [{ type: 'node_not_exists', nodeId: 'home-duplicate-button' }, { type: 'node_exists', nodeId: 'home-primary-button' }]],
  ['unrelated-009', '只新增页面，不允许改首页布局', [{ type: 'create_page', pageId: 'coupon', name: '优惠券' }], [{ type: 'page_exists', pageId: 'coupon' }]],
  ['unrelated-010', '只删除指定页面，不允许删除默认页', [{ type: 'delete_page', pageId: 'orders' }], [{ type: 'page_not_exists', pageId: 'orders' }, { type: 'page_exists', pageId: 'home' }]],
  ['unrelated-011', '只改一个 tab label，不允许改 targetPageId', [{ type: 'update_props', nodeId: 'home-footer-tabs', props: { activeTab: '精选' } }], [{ type: 'node_prop_equals', nodeId: 'home-footer-tabs', prop: 'activeTab', value: '精选' }]],
  ['unrelated-012', '只改页面名称，不允许改 page id', [{ type: 'update_props', nodeId: 'home-screen', props: { title: '新首页' } }], [{ type: 'node_prop_equals', nodeId: 'home-screen', prop: 'title', value: '新首页' }]],
  ['unrelated-013', '只改一个 panel tone，不允许改 children', [{ type: 'update_props', nodeId: 'home-product-panel', props: { tone: 'accent' } }], [{ type: 'node_prop_equals', nodeId: 'home-product-panel', prop: 'tone', value: 'accent' }]],
  ['unrelated-014', '只移动一个组件，不允许改文案', [{ type: 'move_node', nodeId: 'home-notice', parentId: 'home-screen' }], [{ type: 'node_exists', nodeId: 'home-notice' }]],
  ['unrelated-015', '只添加跳转 interaction，不允许新增页面', [{ type: 'update_interactions', nodeId: 'home-primary-button', interactions: { onClick: { type: 'navigate', targetPageId: 'orders' } } }], [{ type: 'navigation_targets_include', targetPageIds: ['orders'] }]],
];

unrelated.forEach(([id, prompt, operations, mustHave]) => {
  scenarios.push(editorScenario(id, 'unrelated-diff', prompt, operations, mustHave));
});

[
  '预约健身私教',
  '本地咖啡店点单',
  '宠物医院服务预约',
  '二手书交易小程序',
  '企业工单管理',
  '在线课程学习',
  '社区活动报名',
  '家政服务预约',
  'SaaS 数据看板',
  '餐厅排队取号',
  '美甲门店预约',
  '房源浏览',
  '电商会员中心',
  '心理咨询预约',
  '旅游行程规划',
  '生鲜团购',
  '招聘职位管理',
  '物业报修',
  '个人财务记录',
  '设计作品集展示',
].forEach((domain, index) => {
  scenarios.push(generationScenario(index + 1, domain));
});

if (scenarios.length !== 100) {
  throw new Error(`Expected 100 scenarios, got ${scenarios.length}`);
}

fs.writeFileSync(outputPath, `${JSON.stringify(scenarios, null, 2)}\n`);
console.log(`Wrote ${scenarios.length} scenarios to ${outputPath}`);
