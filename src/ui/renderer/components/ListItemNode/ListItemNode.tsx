'use client';

import { asBoolean, asString } from '../../valueResolvers';
import type { ListItemProps } from '../propsTypes';
import type { CoreNodeProps } from '../types';
import styles from './ListItemNode.module.css';

export function ListItemNode({ props, children, nodeLayoutStyle }: CoreNodeProps<ListItemProps>) {
  const title = asString(props.title);
  const description = asString(props.description);
  const note = asString(props.note);
  const arrow = asBoolean(props.arrow);
  const thumb = asString(props.thumb);

  return (
    <div className={styles.item} style={nodeLayoutStyle}>
      {thumb ? (
        <div className={styles.thumb}>
          <img src={thumb} alt="" className={styles.thumbImg} />
        </div>
      ) : null}
      <div className={styles.content}>
        {title ? <div className={styles.title}>{title}</div> : null}
        {description ? <div className={styles.description}>{description}</div> : null}
        {children.length > 0 ? <div className={styles.children}>{children}</div> : null}
      </div>
      {note ? <div className={styles.note}>{note}</div> : null}
      {arrow ? <span className={styles.arrow} aria-hidden="true">&rsaquo;</span> : null}
    </div>
  );
}
