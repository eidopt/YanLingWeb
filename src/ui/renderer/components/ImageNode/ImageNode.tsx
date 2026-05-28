'use client';

import { asString } from '../../valueResolvers';
import type { ImageProps } from '../propsTypes';
import type { CoreNodeProps } from '../types';
import styles from './ImageNode.module.css';

function isRenderableImageSource(value: string) {
  if (!value.trim()) {
    return false;
  }
  if (value.startsWith('/')) {
    return true;
  }
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

export function ImageNode({ props, nodeLayoutStyle }: CoreNodeProps<ImageProps>) {
  const rawSrc = asString(props.src);
  const src = isRenderableImageSource(rawSrc) ? rawSrc : '';
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
