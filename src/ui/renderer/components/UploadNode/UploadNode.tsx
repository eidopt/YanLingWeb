'use client';

import { asBoolean, asString } from '../../valueResolvers';
import type { UploadProps } from '../propsTypes';
import type { CoreNodeProps } from '../types';
import styles from './UploadNode.module.css';

export function UploadNode({ props, nodeLayoutStyle }: CoreNodeProps<UploadProps>) {
  const accept = asString(props.accept);
  const multiple = asBoolean(props.multiple);
  const actionLabel = asString(props.actionLabel, '点击上传');

  return (
    <div className={styles.upload} style={nodeLayoutStyle}>
      <div className={styles.area}>
        <span className={styles.icon}>+</span>
        <span className={styles.label}>{actionLabel}</span>
        <input
          type="file"
          className={styles.fileInput}
          accept={accept || undefined}
          multiple={multiple}
        />
      </div>
    </div>
  );
}
