'use client';

import { asString } from '../../valueResolvers';
import type { TooltipProps } from '../propsTypes';
import type { CoreNodeProps } from '../types';
import styles from './TooltipNode.module.css';
import { cx } from 'base/classname';

export function TooltipNode({ props, nodeLayoutStyle }: CoreNodeProps<TooltipProps>) {
  const text = asString(props.text);
  const placement = asString(props.placement, 'top');
  const placementClass =
    placement === 'bottom'
      ? styles.tooltipBottom
      : placement === 'left'
        ? styles.tooltipLeft
        : placement === 'right'
          ? styles.tooltipRight
          : styles.tooltipTop;

  return (
    <span
      className={cx(styles.tooltip, placementClass)}
      data-tooltip={text}
      style={nodeLayoutStyle}
    >
      {text}
    </span>
  );
}
