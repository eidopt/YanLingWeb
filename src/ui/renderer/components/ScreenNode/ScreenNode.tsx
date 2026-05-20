'use client';

import { dynamicThemeRendererContent } from '../../content';
import type { ThemeRuntime } from '../../types';
import { asString, asStringArray } from '../../valueResolvers';
import type { CoreNodeProps } from '../types';
import styles from './ScreenNode.module.css';
import { cx } from 'base/classname';
import type { CSSProperties, ReactNode } from 'react';

interface ScreenNodeProps extends CoreNodeProps {
  runtime: ThemeRuntime;
}

export function ScreenNode({ runtime, props, children, nodeLayoutStyle }: ScreenNodeProps) {
  const screenPreset = props.__screenPreset === 'desktop' ? 'desktop' : 'mobile';
  const isMobileScreen = screenPreset === 'mobile';
  const footerChildren: ReactNode[] = [];
  const bodyChildren: { child: ReactNode; row: number }[] = [];
  const childRows = Array.isArray(props.__childFlowRows)
    ? props.__childFlowRows.map((value) => (typeof value === 'number' ? value : 0))
    : [];

  children.forEach((child, index) => {
    const slot = asStringArray(props.__slots)[index];
    if (slot === 'footer') {
      footerChildren.push(child);
      return;
    }
    bodyChildren.push({ child, row: childRows[index] ?? index + 1 });
  });

  const groupedBodyChildren = bodyChildren.reduce<{ row: number; children: ReactNode[] }[]>(
    (rows, entry) => {
      const targetRow = entry.row || rows.length + 1;
      const currentRow = rows.find((row) => row.row === targetRow);
      if (currentRow) {
        currentRow.children.push(entry.child);
        return rows;
      }
      rows.push({ row: targetRow, children: [entry.child] });
      return rows;
    },
    [],
  );

  return (
    <section
      className={cx(
        styles.screen,
        isMobileScreen ? styles.screenMobile : styles.screenDesktop,
      )}
      style={{
        ...(runtime.cssVars as CSSProperties),
        ...nodeLayoutStyle,
        width: isMobileScreen ? undefined : '100%',
        maxWidth: isMobileScreen ? undefined : '100%',
        height: isMobileScreen
          ? 'var(--screen-height, var(--app-unit-80))'
          : 'var(--screen-height-desktop, var(--app-unit-112))',
        maxHeight: isMobileScreen
          ? 'var(--screen-height, var(--app-unit-80))'
          : 'var(--screen-height-desktop, var(--app-unit-112))',
        minHeight: isMobileScreen ? undefined : 'var(--screen-height-desktop, var(--app-unit-112))',
        borderRadius: isMobileScreen ? undefined : 'var(--radius-screen, var(--app-radius-3xl))',
      }}
    >
      <div className={cx(styles.statusBar, isMobileScreen && styles.statusBarMobile)}>
        <span className={styles.statusTime}>{asString(props.statusTime, '9:41')}</span>
        <div className={styles.statusIcons}>
          <span className={styles.signalIcon} aria-hidden="true">
            <span /><span /><span /><span />
          </span>
          <span className={styles.batteryIcon} aria-hidden="true">
            <span className={styles.batteryLevel} />
          </span>
        </div>
      </div>

      <div className={cx(styles.header, isMobileScreen && styles.headerMobile)}>
        {props.headerActionLabel ? (
          <span className={styles.headerGhostPlaceholder} />
        ) : (
          <span
            className={styles.headerGhost}
            aria-label={asString(
              props.headerLeftAriaLabel,
              dynamicThemeRendererContent.headerLeftAriaLabel,
            )}
          />
        )}

        <strong className={styles.headerTitle}>{asString(props.title)}</strong>

        {props.headerActionLabel ? (
          <span className={isMobileScreen ? styles.miniProgramCapsuleLabel : styles.headerAction}>
            {asString(props.headerActionLabel)}
          </span>
        ) : (
          isMobileScreen ? (
            <div className={styles.miniProgramCapsule} aria-hidden="true">
              <span /><span />
            </div>
          ) : (
            <span
              className={styles.headerGhost}
              aria-label={asString(
                props.headerRightAriaLabel,
                dynamicThemeRendererContent.headerRightAriaLabel,
              )}
            />
          )
        )}
      </div>

      <div
        className={styles.viewport}
        data-layout-viewport="true"
        style={{ position: props.__hasAbsoluteChildren ? 'relative' : undefined }}
      >
        {groupedBodyChildren.map((row) => (
          <div key={row.row} className={styles.viewportRow}>
            {row.children}
          </div>
        ))}
      </div>

      {footerChildren.length > 0
        ? <div className={styles.footer}>{footerChildren}</div>
        : null}
    </section>
  );
}
