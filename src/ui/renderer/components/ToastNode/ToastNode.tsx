'use client';

import { asNumber, asString } from '../../valueResolvers';
import type { ToastProps } from '../propsTypes';
import type { CoreNodeProps } from '../types';
import styles from './ToastNode.module.css';
import { useEffect, useState } from 'react';

const ICON_MAP: Record<string, string> = {
  info: 'i',
  success: '✓',
  warning: '!',
  error: '×',
};

export function ToastNode({ props, nodeLayoutStyle }: CoreNodeProps<ToastProps>) {
  const message = asString(props.message);
  const type = asString(props.type, 'info');
  const duration = Math.max(0, asNumber(props.duration, 0));
  const icon = ICON_MAP[type] || ICON_MAP.info;
  const toastKey = `${type}:${duration}:${message}`;
  const [hiddenKey, setHiddenKey] = useState<string | null>(null);

  useEffect(() => {
    if (duration <= 0) {
      return;
    }

    const timer = window.setTimeout(() => setHiddenKey(toastKey), duration);
    return () => window.clearTimeout(timer);
  }, [duration, toastKey]);

  if (hiddenKey === toastKey) {
    return null;
  }

  return (
    <div className={styles.toast} data-type={type} style={nodeLayoutStyle} role="status">
      <span className={styles.icon}>{icon}</span>
      {message ? <span className={styles.message}>{message}</span> : null}
    </div>
  );
}
