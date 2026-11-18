'use client';

import { asBoolean, asString } from '../../valueResolvers';
import type { AlertProps } from '../propsTypes';
import type { CoreNodeProps } from '../types';
import styles from './AlertNode.module.css';
import { useState } from 'react';

const ICON_MAP: Record<string, string> = {
  info: 'i',
  success: '✓',
  warning: '!',
  error: '×',
};

export function AlertNode({ props, nodeLayoutStyle }: CoreNodeProps<AlertProps>) {
  const text = asString(props.text);
  const type = asString(props.type, 'info');
  const closable = asBoolean(props.closable);
  const icon = ICON_MAP[type] || ICON_MAP.info;
  const alertKey = `${type}:${closable}:${text}`;
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);

  if (dismissedKey === alertKey) {
    return null;
  }

  return (
    <div className={styles.alert} data-type={type} role="alert" style={nodeLayoutStyle}>
      <span className={styles.icon}>{icon}</span>
      {text ? <span className={styles.text}>{text}</span> : null}
      {closable ? (
        <button type="button" className={styles.close} aria-label="关闭提示" onClick={() => setDismissedKey(alertKey)}>
          ×
        </button>
      ) : null}
    </div>
  );
}
