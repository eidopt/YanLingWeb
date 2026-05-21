import type { ThemeLayoutDocument, ThemeLayoutNode } from '../types';
import { CORE_COMPONENTS, createScreenNode } from './blankDocument';

function textNode(id: string, text: string, variant = 'body', order = 1): ThemeLayoutNode {
  return {
    id,
    alias: 'core.text',
    layout: { mode: 'flow', order, width: '100%' },
    props: { text, variant },
  };
}

function buttonNode(id: string, label: string, order = 1): ThemeLayoutNode {
  return {
    id,
    alias: 'core.button',
    layout: { mode: 'flow', order },
    props: { label, variant: 'primary' },
  };
}

function panelNode(id: string, title: string, children: ThemeLayoutNode[], order = 1): ThemeLayoutNode {
  return {
    id,
    alias: 'core.panel',
    layout: { mode: 'flow', order, width: '100%' },
    props: { tone: 'default', gap: '12', title },
    children,
  };
}

function footerTabs(activeTab: string): ThemeLayoutNode {
  return {
    id: 'home-footer-tabs',
    alias: 'core.tabs',
    slot: 'footer',
    layout: { mode: 'flow', order: 999, width: '100%' },
    props: { tabs: ['首页', '订单', '我的'], activeTab },
    interactions: {
      onTabClick: {
        首页: { type: 'navigate', targetPageId: 'home' },
        订单: { type: 'navigate', targetPageId: 'orders' },
        我的: { type: 'navigate', targetPageId: 'profile' },
      },
    },
  };
}

export function createCommerceMarketDocument(): ThemeLayoutDocument {
  const home = createScreenNode('home-screen', '今日精选', [
    {
      id: 'home-search',
      alias: 'core.search',
      layout: { mode: 'flow', order: 1, width: '100%' },
      props: { placeholder: '搜索水果零食、家清百货' },
    },
    {
      id: 'home-title',
      alias: 'core.text',
      layout: { mode: 'flow', order: 2, width: '100%' },
      props: { text: '今日爆款', variant: 'heading' },
    },
    {
      id: 'home-notice',
      alias: 'core.notice',
      layout: { mode: 'flow', order: 3, width: '100%' },
      props: { text: '满 59 元免配送费', tone: 'info' },
    },
    panelNode('home-product-panel', '商品卡片', [
      textNode('home-card-title', '云南蓝莓 125g', 'title', 1),
      textNode('home-card-subtitle', '冷链现摘，酸甜平衡', 'body', 2),
      {
        id: 'home-filter-tag',
        alias: 'core.tag',
        layout: { mode: 'flow', order: 3 },
        props: { label: '限时', tone: 'deal' },
      },
      buttonNode('home-primary-button', '马上抢', 4),
      buttonNode('home-duplicate-button', '马上抢', 5),
    ], 4),
    panelNode('home-service-card', '服务入口', [
      textNode('home-service-title', '会员专享', 'title', 1),
      buttonNode('home-service-button', '查看权益', 2),
    ], 5),
    footerTabs('首页'),
  ]);

  const orders = createScreenNode('orders-screen', '订单', [
    panelNode('orders-status-card', '订单状态', [
      textNode('orders-status-title', '配送中', 'title', 1),
      buttonNode('orders-detail-button', '查看详情', 2),
    ]),
    footerTabs('订单'),
  ]);
  orders.children?.forEach((node) => {
    if (node.id === 'home-footer-tabs') {
      node.id = 'orders-footer-tabs';
    }
  });

  const profile = createScreenNode('profile-screen', '我的', [
    panelNode('profile-member-card', '会员中心', [
      textNode('profile-name', '普通会员', 'title', 1),
      buttonNode('profile-settings-button', '设置', 2),
    ]),
    footerTabs('我的'),
  ]);
  profile.children?.forEach((node) => {
    if (node.id === 'home-footer-tabs') {
      node.id = 'profile-footer-tabs';
    }
  });

  return {
    version: 1,
    themeId: 'commerce-market',
    themeName: '社区电商',
    pageName: '首页',
    description: '用于 agent 评测的多页面电商模板',
    components: CORE_COMPONENTS,
    defaultPageId: 'home',
    pages: [
      { id: 'home', name: '首页', layout: home },
      { id: 'orders', name: '订单', layout: orders },
      { id: 'profile', name: '我的', layout: profile },
    ],
    layout: home,
  };
}

export function getSeedDocument(name: string | undefined): ThemeLayoutDocument {
  if (name === 'commerce-market') {
    return createCommerceMarketDocument();
  }
  return createCommerceMarketDocument();
}
