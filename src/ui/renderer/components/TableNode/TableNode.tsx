'use client';

import { asBoolean, asCssLength, asString } from '../../valueResolvers';
import type { TableProps } from '../propsTypes';
import type { CoreNodeProps } from '../types';
import styles from './TableNode.module.css';
import { cx } from 'base/classname';

interface Column {
  key: string;
  title: string;
  width?: string;
}

type DataRow = Record<string, unknown>;

export function TableNode({ props, nodeLayoutStyle }: CoreNodeProps<TableProps>) {
  const columns = ((Array.isArray(props.columns) ? props.columns : []) as Column[])
    .filter((column) => typeof column.key === 'string' && column.key.trim());
  const data = (Array.isArray(props.data) ? props.data : []) as DataRow[];
  const bordered = asBoolean(props.bordered);
  const stripe = asBoolean(props.stripe);

  return (
    <div className={styles.tableWrapper} style={nodeLayoutStyle}>
      <table className={cx(styles.table, bordered && styles.tableBordered, stripe && styles.tableStripe)}>
        {columns.length > 0 ? (
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={styles.th}
                  style={col.width ? { width: asCssLength(col.width) || undefined } : undefined}
                >
                  {asString(col.title)}
                </th>
              ))}
            </tr>
          </thead>
        ) : null}
        {data.length > 0 ? (
          <tbody>
            {data.map((row) => (
              <tr key={typeof row.id === 'string' ? row.id : JSON.stringify(row)}>
                {columns.map((col) => (
                  <td key={col.key} className={styles.td}>
                    {row[col.key] != null ? String(row[col.key]) : ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        ) : null}
      </table>
    </div>
  );
}
