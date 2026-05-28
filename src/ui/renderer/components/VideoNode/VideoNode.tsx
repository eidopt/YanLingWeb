'use client';

import { asBoolean, asString } from '../../valueResolvers';
import type { VideoProps } from '../propsTypes';
import type { CoreNodeProps } from '../types';
import styles from './VideoNode.module.css';

export function VideoNode({ props, nodeLayoutStyle }: CoreNodeProps<VideoProps>) {
  const src = asString(props.src);
  const poster = asString(props.poster) || undefined;
  const autoplay = asBoolean(props.autoplay);
  const controls = asBoolean(props.controls, true);

  return (
    <video
      className={styles.video}
      src={src || undefined}
      poster={poster}
      autoPlay={autoplay}
      controls={controls}
      style={nodeLayoutStyle}
    />
  );
}
