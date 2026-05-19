import type { NavItem } from './GlobalNav';

export const globalNavContent = {
  brand: {
    name: 'AppGen AI',
    tagline: 'AI 驱动的全平台应用设计工具',
  },
  auth: {
    login: '登录',
    register: '免费注册',
    openUserSettings: '打开用户设置',
  },
  nav: [
    { label: '首页', to: '/', end: true },
    { label: '模板广场', to: '/templates', end: false },
    { label: '设计编辑器', to: '/editor', end: false },
  ] satisfies NavItem[],
} as const;
