'use client';

import { asBoolean, asString } from '../../valueResolvers';
import type { ToolbarProps } from '../propsTypes';
import type { CoreNodeProps } from '../types';
import styles from './ToolbarNode.module.css';
import { cx } from 'base/classname';

export function ToolbarNode({ props, children, nodeLayoutStyle }: CoreNodeProps<ToolbarProps>) {
  const title = asString(props.title);
  const fixed = asBoolean(props.fixed);

  return (
    <div
      className={cx(styles.toolbar, fixed && styles.toolbarFixed)}
      style={nodeLayoutStyle}
    >
      {title ? <span className={styles.toolbarTitle}>{title}</span> : null}
      <div className={styles.toolbarActions}>{children}</div>
    </div>
  );
}
