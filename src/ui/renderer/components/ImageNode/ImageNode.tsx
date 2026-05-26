'use client';

import { asString } from '../../valueResolvers';
import type { CoreNodeProps } from '../types';
import styles from './ImageNode.module.css';

export function ImageNode({ props, nodeLayoutStyle }: CoreNodeProps) {
  const src = asString(props.src);
  const alt = asString(props.alt) || '';
  const title = asString(props.title) || undefined;
  const iconColor = asString(props.iconColor) || undefined;
  const objectFit = asString(props.objectFit);
  const safeObjectFit =
    objectFit === 'contain' || objectFit === 'fill' ? objectFit : 'cover';

  if (src) {
    return (
      <img
        className={styles.image}
        src={src}
        alt={alt}
        title={title}
        style={{
          ...nodeLayoutStyle,
          objectFit: safeObjectFit,
        }}
      />
    );
  }

  return (
    <div
      className={styles.imagePlaceholder}
      aria-label={alt || title}
      style={{
        ...nodeLayoutStyle,
        ...(iconColor ? { background: iconColor } : {}),
      }}
    />
  );
}
