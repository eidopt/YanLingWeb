'use client';

import { asString, asStringArray } from '../../valueResolvers';
import type { TabBarProps } from '../propsTypes';
import type { CoreNodeProps } from '../types';
import styles from './TabBarNode.module.css';

export function TabBarNode({ props, nodeLayoutStyle }: CoreNodeProps<TabBarProps>) {
  const items = asStringArray(props.items);
  const icons = asStringArray(props.icons);
  const active = asString(props.active);

  return (
    <nav className={styles.tabbar} style={nodeLayoutStyle}>
      {items.map((item, index) => {
        const isActive = item === active;
        return (
          <div
            key={item}
            className={`${styles.item} ${isActive ? styles.itemActive : ''}`}
          >
            {icons[index] ? <span className={styles.icon}>{icons[index]}</span> : null}
            <span className={styles.label}>{item}</span>
          </div>
        );
      })}
    </nav>
  );
}
