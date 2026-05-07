import type { NavItem } from './GlobalNav';
import { GlobalNav } from './GlobalNav';

// Placeholder data — replace with API response when ready
const fakeNav: NavItem[] = [
  { label: '首页',      to: '/',          end: true  },
  { label: '模板广场',  to: '/templates', end: false },
  { label: '设计编辑器', to: '/editor',   end: false },
];

interface FakeGlobalNavProps {
  variant?: 'default' | 'overlay';
}

export function FakeGlobalNav({ variant }: FakeGlobalNavProps) {
  return <GlobalNav nav={fakeNav} variant={variant} />;
}
