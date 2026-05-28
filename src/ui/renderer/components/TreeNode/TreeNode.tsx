'use client';

import { asBoolean } from '../../valueResolvers';
import type { TreeProps } from '../propsTypes';
import type { CoreNodeProps } from '../types';
import styles from './TreeNode.module.css';
import { cx } from 'base/classname';
import { useCallback, useState } from 'react';

interface TreeNodeData {
  label: string;
  children?: TreeNodeData[];
}

function TreeItem({
  node,
  depth,
  expandAll,
  path,
}: {
  node: TreeNodeData;
  depth: number;
  expandAll: boolean;
  path: string;
}) {
  const [expanded, setExpanded] = useState(expandAll);
  const hasChildren = Array.isArray(node.children) && node.children.length > 0;
  const childNodes = hasChildren ? node.children ?? [] : [];

  const toggle = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  return (
    <li className={styles.treeItem}>
      <span
        className={cx(styles.treeLabel, hasChildren && styles.treeLabelBranch)}
        onClick={hasChildren ? toggle : undefined}
        style={{ paddingLeft: `${depth * 16}px` }}
      >
        {hasChildren ? (
          <span className={cx(styles.treeArrow, expanded && styles.treeArrowExpanded)} aria-hidden="true" />
        ) : (
          <span className={styles.treeLeafDot} aria-hidden="true" />
        )}
        {node.label}
      </span>
      {hasChildren && expanded ? (
        <ul className={styles.treeList}>
          {childNodes.map((child, index) => (
            <TreeItem
              key={`${path}.${child.label}.${JSON.stringify(child.children ?? [])}`}
              node={child}
              depth={depth + 1}
              expandAll={expandAll}
              path={`${path}.${index + 1}`}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function TreeNode({ props, children, nodeLayoutStyle }: CoreNodeProps<TreeProps>) {
  const expandAll = asBoolean(props.expandAll);
  const data = props.data as TreeNodeData | undefined;

  if (data && typeof data === 'object' && typeof data.label === 'string') {
    return (
      <div className={styles.tree} style={nodeLayoutStyle}>
        <ul className={styles.treeList}>
          <TreeItem node={data} depth={0} expandAll={expandAll} path="root" />
        </ul>
      </div>
    );
  }

  return (
    <div className={styles.tree} style={nodeLayoutStyle}>
      {children}
    </div>
  );
}
