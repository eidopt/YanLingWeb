'use client';

import { asBoolean } from '../../valueResolvers';
import type { ListProps } from '../propsTypes';
import type { CoreNodeProps } from '../types';
import styles from './ListNode.module.css';
import { cx } from 'base/classname';

export function ListNode({ props, children, nodeLayoutStyle }: CoreNodeProps<ListProps>) {
  const bordered = asBoolean(props.bordered);
  const split = asBoolean(props.split);

  return (
    <div
      className={cx(styles.list, bordered && styles.bordered, split && styles.split)}
      style={nodeLayoutStyle}
    >
      {children}
    </div>
  );
}
