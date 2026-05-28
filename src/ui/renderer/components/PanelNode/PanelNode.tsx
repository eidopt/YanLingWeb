'use client';

import { asCssLength, asString } from '../../valueResolvers';
import type { PanelProps } from '../propsTypes';
import type { CoreNodeProps } from '../types';
import styles from './PanelNode.module.css';
import { cx } from 'base/classname';

export function PanelNode({ props, children, nodeLayoutStyle }: CoreNodeProps<PanelProps>) {
  const tone = asString(props.tone, 'default');
  const isAccentTone = tone === 'accent' || tone === 'promo' || tone === 'warm';
  const isSoftTone = tone === 'soft' || tone === 'member' || tone === 'highlight';
  const className = cx(
    styles.panel,
    isAccentTone ? styles.panelAccent : isSoftTone ? styles.panelSoft : '',
  );
  const onClick =
    typeof props.onClick === 'function' ? (props.onClick as () => void) : undefined;

  return (
    <section
      className={className}
      onClick={onClick}
      style={{
        ...nodeLayoutStyle,
        position: props.__hasAbsoluteChildren ? 'relative' : undefined,
        gap: asCssLength(props.gap, '12px'),
        cursor: onClick ? 'pointer' : undefined,
      }}
    >
      {children}
    </section>
  );
}
