'use client';

import { asBoolean, asString } from '../../valueResolvers';
import type { DrawerProps } from '../propsTypes';
import type { CoreNodeProps } from '../types';
import styles from './DrawerNode.module.css';

export function DrawerNode({ props, children, nodeLayoutStyle }: CoreNodeProps<DrawerProps>) {
  const title = asString(props.title);
  const visible = asBoolean(props.visible, true);
  const placement = asString(props.placement, 'right');

  if (!visible) {return null;}

  return (
    <div className={styles.overlay} style={nodeLayoutStyle}>
      <div className={styles.drawer} data-placement={placement}>
        {title ? (
          <div className={styles.header}>
            <span className={styles.title}>{title}</span>
          </div>
        ) : null}
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
}
