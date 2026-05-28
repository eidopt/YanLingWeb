'use client';

import { asBoolean,asString } from '../../valueResolvers';
import type { CollapseProps } from '../propsTypes';
import type { CoreNodeProps } from '../types';
import styles from './CollapseNode.module.css';

export function CollapseNode({ props, children, nodeLayoutStyle }: CoreNodeProps<CollapseProps>) {
  const title = asString(props.title);
  const expanded = asBoolean(props.expanded);

  return (
    <details className={styles.collapse} open={expanded} style={nodeLayoutStyle}>
      <summary className={styles.summary}>
        <span className={styles.title}>{title}</span>
        <span className={styles.chevron} aria-hidden="true">&rsaquo;</span>
      </summary>
      <div className={styles.body}>{children}</div>
    </details>
  );
}
