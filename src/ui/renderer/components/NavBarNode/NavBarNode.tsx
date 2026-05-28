'use client';

import { asBoolean, asString } from '../../valueResolvers';
import type { NavBarProps } from '../propsTypes';
import type { CoreNodeProps } from '../types';
import styles from './NavBarNode.module.css';
import { cx } from 'base/classname';

export function NavBarNode({ props, children, nodeLayoutStyle }: CoreNodeProps<NavBarProps>) {
  const title = asString(props.title);
  const subtitle = asString(props.subtitle);
  const leftArrow = asBoolean(props.leftArrow);
  const fixed = asBoolean(props.fixed);
  const transparent = asBoolean(props.transparent);

  return (
    <nav
      className={cx(styles.navbar, fixed && styles.fixed, transparent && styles.transparent)}
      style={nodeLayoutStyle}
    >
      <div className={styles.inner}>
        <div className={styles.left}>
          {leftArrow ? <span className={styles.arrow} aria-hidden="true">&larr;</span> : null}
        </div>
        <div className={styles.center}>
          {title ? <div className={styles.title}>{title}</div> : null}
          {subtitle ? <div className={styles.subtitle}>{subtitle}</div> : null}
        </div>
        <div className={styles.right} />
      </div>
      {children.length > 0 ? <div className={styles.body}>{children}</div> : null}
    </nav>
  );
}
