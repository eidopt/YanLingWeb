'use client';

import { asString } from '../../valueResolvers';
import type { SearchProps } from '../propsTypes';
import type { CoreNodeProps } from '../types';
import styles from './SearchNode.module.css';

export function SearchNode({ props, nodeLayoutStyle }: CoreNodeProps<SearchProps>) {
  return (
    <div className={styles.search} style={nodeLayoutStyle}>
      {asString(props.value) || asString(props.placeholder)}
    </div>
  );
}
