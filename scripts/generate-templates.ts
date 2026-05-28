/**
 * Template Generator Script
 *
 * Generates ThemeLayoutDocument JSON files for the template database.
 * Each category gets a set of templates with varied visual styles.
 *
 * Usage: npx ts-node scripts/generate-templates.ts [--category commerce] [--count 10]
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// ─── Types ────────────────────────────────────────────────────────

interface ThemeLayoutNode {
  id: string;
  alias: string;
  slot?: 'body' | 'footer';
  layout: { mode: 'flow' | 'grid' | 'absolute'; order?: number; width?: string; height?: string; minHeight?: string };
  frame?: Record<string, unknown>;
  props?: Record<string, unknown>;
  interactions?: Record<string, unknown>;
  children?: ThemeLayoutNode[];
}

interface ThemeLayoutDocument {
  version: number;
  themeId: string;
  themeName: string;
  pageName: string;
  description: string;
  components: { alias: string; name: string; kind: string; description: string; props: { name: string; type: string; enum?: string[] }[] }[];
  defaultPageId: string;
  pages: { id: string; name: string; layout: ThemeLayoutNode }[];
  layout: ThemeLayoutNode;
  cssVars: Record<string, string>;
  dependencies?: { name: string; url: string }[];
}

// ─── Component Catalog ────────────────────────────────────────────

const COMPONENTS = [
  { alias: 'core.screen', name: 'Screen', kind: 'layout', description: 'Page root', props: [{ name: 'title', type: 'string' }, { name: 'surface', type: 'string', enum: ['mini-program', 'mobile-app', 'web'] }, { name: 'chrome', type: 'string', enum: ['wechat', 'app', 'none'] }] },
  { alias: 'core.panel', name: 'Panel', kind: 'layout', description: 'Card', props: [{ name: 'tone', type: 'string', enum: ['default', 'accent', 'promo', 'warm', 'soft', 'member', 'highlight'] }, { name: 'gap', type: 'string' }, { name: 'title', type: 'string' }] },
  { alias: 'core.stack', name: 'Stack', kind: 'layout', description: 'Vertical', props: [{ name: 'gap', type: 'string' }, { name: 'alignItems', type: 'string' }] },
  { alias: 'core.row', name: 'Row', kind: 'layout', description: 'Horizontal', props: [{ name: 'gap', type: 'string' }, { name: 'wrap', type: 'boolean' }, { name: 'justify', type: 'string' }, { name: 'align', type: 'string' }] },
  { alias: 'core.grid', name: 'Grid', kind: 'layout', description: 'Grid', props: [{ name: 'gap', type: 'string' }, { name: 'columns', type: 'number' }] },
  { alias: 'core.text', name: 'Text', kind: 'component', description: 'Text', props: [{ name: 'text', type: 'string' }, { name: 'variant', type: 'string', enum: ['display', 'heading', 'subheading', 'body', 'caption', 'price', 'title', 'subtitle'] }] },
  { alias: 'core.button', name: 'Button', kind: 'component', description: 'Button', props: [{ name: 'label', type: 'string' }, { name: 'variant', type: 'string', enum: ['primary', 'secondary', 'link', 'pill'] }] },
  { alias: 'core.image', name: 'Image', kind: 'component', description: 'Image', props: [{ name: 'src', type: 'string' }, { name: 'alt', type: 'string' }, { name: 'objectFit', type: 'string', enum: ['cover', 'contain', 'fill'] }] },
  { alias: 'core.search', name: 'Search', kind: 'component', description: 'Search', props: [{ name: 'placeholder', type: 'string' }] },
  { alias: 'core.tabs', name: 'Tabs', kind: 'component', description: 'Tabs', props: [{ name: 'tabs', type: 'string[]' }, { name: 'activeTab', type: 'string' }] },
  { alias: 'core.tag', name: 'Tag', kind: 'component', description: 'Tag', props: [{ name: 'label', type: 'string' }, { name: 'tone', type: 'string', enum: ['neutral', 'success', 'warning', 'info', 'hot', 'new', 'deal', 'member'] }] },
  { alias: 'core.notice', name: 'Notice', kind: 'component', description: 'Notice', props: [{ name: 'text', type: 'string' }, { name: 'tone', type: 'string', enum: ['info', 'warning', 'error', 'success', 'neutral'] }] },
  { alias: 'core.divider', name: 'Divider', kind: 'component', description: 'Divider', props: [] },
  { alias: 'core.spacer', name: 'Spacer', kind: 'component', description: 'Spacer', props: [{ name: 'size', type: 'string' }] },
  { alias: 'core.avatar', name: 'Avatar', kind: 'component', description: 'Avatar', props: [{ name: 'text', type: 'string' }, { name: 'size', type: 'string', enum: ['small', 'medium', 'large'] }, { name: 'shape', type: 'string', enum: ['circle', 'square'] }] },
  { alias: 'core.badge', name: 'Badge', kind: 'component', description: 'Badge', props: [{ name: 'count', type: 'number' }, { name: 'dot', type: 'boolean' }] },
  { alias: 'core.progress', name: 'Progress', kind: 'component', description: 'Progress', props: [{ name: 'value', type: 'number' }, { name: 'max', type: 'number' }, { name: 'tone', type: 'string', enum: ['neutral', 'accent', 'success', 'warning', 'info'] }] },
  { alias: 'core.statistic', name: 'Statistic', kind: 'component', description: 'Statistic', props: [{ name: 'title', type: 'string' }, { name: 'value', type: 'string' }, { name: 'trend', type: 'string', enum: ['up', 'down', 'neutral'] }] },
  { alias: 'core.input', name: 'Input', kind: 'component', description: 'Input', props: [{ name: 'placeholder', type: 'string' }, { name: 'label', type: 'string' }] },
  { alias: 'core.select', name: 'Select', kind: 'component', description: 'Select', props: [{ name: 'label', type: 'string' }, { name: 'placeholder', type: 'string' }, { name: 'options', type: 'string[]' }] },
  { alias: 'core.list', name: 'List', kind: 'layout', description: 'List', props: [{ name: 'bordered', type: 'boolean' }] },
  { alias: 'core.list-item', name: 'ListItem', kind: 'layout', description: 'ListItem', props: [{ name: 'title', type: 'string' }, { name: 'description', type: 'string' }, { name: 'arrow', type: 'boolean' }] },
  { alias: 'core.carousel', name: 'Carousel', kind: 'component', description: 'Carousel', props: [{ name: 'images', type: 'string[]' }, { name: 'autoplay', type: 'boolean' }] },
  { alias: 'core.empty', name: 'Empty', kind: 'component', description: 'Empty', props: [{ name: 'text', type: 'string' }, { name: 'actionLabel', type: 'string' }] },
  { alias: 'core.navbar', name: 'NavBar', kind: 'layout', description: 'NavBar', props: [{ name: 'title', type: 'string' }, { name: 'leftArrow', type: 'boolean' }] },
  { alias: 'core.tabbar', name: 'TabBar', kind: 'component', description: 'TabBar', props: [{ name: 'items', type: 'string[]' }, { name: 'active', type: 'string' }] },
  { alias: 'core.form', name: 'Form', kind: 'layout', description: 'Form', props: [{ name: 'labelWidth', type: 'string' }, { name: 'labelAlign', type: 'string', enum: ['left', 'right', 'top'] }] },
  { alias: 'core.collapse', name: 'Collapse', kind: 'layout', description: 'Collapse', props: [{ name: 'title', type: 'string' }, { name: 'expanded', type: 'boolean' }] },
  { alias: 'core.rate', name: 'Rate', kind: 'component', description: 'Rate', props: [{ name: 'value', type: 'number' }, { name: 'count', type: 'number' }] },
  { alias: 'core.dialog', name: 'Dialog', kind: 'layout', description: 'Dialog', props: [{ name: 'title', type: 'string' }, { name: 'visible', type: 'boolean' }] },
  { alias: 'core.toast', name: 'Toast', kind: 'component', description: 'Toast', props: [{ name: 'message', type: 'string' }, { name: 'type', type: 'string', enum: ['info', 'success', 'warning', 'error'] }] },
  { alias: 'core.alert', name: 'Alert', kind: 'component', description: 'Alert', props: [{ name: 'text', type: 'string' }, { name: 'type', type: 'string', enum: ['info', 'success', 'warning', 'error'] }] },
  { alias: 'core.loading', name: 'Loading', kind: 'component', description: 'Loading', props: [{ name: 'text', type: 'string' }, { name: 'type', type: 'string', enum: ['spinner', 'skeleton'] }] },
  { alias: 'core.skeleton', name: 'Skeleton', kind: 'component', description: 'Skeleton', props: [{ name: 'rows', type: 'number' }, { name: 'animated', type: 'boolean' }] },
  { alias: 'core.breadcrumb', name: 'Breadcrumb', kind: 'component', description: 'Breadcrumb', props: [{ name: 'items', type: 'string[]' }, { name: 'separator', type: 'string' }] },
  { alias: 'core.pagination', name: 'Pagination', kind: 'component', description: 'Pagination', props: [{ name: 'current', type: 'number' }, { name: 'total', type: 'number' }] },
  { alias: 'core.checkbox', name: 'Checkbox', kind: 'component', description: 'Checkbox', props: [{ name: 'label', type: 'string' }, { name: 'checked', type: 'boolean' }] },
  { alias: 'core.radio', name: 'Radio', kind: 'component', description: 'Radio', props: [{ name: 'label', type: 'string' }, { name: 'checked', type: 'boolean' }, { name: 'group', type: 'string' }] },
  { alias: 'core.switch', name: 'Switch', kind: 'component', description: 'Switch', props: [{ name: 'checked', type: 'boolean' }, { name: 'label', type: 'string' }] },
  { alias: 'core.slider', name: 'Slider', kind: 'component', description: 'Slider', props: [{ name: 'value', type: 'number' }, { name: 'min', type: 'number' }, { name: 'max', type: 'number' }] },
  { alias: 'core.datepicker', name: 'DatePicker', kind: 'component', description: 'DatePicker', props: [{ name: 'placeholder', type: 'string' }] },
  { alias: 'core.timepicker', name: 'TimePicker', kind: 'component', description: 'TimePicker', props: [{ name: 'placeholder', type: 'string' }] },
  { alias: 'core.upload', name: 'Upload', kind: 'component', description: 'Upload', props: [{ name: 'actionLabel', type: 'string' }, { name: 'multiple', type: 'boolean' }] },
  { alias: 'core.video', name: 'Video', kind: 'component', description: 'Video', props: [{ name: 'src', type: 'string' }, { name: 'poster', type: 'string' }] },
  { alias: 'core.audio', name: 'Audio', kind: 'component', description: 'Audio', props: [{ name: 'src', type: 'string' }] },
  { alias: 'core.sidebar', name: 'Sidebar', kind: 'layout', description: 'Sidebar', props: [{ name: 'collapsed', type: 'boolean' }, { name: 'width', type: 'string' }] },
  { alias: 'core.toolbar', name: 'Toolbar', kind: 'layout', description: 'Toolbar', props: [{ name: 'title', type: 'string' }] },
  { alias: 'core.splitter', name: 'Splitter', kind: 'layout', description: 'Splitter', props: [{ name: 'direction', type: 'string', enum: ['horizontal', 'vertical'] }] },
  { alias: 'core.timeline', name: 'Timeline', kind: 'layout', description: 'Timeline', props: [{ name: 'direction', type: 'string', enum: ['vertical', 'horizontal'] }] },
  { alias: 'core.tooltip', name: 'Tooltip', kind: 'component', description: 'Tooltip', props: [{ name: 'text', type: 'string' }, { name: 'placement', type: 'string', enum: ['top', 'bottom', 'left', 'right'] }] },
  { alias: 'core.tree', name: 'Tree', kind: 'layout', description: 'Tree', props: [{ name: 'expandAll', type: 'boolean' }] },
  { alias: 'core.table', name: 'Table', kind: 'component', description: 'Table', props: [{ name: 'columns', type: 'object' }, { name: 'data', type: 'object' }, { name: 'bordered', type: 'boolean' }, { name: 'stripe', type: 'boolean' }] },
  { alias: 'core.widget', name: 'Widget', kind: 'component', description: 'Widget', props: [{ name: 'library', type: 'string' }, { name: 'renderer', type: 'string', enum: ['echarts', 'chartjs', 'lottie', 'mermaid'] }, { name: 'data', type: 'object' }] },
];

// ─── Template Patterns ────────────────────────────────────────────

interface TemplatePattern {
  id: string;
  name: string;
  tagline: string;
  description: string;
  category: string;
  functionalCategory: string;
  tags: string[];
  traits: string[];
  accent: string;
  platform: 'mini-program' | 'mobile-app' | 'web';
  chrome: 'wechat' | 'app' | 'none';
  pages: { name: string; title: string }[];
  cssVars: Record<string, string>;
}

const PATTERNS: TemplatePattern[] = [
  // Commerce
  { id: 'shop-fashion', name: '时尚商城', tagline: '潮流服饰购物平台', description: '服装、鞋帽、配饰等时尚商品的展示与购买', category: 'commerce', functionalCategory: 'commerce', tags: ['电商', '时尚', '服饰', '购物'], traits: ['时尚', '高端'], accent: '#E91E63', platform: 'mini-program', chrome: 'wechat', pages: [{ name: '首页', title: '时尚精选' }, { name: '分类', title: '商品分类' }, { name: '购物车', title: '购物车' }, { name: '我的', title: '个人中心' }], cssVars: { '--color-primary': '#E91E63', '--color-bg': '#FAFAFA', '--color-card': '#FFFFFF' } },
  { id: 'shop-electronics', name: '数码商城', tagline: '智能数码产品平台', description: '手机、电脑、智能设备等数码产品展示', category: 'commerce', functionalCategory: 'commerce', tags: ['电商', '数码', '电子产品', '科技'], traits: ['科技', '专业'], accent: '#2196F3', platform: 'mini-program', chrome: 'wechat', pages: [{ name: '首页', title: '数码精选' }, { name: '分类', title: '产品分类' }, { name: '购物车', title: '购物车' }, { name: '我的', title: '个人中心' }], cssVars: { '--color-primary': '#2196F3', '--color-bg': '#F5F7FA', '--color-card': '#FFFFFF' } },
  { id: 'shop-grocery', name: '生鲜超市', tagline: '新鲜食材送到家', description: '水果、蔬菜、肉类等生鲜食品在线购买', category: 'commerce', functionalCategory: 'commerce', tags: ['电商', '生鲜', '超市', '食品'], traits: ['新鲜', '便捷'], accent: '#4CAF50', platform: 'mini-program', chrome: 'wechat', pages: [{ name: '首页', title: '新鲜到家' }, { name: '分类', title: '食材分类' }, { name: '购物车', title: '购物车' }, { name: '我的', title: '个人中心' }], cssVars: { '--color-primary': '#4CAF50', '--color-bg': '#F5F9F5', '--color-card': '#FFFFFF' } },
  { id: 'shop-home', name: '家居商城', tagline: '品质家居生活', description: '家具、家电、装饰品等家居用品展示', category: 'commerce', functionalCategory: 'commerce', tags: ['电商', '家居', '家具', '装修'], traits: ['品质', '温馨'], accent: '#795548', platform: 'mini-program', chrome: 'wechat', pages: [{ name: '首页', title: '品质家居' }, { name: '分类', title: '家居分类' }, { name: '购物车', title: '购物车' }, { name: '我的', title: '个人中心' }], cssVars: { '--color-primary': '#795548', '--color-bg': '#F5F3EF', '--color-card': '#FFFFFF' } },
  { id: 'shop-beauty', name: '美妆商城', tagline: '美丽从这里开始', description: '化妆品、护肤品、香水等美妆产品', category: 'commerce', functionalCategory: 'commerce', tags: ['电商', '美妆', '护肤', '化妆品'], traits: ['精致', '优雅'], accent: '#FF69B4', platform: 'mini-program', chrome: 'wechat', pages: [{ name: '首页', title: '美妆精选' }, { name: '分类', title: '美妆分类' }, { name: '购物车', title: '购物车' }, { name: '我的', title: '个人中心' }], cssVars: { '--color-primary': '#FF69B4', '--color-bg': '#FFF5F8', '--color-card': '#FFFFFF' } },

  // Service
  { id: 'food-restaurant', name: '餐厅点餐', tagline: '美味一键送达', description: '餐厅菜单展示、在线点餐、外卖配送', category: 'service', functionalCategory: 'service', tags: ['餐饮', '外卖', '点餐', '美食'], traits: ['食欲', '活力'], accent: '#FF5722', platform: 'mini-program', chrome: 'wechat', pages: [{ name: '首页', title: '美味餐厅' }, { name: '菜单', title: '菜单' }, { name: '订单', title: '我的订单' }, { name: '我的', title: '个人中心' }], cssVars: { '--color-primary': '#FF5722', '--color-bg': '#FFF8F5', '--color-card': '#FFFFFF' } },
  { id: 'booking-hotel', name: '酒店预订', tagline: '舒适住宿体验', description: '酒店搜索、房型展示、在线预订', category: 'service', functionalCategory: 'service', tags: ['酒店', '预订', '住宿', '旅行'], traits: ['舒适', '高端'], accent: '#1A237E', platform: 'mini-program', chrome: 'wechat', pages: [{ name: '首页', title: '精选酒店' }, { name: '搜索', title: '搜索酒店' }, { name: '订单', title: '我的预订' }, { name: '我的', title: '个人中心' }], cssVars: { '--color-primary': '#1A237E', '--color-bg': '#F5F5FA', '--color-card': '#FFFFFF' } },
  { id: 'service-repair', name: '维修服务', tagline: '专业维修上门服务', description: '家电维修、管道疏通、开锁等生活服务', category: 'service', functionalCategory: 'service', tags: ['维修', '服务', '上门', '生活'], traits: ['专业', '可靠'], accent: '#607D8B', platform: 'mini-program', chrome: 'wechat', pages: [{ name: '首页', title: '维修服务' }, { name: '服务', title: '服务项目' }, { name: '订单', title: '我的订单' }, { name: '我的', title: '个人中心' }], cssVars: { '--color-primary': '#607D8B', '--color-bg': '#F5F7F8', '--color-card': '#FFFFFF' } },
  { id: 'booking-beauty', name: '美容预约', tagline: '美丽预约不排队', description: '美容美发、美甲美睫等美容服务预约', category: 'booking', functionalCategory: 'service', tags: ['美容', '预约', '美发', '美甲'], traits: ['时尚', '精致'], accent: '#E91E63', platform: 'mini-program', chrome: 'wechat', pages: [{ name: '首页', title: '美容预约' }, { name: '服务', title: '服务项目' }, { name: '预约', title: '我的预约' }, { name: '我的', title: '个人中心' }], cssVars: { '--color-primary': '#E91E63', '--color-bg': '#FFF5F7', '--color-card': '#FFFFFF' } },
  { id: 'booking-dental', name: '牙科预约', tagline: '口腔健康管家', description: '牙科诊所预约、病历管理、提醒', category: 'booking', functionalCategory: 'service', tags: ['牙科', '预约', '口腔', '医疗'], traits: ['专业', '可信'], accent: '#00ACC1', platform: 'mini-program', chrome: 'wechat', pages: [{ name: '首页', title: '牙科预约' }, { name: '预约', title: '预约挂号' }, { name: '记录', title: '就诊记录' }], cssVars: { '--color-primary': '#00ACC1', '--color-bg': '#F5FBFC', '--color-card': '#FFFFFF' } },
  { id: 'booking-car', name: '汽车服务', tagline: '爱车保养管家', description: '洗车、保养、维修预约', category: 'booking', functionalCategory: 'service', tags: ['汽车', '保养', '洗车', '预约'], traits: ['专业', '便捷'], accent: '#455A64', platform: 'mini-program', chrome: 'wechat', pages: [{ name: '首页', title: '汽车服务' }, { name: '服务', title: '服务项目' }, { name: '订单', title: '我的订单' }], cssVars: { '--color-primary': '#455A64', '--color-bg': '#F5F7F8', '--color-card': '#FFFFFF' } },
  { id: 'booking-photo', name: '摄影预约', tagline: '记录美好瞬间', description: '摄影工作室预约、套餐选择', category: 'booking', functionalCategory: 'service', tags: ['摄影', '预约', '写真', '婚纱'], traits: ['艺术', '精美'], accent: '#8E24AA', platform: 'mini-program', chrome: 'wechat', pages: [{ name: '首页', title: '摄影预约' }, { name: '套餐', title: '套餐选择' }, { name: '作品', title: '作品展示' }], cssVars: { '--color-primary': '#8E24AA', '--color-bg': '#F8F5FB', '--color-card': '#FFFFFF' } },
  { id: 'service-errand', name: '跑腿服务', tagline: '代买代送代办事', description: '代买、代送、代排队等跑腿服务', category: 'service', functionalCategory: 'service', tags: ['跑腿', '代买', '配送', '服务'], traits: ['便捷', '快速'], accent: '#FF9800', platform: 'mini-program', chrome: 'wechat', pages: [{ name: '首页', title: '跑腿服务' }, { name: '下单', title: '发布任务' }, { name: '订单', title: '我的订单' }, { name: '我的', title: '个人中心' }], cssVars: { '--color-primary': '#FF9800', '--color-bg': '#FFF8F0', '--color-card': '#FFFFFF' } },
  { id: 'service-cleaning', name: '保洁服务', tagline: '专业保洁到家', description: '家庭保洁、深度清洁、日常打扫', category: 'service', functionalCategory: 'service', tags: ['保洁', '清洁', '家政', '服务'], traits: ['专业', '可靠'], accent: '#00BCD4', platform: 'mini-program', chrome: 'wechat', pages: [{ name: '首页', title: '保洁服务' }, { name: '服务', title: '服务项目' }, { name: '订单', title: '我的订单' }], cssVars: { '--color-primary': '#00BCD4', '--color-bg': '#F5FBFC', '--color-card': '#FFFFFF' } },
  { id: 'service-moving', name: '搬家服务', tagline: '轻松搬家无忧', description: '搬家预约、物品打包、运输追踪', category: 'service', functionalCategory: 'service', tags: ['搬家', '运输', '物流', '服务'], traits: ['可靠', '高效'], accent: '#795548', platform: 'mini-program', chrome: 'wechat', pages: [{ name: '首页', title: '搬家服务' }, { name: '估价', title: '在线估价' }, { name: '订单', title: '我的订单' }], cssVars: { '--color-primary': '#795548', '--color-bg': '#F5F3EF', '--color-card': '#FFFFFF' } },
  { id: 'service-pet', name: '宠物服务', tagline: '宠物生活管家', description: '宠物寄养、美容、医疗预约', category: 'service', functionalCategory: 'service', tags: ['宠物', '寄养', '美容', '医疗'], traits: ['温馨', '可爱'], accent: '#FF7043', platform: 'mini-program', chrome: 'wechat', pages: [{ name: '首页', title: '宠物服务' }, { name: '服务', title: '服务项目' }, { name: '订单', title: '我的订单' }], cssVars: { '--color-primary': '#FF7043', '--color-bg': '#FFF5F2', '--color-card': '#FFFFFF' } },

  // Social
  { id: 'social-community', name: '社区论坛', tagline: '志同道合的社区', description: '帖子发布、评论互动、话题讨论', category: 'social', functionalCategory: 'social', tags: ['社区', '论坛', '讨论', '互动'], traits: ['年轻', '活力'], accent: '#6C5CE7', platform: 'mini-program', chrome: 'wechat', pages: [{ name: '首页', title: '社区动态' }, { name: '发现', title: '发现' }, { name: '发布', title: '发布' }, { name: '消息', title: '消息' }, { name: '我的', title: '个人中心' }], cssVars: { '--color-primary': '#6C5CE7', '--color-bg': '#F8F9FE', '--color-card': '#FFFFFF' } },
  { id: 'social-chat', name: '聊天交友', tagline: '遇见有趣的人', description: '即时聊天、好友管理、动态分享', category: 'social', functionalCategory: 'social', tags: ['聊天', '交友', '社交', '即时通讯'], traits: ['年轻', '时尚'], accent: '#00BCD4', platform: 'mini-program', chrome: 'wechat', pages: [{ name: '消息', title: '消息' }, { name: '通讯录', title: '通讯录' }, { name: '发现', title: '发现' }, { name: '我的', title: '我的' }], cssVars: { '--color-primary': '#00BCD4', '--color-bg': '#F5FBFC', '--color-card': '#FFFFFF' } },
  { id: 'social-dating', name: '交友约会', tagline: '遇见对的人', description: '匹配推荐、资料展示、约会邀请', category: 'social', functionalCategory: 'social', tags: ['交友', '约会', '恋爱', '社交'], traits: ['浪漫', '温馨'], accent: '#E91E63', platform: 'mini-program', chrome: 'wechat', pages: [{ name: '首页', title: '遇见' }, { name: '消息', title: '消息' }, { name: '动态', title: '动态' }, { name: '我的', title: '我的' }], cssVars: { '--color-primary': '#E91E63', '--color-bg': '#FFF5F7', '--color-card': '#FFFFFF' } },
  { id: 'social-group', name: '兴趣圈子', tagline: '找到你的同好', description: '兴趣小组、活动组织、话题讨论', category: 'social', functionalCategory: 'social', tags: ['圈子', '兴趣', '活动', '社交'], traits: ['活力', '多元'], accent: '#FF6F00', platform: 'mini-program', chrome: 'wechat', pages: [{ name: '首页', title: '圈子' }, { name: '发现', title: '发现' }, { name: '我的', title: '我的圈子' }], cssVars: { '--color-primary': '#FF6F00', '--color-bg': '#FFF8F0', '--color-card': '#FFFFFF' } },

  // Content
  { id: 'content-news', name: '新闻资讯', tagline: '实时新闻一手掌握', description: '新闻阅读、频道订阅、评论互动', category: 'content', functionalCategory: 'content', tags: ['新闻', '资讯', '阅读', '媒体'], traits: ['专业', '权威'], accent: '#D32F2F', platform: 'mini-program', chrome: 'wechat', pages: [{ name: '首页', title: '新闻' }, { name: '频道', title: '频道' }, { name: '视频', title: '视频' }, { name: '我的', title: '我的' }], cssVars: { '--color-primary': '#D32F2F', '--color-bg': '#FAFAFA', '--color-card': '#FFFFFF' } },
  { id: 'content-blog', name: '博客平台', tagline: '分享你的想法', description: '文章发布、评论、专栏订阅', category: 'content', functionalCategory: 'content', tags: ['博客', '文章', '写作', '内容'], traits: ['文艺', '简约'], accent: '#455A64', platform: 'web', chrome: 'none', pages: [{ name: '首页', title: '博客' }, { name: '文章', title: '文章' }, { name: '关于', title: '关于' }], cssVars: { '--color-primary': '#455A64', '--color-bg': '#FAFAFA', '--color-card': '#FFFFFF' } },
  { id: 'content-podcast', name: '播客平台', tagline: '用声音连接世界', description: '播客收听、订阅、评论互动', category: 'content', functionalCategory: 'content', tags: ['播客', '音频', '电台', '内容'], traits: ['文艺', '温暖'], accent: '#7B1FA2', platform: 'mini-program', chrome: 'wechat', pages: [{ name: '首页', title: '播客' }, { name: '发现', title: '发现' }, { name: '订阅', title: '订阅' }, { name: '我的', title: '我的' }], cssVars: { '--color-primary': '#7B1FA2', '--color-bg': '#F8F5FB', '--color-card': '#FFFFFF' } },

  // Education
  { id: 'edu-course', name: '在线课程', tagline: '随时随地学习', description: '课程浏览、视频学习、进度追踪', category: 'education', functionalCategory: 'education', tags: ['教育', '课程', '学习', '在线'], traits: ['专业', '系统'], accent: '#1565C0', platform: 'mini-program', chrome: 'wechat', pages: [{ name: '首页', title: '精品课程' }, { name: '分类', title: '课程分类' }, { name: '学习', title: '我的学习' }, { name: '我的', title: '个人中心' }], cssVars: { '--color-primary': '#1565C0', '--color-bg': '#F5F8FC', '--color-card': '#FFFFFF' } },
  { id: 'edu-exam', name: '考试题库', tagline: '备考好帮手', description: '题库练习、模拟考试、错题本', category: 'education', functionalCategory: 'education', tags: ['考试', '题库', '练习', '备考'], traits: ['专业', '高效'], accent: '#00838F', platform: 'mini-program', chrome: 'wechat', pages: [{ name: '首页', title: '考试题库' }, { name: '练习', title: '开始练习' }, { name: '记录', title: '学习记录' }, { name: '我的', title: '个人中心' }], cssVars: { '--color-primary': '#00838F', '--color-bg': '#F5FAFB', '--color-card': '#FFFFFF' } },
  { id: 'edu-language', name: '语言学习', tagline: '开口说外语', description: '单词记忆、口语练习、语法讲解', category: 'education', functionalCategory: 'education', tags: ['语言', '英语', '学习', '口语'], traits: ['趣味', '高效'], accent: '#FF6F00', platform: 'mini-program', chrome: 'wechat', pages: [{ name: '首页', title: '语言学习' }, { name: '课程', title: '课程' }, { name: '打卡', title: '每日打卡' }], cssVars: { '--color-primary': '#FF6F00', '--color-bg': '#FFF8F0', '--color-card': '#FFFFFF' } },
  { id: 'edu-kids', name: '儿童教育', tagline: '寓教于乐', description: '趣味学习、动画课程、亲子互动', category: 'education', functionalCategory: 'education', tags: ['儿童', '教育', '亲子', '趣味'], traits: ['活泼', '可爱'], accent: '#FF4081', platform: 'mini-program', chrome: 'wechat', pages: [{ name: '首页', title: '趣味学习' }, { name: '课程', title: '动画课程' }, { name: '成就', title: '我的成就' }], cssVars: { '--color-primary': '#FF4081', '--color-bg': '#FFF5F8', '--color-card': '#FFFFFF' } },
  { id: 'edu-reading', name: '阅读平台', tagline: '书香伴成长', description: '电子书阅读、书评、读书计划', category: 'education', functionalCategory: 'education', tags: ['阅读', '书籍', '书评', '学习'], traits: ['文艺', '安静'], accent: '#5D4037', platform: 'mini-program', chrome: 'wechat', pages: [{ name: '首页', title: '阅读' }, { name: '书架', title: '我的书架' }, { name: '发现', title: '发现好书' }], cssVars: { '--color-primary': '#5D4037', '--color-bg': '#F5F3EF', '--color-card': '#FFFFFF' } },

  // Health
  { id: 'health-fitness', name: '健身运动', tagline: '科学健身每一天', description: '训练计划、运动记录、健康数据', category: 'health', functionalCategory: 'health', tags: ['健身', '运动', '健康', '锻炼'], traits: ['活力', '专业'], accent: '#2E7D32', platform: 'mini-program', chrome: 'wechat', pages: [{ name: '首页', title: '健身计划' }, { name: '训练', title: '开始训练' }, { name: '记录', title: '运动记录' }, { name: '我的', title: '个人中心' }], cssVars: { '--color-primary': '#2E7D32', '--color-bg': '#F5F9F5', '--color-card': '#FFFFFF' } },
  { id: 'health-diet', name: '饮食管理', tagline: '健康饮食每一天', description: '卡路里计算、饮食记录、营养分析', category: 'health', functionalCategory: 'health', tags: ['饮食', '营养', '卡路里', '健康'], traits: ['科学', '健康'], accent: '#558B2F', platform: 'mini-program', chrome: 'wechat', pages: [{ name: '首页', title: '饮食管理' }, { name: '记录', title: '饮食记录' }, { name: '分析', title: '营养分析' }, { name: '我的', title: '个人中心' }], cssVars: { '--color-primary': '#558B2F', '--color-bg': '#F7F9F5', '--color-card': '#FFFFFF' } },
  { id: 'health-sleep', name: '睡眠助手', tagline: '好睡眠好生活', description: '睡眠监测、白噪音、闹钟', category: 'health', functionalCategory: 'health', tags: ['睡眠', '监测', '闹钟', '健康'], traits: ['安静', '舒适'], accent: '#3F51B5', platform: 'mini-program', chrome: 'wechat', pages: [{ name: '首页', title: '睡眠' }, { name: '监测', title: '睡眠监测' }, { name: '设置', title: '设置' }], cssVars: { '--color-primary': '#3F51B5', '--color-bg': '#F5F5FA', '--color-card': '#FFFFFF' } },
  { id: 'health-meditation', name: '冥想放松', tagline: '心灵的栖息地', description: '冥想引导、呼吸练习、放松音乐', category: 'health', functionalCategory: 'health', tags: ['冥想', '放松', '呼吸', '心理'], traits: ['宁静', '治愈'], accent: '#9C27B0', platform: 'mini-program', chrome: 'wechat', pages: [{ name: '首页', title: '冥想' }, { name: '课程', title: '冥想课程' }, { name: '记录', title: '练习记录' }], cssVars: { '--color-primary': '#9C27B0', '--color-bg': '#F8F5FB', '--color-card': '#FFFFFF' } },
  { id: 'health-medical', name: '在线问诊', tagline: '医生在线答疑', description: '图文问诊、视频问诊、处方管理', category: 'health', functionalCategory: 'health', tags: ['问诊', '医疗', '医生', '健康'], traits: ['专业', '可信'], accent: '#00ACC1', platform: 'mini-program', chrome: 'wechat', pages: [{ name: '首页', title: '在线问诊' }, { name: '科室', title: '选择科室' }, { name: '记录', title: '问诊记录' }], cssVars: { '--color-primary': '#00ACC1', '--color-bg': '#F5FBFC', '--color-card': '#FFFFFF' } },

  // Finance
  { id: 'finance-accounting', name: '记账理财', tagline: '轻松管理每一分钱', description: '收支记录、预算管理、财务报表', category: 'finance', functionalCategory: 'finance', tags: ['记账', '理财', '财务', '预算'], traits: ['专业', '清晰'], accent: '#00695C', platform: 'mini-program', chrome: 'wechat', pages: [{ name: '首页', title: '记账' }, { name: '统计', title: '统计' }, { name: '预算', title: '预算' }, { name: '我的', title: '我的' }], cssVars: { '--color-primary': '#00695C', '--color-bg': '#F5FAF9', '--color-card': '#FFFFFF' } },

  // Marketing
  { id: 'marketing-coupon', name: '优惠券平台', tagline: '省钱好帮手', description: '优惠券领取、分享、使用', category: 'marketing', functionalCategory: 'marketing', tags: ['优惠券', '促销', '省钱', '折扣'], traits: ['活力', '实惠'], accent: '#F44336', platform: 'mini-program', chrome: 'wechat', pages: [{ name: '首页', title: '优惠券' }, { name: '分类', title: '分类' }, { name: '我的券', title: '我的优惠券' }, { name: '我的', title: '个人中心' }], cssVars: { '--color-primary': '#F44336', '--color-bg': '#FFF5F5', '--color-card': '#FFFFFF' } },

  // Utility
  { id: 'utility-calculator', name: '万能计算器', tagline: '生活计算好帮手', description: '房贷计算、个税计算、单位换算', category: 'utility', functionalCategory: 'utility', tags: ['工具', '计算器', '换算', '实用'], traits: ['简洁', '实用'], accent: '#424242', platform: 'mini-program', chrome: 'wechat', pages: [{ name: '首页', title: '计算器' }, { name: '工具', title: '工具箱' }, { name: '记录', title: '历史记录' }], cssVars: { '--color-primary': '#424242', '--color-bg': '#FAFAFA', '--color-card': '#FFFFFF' } },
  { id: 'utility-weather', name: '天气预报', tagline: '精准天气随时查', description: '实时天气、预报、生活指数', category: 'utility', functionalCategory: 'utility', tags: ['天气', '预报', '生活', '工具'], traits: ['清新', '直观'], accent: '#03A9F4', platform: 'mini-program', chrome: 'wechat', pages: [{ name: '首页', title: '天气' }, { name: '预报', title: '未来预报' }, { name: '指数', title: '生活指数' }], cssVars: { '--color-primary': '#03A9F4', '--color-bg': '#F0F8FF', '--color-card': '#FFFFFF' } },
  { id: 'utility-translate', name: '翻译助手', tagline: '多语言翻译工具', description: '文本翻译、语音翻译、拍照翻译', category: 'utility', functionalCategory: 'utility', tags: ['翻译', '语言', '工具', '学习'], traits: ['专业', '便捷'], accent: '#00BCD4', platform: 'mini-program', chrome: 'wechat', pages: [{ name: '首页', title: '翻译' }, { name: '历史', title: '翻译记录' }, { name: '收藏', title: '收藏' }], cssVars: { '--color-primary': '#00BCD4', '--color-bg': '#F5FBFC', '--color-card': '#FFFFFF' } },
  { id: 'utility-scan', name: '扫码工具', tagline: '一扫即知', description: '二维码扫描、条形码识别、生成二维码', category: 'utility', functionalCategory: 'utility', tags: ['扫码', '二维码', '工具', '识别'], traits: ['简洁', '高效'], accent: '#FF5722', platform: 'mini-program', chrome: 'wechat', pages: [{ name: '首页', title: '扫码' }, { name: '历史', title: '扫描记录' }, { name: '生成', title: '生成二维码' }], cssVars: { '--color-primary': '#FF5722', '--color-bg': '#FFF5F2', '--color-card': '#FFFFFF' } },

  // Dashboard
  { id: 'dashboard-analytics', name: '数据分析', tagline: '数据驱动决策', description: '数据看板、图表分析、报表导出', category: 'dashboard', functionalCategory: 'dashboard', tags: ['数据', '分析', '看板', '报表'], traits: ['专业', '清晰'], accent: '#1565C0', platform: 'web', chrome: 'none', pages: [{ name: '首页', title: '数据看板' }, { name: '分析', title: '数据分析' }, { name: '报表', title: '报表' }, { name: '设置', title: '设置' }], cssVars: { '--color-primary': '#1565C0', '--color-bg': '#F5F7FA', '--color-card': '#FFFFFF' } },
  { id: 'dashboard-sales', name: '销售看板', tagline: '销售数据一目了然', description: '销售业绩、客户管理、目标追踪', category: 'dashboard', functionalCategory: 'dashboard', tags: ['销售', '业绩', 'CRM', '看板'], traits: ['专业', '高效'], accent: '#E91E63', platform: 'web', chrome: 'none', pages: [{ name: '首页', title: '销售看板' }, { name: '客户', title: '客户管理' }, { name: '目标', title: '目标追踪' }], cssVars: { '--color-primary': '#E91E63', '--color-bg': '#FFF5F7', '--color-card': '#FFFFFF' } },
  { id: 'dashboard-project', name: '项目管理', tagline: '高效项目协作', description: '任务看板、甘特图、团队协作', category: 'dashboard', functionalCategory: 'dashboard', tags: ['项目', '任务', '协作', '看板'], traits: ['专业', '高效'], accent: '#7B1FA2', platform: 'web', chrome: 'none', pages: [{ name: '首页', title: '项目看板' }, { name: '任务', title: '任务列表' }, { name: '团队', title: '团队' }], cssVars: { '--color-primary': '#7B1FA2', '--color-bg': '#F8F5FB', '--color-card': '#FFFFFF' } },
  { id: 'dashboard-hr', name: '人力资源', tagline: 'HR 管理平台', description: '员工管理、考勤、薪资、招聘', category: 'dashboard', functionalCategory: 'dashboard', tags: ['HR', '人事', '考勤', '招聘'], traits: ['专业', '规范'], accent: '#00695C', platform: 'web', chrome: 'none', pages: [{ name: '首页', title: 'HR 看板' }, { name: '员工', title: '员工管理' }, { name: '考勤', title: '考勤' }], cssVars: { '--color-primary': '#00695C', '--color-bg': '#F5FAF9', '--color-card': '#FFFFFF' } },

  // Profile
  { id: 'profile-personal', name: '个人主页', tagline: '展示你的精彩', description: '个人资料、作品展示、社交链接', category: 'profile', functionalCategory: 'profile', tags: ['个人', '主页', '展示', '简历'], traits: ['简约', '个性'], accent: '#5C6BC0', platform: 'mini-program', chrome: 'wechat', pages: [{ name: '首页', title: '个人主页' }, { name: '作品', title: '作品集' }, { name: '关于', title: '关于我' }], cssVars: { '--color-primary': '#5C6BC0', '--color-bg': '#F5F5FA', '--color-card': '#FFFFFF' } },
  { id: 'profile-portfolio', name: '作品集', tagline: '创意作品展示', description: '设计师、摄影师作品展示', category: 'profile', functionalCategory: 'profile', tags: ['作品集', '设计', '摄影', '创意'], traits: ['创意', '精美'], accent: '#FF6F00', platform: 'web', chrome: 'none', pages: [{ name: '首页', title: '作品集' }, { name: '项目', title: '项目详情' }, { name: '关于', title: '关于' }], cssVars: { '--color-primary': '#FF6F00', '--color-bg': '#FFFBF5', '--color-card': '#FFFFFF' } },
  { id: 'profile-resume', name: '在线简历', tagline: '专业简历在线展示', description: '个人简历、工作经历、技能展示', category: 'profile', functionalCategory: 'profile', tags: ['简历', '求职', '个人', '职业'], traits: ['专业', '简洁'], accent: '#37474F', platform: 'web', chrome: 'none', pages: [{ name: '首页', title: '简历' }, { name: '经历', title: '工作经历' }, { name: '技能', title: '技能' }], cssVars: { '--color-primary': '#37474F', '--color-bg': '#FAFAFA', '--color-card': '#FFFFFF' } },
  { id: 'profile-creator', name: '创作者主页', tagline: '内容创作者中心', description: '作品管理、粉丝互动、数据统计', category: 'profile', functionalCategory: 'profile', tags: ['创作者', '内容', '粉丝', '自媒体'], traits: ['活力', '个性'], accent: '#F44336', platform: 'mini-program', chrome: 'wechat', pages: [{ name: '首页', title: '创作者中心' }, { name: '作品', title: '我的作品' }, { name: '数据', title: '数据统计' }], cssVars: { '--color-primary': '#F44336', '--color-bg': '#FFF5F5', '--color-card': '#FFFFFF' } },

  // Finance
  { id: 'finance-accounting', name: '记账理财', tagline: '轻松管理每一分钱', description: '收支记录、预算管理、财务报表', category: 'finance', functionalCategory: 'finance', tags: ['记账', '理财', '财务', '预算'], traits: ['专业', '清晰'], accent: '#00695C', platform: 'mini-program', chrome: 'wechat', pages: [{ name: '首页', title: '记账' }, { name: '统计', title: '统计' }, { name: '预算', title: '预算' }, { name: '我的', title: '我的' }], cssVars: { '--color-primary': '#00695C', '--color-bg': '#F5FAF9', '--color-card': '#FFFFFF' } },
  { id: 'finance-investment', name: '投资追踪', tagline: '投资组合管理', description: '股票、基金、加密货币追踪', category: 'finance', functionalCategory: 'finance', tags: ['投资', '股票', '基金', '理财'], traits: ['专业', '实时'], accent: '#1565C0', platform: 'mini-program', chrome: 'wechat', pages: [{ name: '首页', title: '投资' }, { name: '组合', title: '投资组合' }, { name: '行情', title: '行情' }], cssVars: { '--color-primary': '#1565C0', '--color-bg': '#F5F7FA', '--color-card': '#FFFFFF' } },
  { id: 'finance-invoice', name: '发票管理', tagline: '发票轻松管理', description: '发票扫描、归集、报销', category: 'finance', functionalCategory: 'finance', tags: ['发票', '报销', '财务', '管理'], traits: ['专业', '便捷'], accent: '#FF8F00', platform: 'mini-program', chrome: 'wechat', pages: [{ name: '首页', title: '发票' }, { name: '扫描', title: '扫描发票' }, { name: '记录', title: '发票记录' }], cssVars: { '--color-primary': '#FF8F00', '--color-bg': '#FFF8F0', '--color-card': '#FFFFFF' } },
  { id: 'finance-split', name: 'AA记账', tagline: '分账不伤感情', description: '多人分账、AA制计算、账单分享', category: 'finance', functionalCategory: 'finance', tags: ['分账', 'AA', '记账', '社交'], traits: ['简洁', '社交'], accent: '#00BCD4', platform: 'mini-program', chrome: 'wechat', pages: [{ name: '首页', title: 'AA记账' }, { name: '账单', title: '账单' }, { name: '群组', title: '群组' }], cssVars: { '--color-primary': '#00BCD4', '--color-bg': '#F5FBFC', '--color-card': '#FFFFFF' } },

  // Marketing
  { id: 'marketing-coupon', name: '优惠券平台', tagline: '省钱好帮手', description: '优惠券领取、分享、使用', category: 'marketing', functionalCategory: 'marketing', tags: ['优惠券', '促销', '省钱', '折扣'], traits: ['活力', '实惠'], accent: '#F44336', platform: 'mini-program', chrome: 'wechat', pages: [{ name: '首页', title: '优惠券' }, { name: '分类', title: '分类' }, { name: '我的券', title: '我的优惠券' }, { name: '我的', title: '个人中心' }], cssVars: { '--color-primary': '#F44336', '--color-bg': '#FFF5F5', '--color-card': '#FFFFFF' } },
  { id: 'marketing-lottery', name: '抽奖活动', tagline: '幸运转转转', description: '大转盘、刮刮卡、抽奖活动', category: 'marketing', functionalCategory: 'marketing', tags: ['抽奖', '活动', '营销', '互动'], traits: ['趣味', '活力'], accent: '#FF9800', platform: 'mini-program', chrome: 'wechat', pages: [{ name: '首页', title: '抽奖' }, { name: '奖品', title: '奖品列表' }, { name: '记录', title: '中奖记录' }], cssVars: { '--color-primary': '#FF9800', '--color-bg': '#FFF8F0', '--color-card': '#FFFFFF' } },
  { id: 'marketing-signin', name: '签到打卡', tagline: '每日签到有惊喜', description: '连续签到、积分奖励、排行榜', category: 'marketing', functionalCategory: 'marketing', tags: ['签到', '打卡', '积分', '营销'], traits: ['激励', '互动'], accent: '#4CAF50', platform: 'mini-program', chrome: 'wechat', pages: [{ name: '首页', title: '签到' }, { name: '积分', title: '积分商城' }, { name: '排行', title: '排行榜' }], cssVars: { '--color-primary': '#4CAF50', '--color-bg': '#F5F9F5', '--color-card': '#FFFFFF' } },
  { id: 'marketing-distribution', name: '分销系统', tagline: '分享赚钱', description: '分销推广、佣金管理、团队裂变', category: 'marketing', functionalCategory: 'marketing', tags: ['分销', '推广', '佣金', '营销'], traits: ['专业', '激励'], accent: '#E91E63', platform: 'mini-program', chrome: 'wechat', pages: [{ name: '首页', title: '分销中心' }, { name: '团队', title: '我的团队' }, { name: '佣金', title: '佣金明细' }], cssVars: { '--color-primary': '#E91E63', '--color-bg': '#FFF5F7', '--color-card': '#FFFFFF' } },

  // Food (additional)
  { id: 'food-recipe', name: '菜谱大全', tagline: '美味在家做', description: '菜谱浏览、食材管理、烹饪指导', category: 'service', functionalCategory: 'service', tags: ['菜谱', '烹饪', '美食', '厨房'], traits: ['温馨', '实用'], accent: '#FF5722', platform: 'mini-program', chrome: 'wechat', pages: [{ name: '首页', title: '菜谱' }, { name: '分类', title: '菜系分类' }, { name: '收藏', title: '我的收藏' }], cssVars: { '--color-primary': '#FF5722', '--color-bg': '#FFF5F2', '--color-card': '#FFFFFF' } },
  { id: 'food-reservation', name: '餐厅预订', tagline: '一键订座', description: '餐厅搜索、座位预订、菜单预览', category: 'food', functionalCategory: 'service', tags: ['餐厅', '预订', '订座', '美食'], traits: ['高端', '便捷'], accent: '#795548', platform: 'mini-program', chrome: 'wechat', pages: [{ name: '首页', title: '餐厅' }, { name: '预订', title: '预订' }, { name: '订单', title: '我的订单' }], cssVars: { '--color-primary': '#795548', '--color-bg': '#F5F3EF', '--color-card': '#FFFFFF' } },
  { id: 'food-bakery', name: '烘焙蛋糕', tagline: '甜蜜定制', description: '蛋糕定制、烘焙教程、订单管理', category: 'food', functionalCategory: 'service', tags: ['烘焙', '蛋糕', '甜品', '定制'], traits: ['甜蜜', '精致'], accent: '#F48FB1', platform: 'mini-program', chrome: 'wechat', pages: [{ name: '首页', title: '烘焙坊' }, { name: '定制', title: '蛋糕定制' }, { name: '订单', title: '我的订单' }], cssVars: { '--color-primary': '#F48FB1', '--color-bg': '#FFF5F8', '--color-card': '#FFFFFF' } },
  { id: 'food-tea', name: '茶饮店', tagline: '一杯好茶', description: '茶饮点单、会员积分、外卖配送', category: 'food', functionalCategory: 'service', tags: ['茶饮', '奶茶', '咖啡', '点单'], traits: ['清新', '时尚'], accent: '#4DB6AC', platform: 'mini-program', chrome: 'wechat', pages: [{ name: '首页', title: '茶饮店' }, { name: '菜单', title: '菜单' }, { name: '我的', title: '会员中心' }], cssVars: { '--color-primary': '#4DB6AC', '--color-bg': '#F5FBFA', '--color-card': '#FFFFFF' } },

  // Content - additional
  { id: 'content-magazine', name: '电子杂志', tagline: '指尖上的杂志', description: '杂志阅读、订阅、收藏', category: 'content', functionalCategory: 'content', tags: ['杂志', '阅读', '时尚', '内容'], traits: ['精致', '高端'], accent: '#212121', platform: 'mini-program', chrome: 'wechat', pages: [{ name: '首页', title: '杂志' }, { name: '分类', title: '分类' }, { name: '收藏', title: '我的收藏' }], cssVars: { '--color-primary': '#212121', '--color-bg': '#FAFAFA', '--color-card': '#FFFFFF' } },
  { id: 'content-video', name: '短视频平台', tagline: '精彩瞬间', description: '短视频浏览、创作、互动', category: 'content', functionalCategory: 'content', tags: ['短视频', '创作', '娱乐', '内容'], traits: ['活力', '潮流'], accent: '#FF1744', platform: 'mini-program', chrome: 'wechat', pages: [{ name: '首页', title: '推荐' }, { name: '发现', title: '发现' }, { name: '我的', title: '我的' }], cssVars: { '--color-primary': '#FF1744', '--color-bg': '#0D0D0D', '--color-card': '#1A1A1A' } },
];

// ─── Generator ────────────────────────────────────────────────────

let nodeCounter = 0;

function nodeId(prefix: string): string {
  return `${prefix}-${++nodeCounter}`;
}

function textNode(text: string, variant: string, order: number): ThemeLayoutNode {
  return {
    id: nodeId('text'),
    alias: 'core.text',
    layout: { mode: 'flow', order, width: '100%' },
    props: { text, variant },
  };
}

function buttonNode(label: string, variant: string, order: number): ThemeLayoutNode {
  return {
    id: nodeId('btn'),
    alias: 'core.button',
    layout: { mode: 'flow', order },
    props: { label, variant },
  };
}

function panelNode(title: string, children: ThemeLayoutNode[], order: number, tone = 'default'): ThemeLayoutNode {
  return {
    id: nodeId('panel'),
    alias: 'core.panel',
    layout: { mode: 'flow', order, width: '100%' },
    props: { tone, gap: '12', title },
    children,
  };
}

function rowNode(children: ThemeLayoutNode[], order: number, justify = 'space-between'): ThemeLayoutNode {
  return {
    id: nodeId('row'),
    alias: 'core.row',
    layout: { mode: 'flow', order, width: '100%' },
    props: { justify, align: 'center', gap: '12' },
    children,
  };
}

function searchNode(placeholder: string, order: number): ThemeLayoutNode {
  return {
    id: nodeId('search'),
    alias: 'core.search',
    layout: { mode: 'flow', order, width: '100%' },
    props: { placeholder },
  };
}

function noticeNode(text: string, tone: string, order: number): ThemeLayoutNode {
  return {
    id: nodeId('notice'),
    alias: 'core.notice',
    layout: { mode: 'flow', order, width: '100%' },
    props: { text, tone },
  };
}

function tagNode(label: string, tone: string, order: number): ThemeLayoutNode {
  return {
    id: nodeId('tag'),
    alias: 'core.tag',
    layout: { mode: 'flow', order },
    props: { label, tone },
  };
}

function imageNode(order: number, height = '300'): ThemeLayoutNode {
  return {
    id: nodeId('img'),
    alias: 'core.image',
    layout: { mode: 'flow', order, width: '100%', height },
    props: { alt: '图片', objectFit: 'cover' },
  };
}

function gridNode(columns: number, children: ThemeLayoutNode[], order: number): ThemeLayoutNode {
  return {
    id: nodeId('grid'),
    alias: 'core.grid',
    layout: { mode: 'flow', order, width: '100%' },
    props: { columns, gap: '16' },
    children,
  };
}

function tabsNode(tabs: string[], activeTab: string, order: number): ThemeLayoutNode {
  return {
    id: nodeId('tabs'),
    alias: 'core.tabs',
    layout: { mode: 'flow', order, width: '100%' },
    props: { tabs, activeTab },
  };
}

function footerTabs(tabs: string[], activeTab: string, interactions: Record<string, unknown>): ThemeLayoutNode {
  return {
    id: nodeId('footer'),
    alias: 'core.tabs',
    slot: 'footer',
    layout: { mode: 'flow', order: 999, width: '100%' },
    props: { tabs, activeTab },
    interactions: { onTabClick: interactions },
  };
}

function generateHomePage(pattern: TemplatePattern): ThemeLayoutNode {
  const pageNames = pattern.pages.map((p) => p.name);
  const tabInteractions: Record<string, unknown> = {};
  pageNames.forEach((name) => {
    tabInteractions[name] = { type: 'navigate', targetPageId: name === pattern.pages[0].name ? 'home' : name.toLowerCase() };
  });

  const children: ThemeLayoutNode[] = [
    searchNode(`搜索${pattern.name}相关内容`, 1),
    noticeNode(`${pattern.tagline} — 限时优惠中`, 'info', 2),
    imageNode(3, '320'),
    textNode('热门推荐', 'heading', 4),
  ];

  // Product/service cards
  for (let i = 0; i < 4; i++) {
    children.push(
      panelNode(`项目 ${i + 1}`, [
        textNode(`${pattern.name}精选项目 ${i + 1}`, 'title', 1),
        textNode(pattern.description, 'body', 2),
        rowNode([
          tagNode(pattern.tags[i % pattern.tags.length], 'deal', 1),
          buttonNode('查看', 'primary', 2),
        ], 3),
      ], 5 + i, i % 2 === 0 ? 'default' : 'soft'),
    );
  }

  children.push(footerTabs(pageNames, pattern.pages[0].name, tabInteractions));

  return {
    id: 'home-screen',
    alias: 'core.screen',
    layout: { mode: 'flow', width: '100%' },
    props: { title: pattern.pages[0].title, surface: pattern.platform, chrome: pattern.chrome },
    children,
  };
}

function generateListPage(pattern: TemplatePattern): ThemeLayoutNode {
  const children: ThemeLayoutNode[] = [
    searchNode('搜索', 1),
    tabsNode(['全部', '热门', '最新'], '全部', 2),
  ];

  for (let i = 0; i < 6; i++) {
    children.push(
      panelNode('', [
        rowNode([
          textNode(`${pattern.name}项目 ${i + 1}`, 'title', 1),
          tagNode(pattern.tags[i % pattern.tags.length], 'info', 2),
        ], 1),
        textNode(pattern.description.slice(0, 30), 'caption', 2),
        rowNode([
          textNode(`¥${(99 + i * 10)}.00`, 'price', 1),
          buttonNode('了解详情', 'secondary', 2),
        ], 3),
      ], 3 + i),
    );
  }

  return {
    id: 'list-screen',
    alias: 'core.screen',
    layout: { mode: 'flow', width: '100%' },
    props: { title: pattern.pages[1]?.title ?? '列表' },
    children,
  };
}

function generateDetailPage(pattern: TemplatePattern): ThemeLayoutNode {
  return {
    id: 'detail-screen',
    alias: 'core.screen',
    layout: { mode: 'flow', width: '100%' },
    props: { title: pattern.pages[2]?.title ?? '详情' },
    children: [
      imageNode(1, '400'),
      textNode(pattern.name + '详情', 'heading', 2),
      textNode(pattern.description, 'body', 3),
      panelNode('详细信息', [
        textNode('特点一：高品质设计', 'body', 1),
        textNode('特点二：用户体验优先', 'body', 2),
        textNode('特点三：响应式布局', 'body', 3),
      ], 4, 'soft'),
      rowNode([
        buttonNode('立即使用', 'primary', 1),
        buttonNode('收藏', 'secondary', 2),
      ], 5),
    ],
  };
}

function generateProfilePage(pattern: TemplatePattern): ThemeLayoutNode {
  return {
    id: 'profile-screen',
    alias: 'core.screen',
    layout: { mode: 'flow', width: '100%' },
    props: { title: '我的' },
    children: [
      panelNode('个人中心', [
        rowNode([
          textNode('用户昵称', 'title', 1),
          tagNode('VIP', 'member', 2),
        ], 1),
        textNode('个性签名：热爱生活', 'caption', 2),
      ], 1, 'accent'),
      panelNode('我的服务', [
        textNode('我的订单', 'body', 1),
        textNode('我的收藏', 'body', 2),
        textNode('消息通知', 'body', 3),
        textNode('设置', 'body', 4),
      ], 2),
    ],
  };
}

function generateTemplate(pattern: TemplatePattern): ThemeLayoutDocument {
  nodeCounter = 0;
  const pageNames = pattern.pages.map((p) => p.name);
  const tabInteractions: Record<string, unknown> = {};
  pattern.pages.forEach((page, i) => {
    tabInteractions[page.name] = {
      type: 'navigate',
      targetPageId: i === 0 ? 'home' : page.name.toLowerCase(),
    };
  });

  const pages = pattern.pages.map((page, i) => {
    let layout: ThemeLayoutNode;
    switch (i) {
      case 0: layout = generateHomePage(pattern); break;
      case 1: layout = generateListPage(pattern); break;
      case 2: layout = generateDetailPage(pattern); break;
      case 3: layout = generateProfilePage(pattern); break;
      default: layout = generateListPage(pattern);
    }
    layout.props = { ...layout.props, title: page.title };
    const footer = footerTabs(pageNames, page.name, tabInteractions);
    const children = layout.children ?? [];
    const footerIndex = children.findIndex((child) => child.alias === 'core.tabs' && child.slot === 'footer');
    layout.children =
      footerIndex >= 0
        ? children.map((child, childIndex) => (childIndex === footerIndex ? footer : child))
        : [...children, footer];
    return { id: i === 0 ? 'home' : page.name.toLowerCase(), name: page.name, layout };
  });

  return {
    version: 1,
    themeId: pattern.id,
    themeName: pattern.name,
    pageName: pattern.pages[0].name,
    description: pattern.description,
    components: COMPONENTS,
    defaultPageId: 'home',
    pages,
    layout: pages[0].layout,
    cssVars: pattern.cssVars,
  };
}

// ─── Variant Generation ──────────────────────────────────────────

const ACCENT_ROTATION = [
  '#E91E63', '#9C27B0', '#673AB7', '#3F51B5', '#2196F3',
  '#00BCD4', '#009688', '#4CAF50', '#8BC34A', '#FF9800',
  '#FF5722', '#795548', '#607D8B', '#F44336', '#00ACC1',
  '#AB47BC', '#5C6BC0', '#26A69A', '#66BB6A', '#FFA726',
  '#EF5350', '#8D6E63', '#78909C', '#EC407A', '#42A5F5',
];
const PLATFORM_VARIANTS: Array<{ platform: 'mini-program' | 'mobile-app' | 'web'; chrome: 'wechat' | 'app' | 'none' }> = [
  { platform: 'mini-program', chrome: 'wechat' },
  { platform: 'mobile-app', chrome: 'app' },
  { platform: 'web', chrome: 'none' },
];
const STYLE_VARIANTS = [
  { suffix: '暗色', traits: ['暗色', '深色'], bg: '#1A1A2E', card: '#16213E' },
  { suffix: '清新', traits: ['清新', '自然'], bg: '#F0F8FF', card: '#FFFFFF' },
  { suffix: '商务', traits: ['商务', '专业'], bg: '#F5F5F5', card: '#FFFFFF' },
  { suffix: '活力', traits: ['活力', '年轻'], bg: '#FFF8F0', card: '#FFFFFF' },
  { suffix: '简约', traits: ['简约', '极简'], bg: '#FAFAFA', card: '#FFFFFF' },
  { suffix: '科技', traits: ['科技', '未来'], bg: '#0D1117', card: '#161B22' },
  { suffix: '优雅', traits: ['优雅', '精致'], bg: '#F8F5F0', card: '#FFFFFF' },
  { suffix: '复古', traits: ['复古', '怀旧'], bg: '#F5F0E8', card: '#FFFBF0' },
  { suffix: '暖色', traits: ['温暖', '舒适'], bg: '#FFF5EE', card: '#FFFFFF' },
  { suffix: '冷色', traits: ['冷静', '理性'], bg: '#F0F4F8', card: '#FFFFFF' },
];

const INCLUDE_STYLE_VARIANTS = process.env.INCLUDE_STYLE_VARIANTS === 'true';

function generateVariants(basePattern: TemplatePattern): TemplatePattern[] {
  const variants: TemplatePattern[] = [basePattern];

  // Platform variants (2 extra per pattern)
  for (const { platform, chrome } of PLATFORM_VARIANTS) {
    if (platform === basePattern.platform) continue;
    const suffix = platform === 'web' ? '网页版' : platform === 'mobile-app' ? 'App版' : '小程序版';
    variants.push({
      ...basePattern,
      id: `${basePattern.id}-${platform}`,
      name: `${basePattern.name}${suffix}`,
      tagline: `${basePattern.tagline}（${suffix}）`,
      platform,
      chrome,
      cssVars: { ...basePattern.cssVars },
    });
  }

  // Color-only clones make the template library feel repetitive. Keep them
  // available for palette QA, but do not generate them by default.
  if (INCLUDE_STYLE_VARIANTS) {
    for (let i = 0; i < STYLE_VARIANTS.length; i++) {
      const sv = STYLE_VARIANTS[i];
      const accentIdx = (ACCENT_ROTATION.indexOf(basePattern.accent) + i * 2 + 1) % ACCENT_ROTATION.length;
      variants.push({
        ...basePattern,
        id: `${basePattern.id}-${sv.suffix}`,
        name: `${basePattern.name}${sv.suffix}`,
        tagline: `${basePattern.tagline}（${sv.suffix}风格）`,
        traits: [...basePattern.traits, ...sv.traits],
        accent: ACCENT_ROTATION[accentIdx],
        cssVars: {
          ...basePattern.cssVars,
          '--color-primary': ACCENT_ROTATION[accentIdx],
          '--color-bg': sv.bg,
          '--color-card': sv.card,
        },
      });
    }
  }

  return variants;
}

// ─── Main ─────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const categoryArg = args.find((a) => a.startsWith('--category='))?.split('=')[1];
  const countArg = args.find((a) => a.startsWith('--count='))?.split('=')[1];

  let patterns = PATTERNS;
  if (categoryArg) {
    patterns = patterns.filter((p) => p.category === categoryArg);
  }

  // Generate variants for each base pattern
  const allPatterns: TemplatePattern[] = [];
  for (const pattern of patterns) {
    allPatterns.push(...generateVariants(pattern));
  }

  const count = countArg ? parseInt(countArg, 10) : allPatterns.length;
  const outputDir = join(process.cwd(), 'templates_json');

  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  console.log(`Generating ${Math.min(count, allPatterns.length)} templates from ${patterns.length} base patterns...`);

  for (const pattern of allPatterns.slice(0, count)) {
    const template = generateTemplate(pattern);
    const filePath = join(outputDir, `${pattern.id}.json`);
    writeFileSync(filePath, JSON.stringify(template, null, 2), 'utf8');
    console.log(`  ✓ ${pattern.id} → ${pattern.name} (${pattern.category})`);
  }

  console.log(`\nDone! Generated ${Math.min(count, patterns.length)} templates in ${outputDir}`);
}

main();
