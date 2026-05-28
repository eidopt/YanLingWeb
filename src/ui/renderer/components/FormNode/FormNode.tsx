'use client';

import { asString } from '../../valueResolvers';
import type { FormProps } from '../propsTypes';
import type { CoreNodeProps } from '../types';
import styles from './FormNode.module.css';

export function FormNode({ props, children, nodeLayoutStyle }: CoreNodeProps<FormProps>) {
  const labelWidth = asString(props.labelWidth, '80px');
  const labelAlign = asString(props.labelAlign, 'right');

  return (
    <form
      className={styles.form}
      style={{
        ...nodeLayoutStyle,
        '--form-label-width': labelWidth,
        '--form-label-align': labelAlign,
      } as React.CSSProperties}
      onSubmit={(e) => e.preventDefault()}
    >
      {children}
    </form>
  );
}
