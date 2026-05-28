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
  const fallbackChar = text.charAt(0) || '?';

  return (
    <div className={cx(styles.avatar, sizeClass, shapeClass)} style={nodeLayoutStyle}>
      {src ? (
        <img className={styles.img} src={src} alt={text || 'Avatar'} />
      ) : (
        <span className={styles.fallback}>{fallbackChar}</span>
      )}
    </div>
  );
}
