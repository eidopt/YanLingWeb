'use client';

import { asNumber } from '../../valueResolvers';
import type { PaginationProps } from '../propsTypes';
import type { CoreNodeProps } from '../types';
import styles from './PaginationNode.module.css';

function buildPages(current: number, total: number): (number | 'left-ellipsis' | 'right-ellipsis')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages: (number | 'left-ellipsis' | 'right-ellipsis')[] = [1];
  if (current > 3) {
    pages.push('left-ellipsis');
  }
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
    pages.push(i);
  }
  if (current < total - 2) {
    pages.push('right-ellipsis');
  }
  pages.push(total);
  return pages;
}

export function PaginationNode({ props, nodeLayoutStyle }: CoreNodeProps<PaginationProps>) {
  const current = asNumber(props.current, 1);
  const total = asNumber(props.total, 1);
  const pageSize = asNumber(props.pageSize, 10);
  const safeTotal = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  const safeCurrent = Math.max(1, Math.min(safeTotal, current));
  const pages = buildPages(safeCurrent, safeTotal);

  return (
    <nav className={styles.pagination} style={nodeLayoutStyle} aria-label="分页">
      <button type="button" className={styles.btn} disabled={safeCurrent <= 1} aria-label="上一页">
        &lsaquo;
      </button>
      {pages.map((page) =>
        typeof page === 'string' ? (
          <span key={page} className={styles.ellipsis}>
            &hellip;
          </span>
        ) : (
          <button
            type="button"
            key={page}
            className={`${styles.btn} ${page === safeCurrent ? styles.active : ''}`}
            aria-current={page === safeCurrent ? 'page' : undefined}
          >
            {page}
          </button>
        ),
      )}
      <button type="button" className={styles.btn} disabled={safeCurrent >= safeTotal} aria-label="下一页">
        &rsaquo;
      </button>
    </nav>
  );
}
