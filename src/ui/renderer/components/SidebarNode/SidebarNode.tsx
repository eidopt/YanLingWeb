'use client';

import { asBoolean, asCssLength } from '../../valueResolvers';
import type { SidebarProps } from '../propsTypes';
import type { CoreNodeProps } from '../types';
import styles from './SidebarNode.module.css';
import { cx } from 'base/classname';
import type { CSSProperties } from 'react';

export function SidebarNode({ props, children, nodeLayoutStyle }: CoreNodeProps<SidebarProps>) {
  const collapsed = asBoolean(props.collapsed);
  const width = asCssLength(props.width, '240px');

  return (
    <aside
      className={cx(styles.sidebar, collapsed && styles.sidebarCollapsed)}
      style={{
        ...nodeLayoutStyle,
        '--sidebar-width': width,
      } as CSSProperties}
    >
      {children}
    </aside>
  );
}
