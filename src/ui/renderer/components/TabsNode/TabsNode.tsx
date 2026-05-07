'use client';

import { asString, asStringArray } from '../../valueResolvers';
import type { CoreNodeProps } from '../types';
import styles from './TabsNode.module.css';
import { cx } from 'base/classname';

export function TabsNode({ props, nodeLayoutStyle }: CoreNodeProps) {
  const tabs = asStringArray(props.tabs);
  const activeTab = asString(props.activeTab, tabs[0] ?? '');
  const onTabClick =
    typeof props.onTabClick === 'function'
      ? (props.onTabClick as (tab: string) => void)
      : undefined;

  return (
    <div className={styles.tabsBar} style={nodeLayoutStyle}>
      {tabs.map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={() => onTabClick?.(tab)}
          className={cx(styles.tabItem, activeTab === tab && styles.tabItemActive)}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}
