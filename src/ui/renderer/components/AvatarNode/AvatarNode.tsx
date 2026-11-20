'use client';

import { asString } from '../../valueResolvers';
import type { AvatarProps } from '../propsTypes';
import type { CoreNodeProps } from '../types';
import styles from './AvatarNode.module.css';
import { cx } from 'base/classname';

const sizeClassMap: Record<string, string> = {
  small: styles.avatarSmall,
  medium: styles.avatarMedium,
  large: styles.avatarLarge,
};

const shapeClassMap: Record<string, string> = {
  circle: styles.shapeCircle,
  square: styles.shapeSquare,
};

export function AvatarNode({ props, nodeLayoutStyle }: CoreNodeProps<AvatarProps>) {
  const src = asString(props.src);
  const text = asString(props.text);
  const size = asString(props.size, 'medium');
  const shape = asString(props.shape, 'circle');
  const sizeClass = sizeClassMap[size] ?? styles.avatarMedium;
  const shapeClass = shapeClassMap[shape] ?? styles.shapeCircle;
  const fallbackChar = text.trim().charAt(0);

  return (
    <div className={cx(styles.avatar, sizeClass, shapeClass)} style={nodeLayoutStyle}>
      {src ? (
        <img className={styles.img} src={src} alt={text || '头像'} />
      ) : fallbackChar ? (
        <span className={styles.fallback}>{fallbackChar}</span>
      ) : (
        <svg
          className={styles.fallback}
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M20 21a8 8 0 0 0-16 0" />
          <circle cx="12" cy="8" r="4" />
        </svg>
      )}
    </div>
  );
}
