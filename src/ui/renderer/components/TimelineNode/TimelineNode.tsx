'use client';

import { asString } from '../../valueResolvers';
import type { TimelineProps } from '../propsTypes';
import type { CoreNodeProps } from '../types';
import styles from './TimelineNode.module.css';
import { cx } from 'base/classname';

export function TimelineNode({ props, children, nodeLayoutStyle }: CoreNodeProps<TimelineProps>) {
  const direction = asString(props.direction, 'vertical');
  const isHorizontal = direction === 'horizontal';

  return (
    <div
      className={cx(styles.timeline, isHorizontal ? styles.timelineHorizontal : styles.timelineVertical)}
      style={nodeLayoutStyle}
    >
      {children}
    </div>
  );
}
