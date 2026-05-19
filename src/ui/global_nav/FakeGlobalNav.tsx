import type { NavItem } from './GlobalNav';
import { GlobalNav } from './GlobalNav';
import { globalNavContent } from './GlobalNav.content';

const fakeNav: NavItem[] = [...globalNavContent.nav];

interface FakeGlobalNavProps {
  variant?: 'default' | 'overlay';
}

export function FakeGlobalNav({ variant }: FakeGlobalNavProps) {
  return <GlobalNav nav={fakeNav} variant={variant} />;
}
