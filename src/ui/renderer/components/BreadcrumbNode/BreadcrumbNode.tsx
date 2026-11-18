'use client';

import { asString, asStringArray } from '../../valueResolvers';
import type { BreadcrumbProps } from '../propsTypes';
import type { CoreNodeProps } from '../types';
import styles from './BreadcrumbNode.module.css';

export function BreadcrumbNode({ props, nodeLayoutStyle }: CoreNodeProps<BreadcrumbProps>) {
  const items = asStringArray(props.items);
  const separator = asString(props.separator, '/');

  return (
    <nav className={styles.breadcrumb} style={nodeLayoutStyle} aria-label="面包屑导航">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <span key={item} className={styles.crumb}>
            {!isLast ? <span className={styles.link}>{item}</span> : <span className={styles.current}>{item}</span>}
            {!isLast ? <span className={styles.separator}>{separator}</span> : null}
          </span>
        );
      })}
    </nav>
  );
}
