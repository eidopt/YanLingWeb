'use client';

import { asBoolean, asString } from '../../valueResolvers';
import type { AudioProps } from '../propsTypes';
import type { CoreNodeProps } from '../types';
import styles from './AudioNode.module.css';

export function AudioNode({ props, nodeLayoutStyle }: CoreNodeProps<AudioProps>) {
  const src = asString(props.src);
  const autoplay = asBoolean(props.autoplay);
  const controls = asBoolean(props.controls, true);

  return (
    <audio
      className={styles.audio}
      src={src || undefined}
      autoPlay={autoplay}
      controls={controls}
      style={nodeLayoutStyle}
    />
  );
}
