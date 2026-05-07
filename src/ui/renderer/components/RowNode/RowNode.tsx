'use client';

import { asBoolean, asNumber, asString } from '../../valueResolvers';
import type { CoreNodeProps } from '../types';
import styles from './RowNode.module.css';
import { cx } from 'base/classname';

export function RowNode({ props, children, nodeLayoutStyle }: CoreNodeProps) {
  const tone = asString(props.tone);
  const panelClass =
    tone === 'accent'
      ? cx(styles.row, styles.panel, styles.panelAccent)
      : tone === 'panel'
        ? cx(styles.row, styles.panel)
        : cx(styles.row, tone === 'soft' && styles.panelSoft);
  const onClick =
    typeof props.onClick === 'function' ? (props.onClick as () => void) : undefined;

  return (
    <div
      className={panelClass}
      onClick={onClick}
      style={{
        ...nodeLayoutStyle,
        position: props.__hasAbsoluteChildren ? 'relative' : undefined,
        gap: `${asNumber(props.gap, 12)}px`,
        flexWrap: asBoolean(props.wrap) ? 'wrap' : 'nowrap',
        justifyContent: asString(props.justify) || undefined,
        alignItems: asString(props.align) || undefined,
        padding:
          tone === 'accent' || tone === 'panel'
            ? undefined
            : `${asNumber(props.padding, 0)}px`,
        cursor: onClick ? 'pointer' : undefined,
      }}
    >
      {children}
    </div>
  );
}
