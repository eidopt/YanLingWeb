'use client';

import { asBoolean, asString } from '../../valueResolvers';
import type { DialogProps } from '../propsTypes';
import type { CoreNodeProps } from '../types';
import styles from './DialogNode.module.css';

export function DialogNode({ props, children, nodeLayoutStyle }: CoreNodeProps<DialogProps>) {
  const title = asString(props.title);
  const visible = asBoolean(props.visible, true);
  const confirmText = asString(props.confirmText, '确定');
  const cancelText = asString(props.cancelText, '取消');

  if (!visible) {return null;}

  return (
    <div className={styles.overlay} style={nodeLayoutStyle}>
      <div className={styles.dialog}>
        {title ? (
          <div className={styles.header}>
            <span className={styles.title}>{title}</span>
          </div>
        ) : null}
        <div className={styles.body}>{children}</div>
        <div className={styles.footer}>
          <button type="button" className={styles.cancelBtn}>
            {cancelText}
          </button>
          <button type="button" className={styles.confirmBtn}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
