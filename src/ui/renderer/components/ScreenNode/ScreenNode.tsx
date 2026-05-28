'use client';

import { dynamicThemeRendererContent } from '../../content';
import type { ThemeRuntime } from '../../types';
import { asString, asStringArray } from '../../valueResolvers';
import type { ScreenProps } from '../propsTypes';
import type { CoreNodeProps } from '../types';
import styles from './ScreenNode.module.css';
import { cx } from 'base/classname';
import type { CSSProperties, ReactNode } from 'react';

interface ScreenNodeProps extends CoreNodeProps<ScreenProps> {
  runtime: ThemeRuntime;
}

export function ScreenNode({ runtime, props, children, nodeLayoutStyle }: ScreenNodeProps) {
  const screenPreset = props.__screenPreset === 'desktop'
    ? 'desktop'
    : props.__screenPreset === 'tablet'
      ? 'tablet'
      : 'mobile';
  const surface = asString(props.surface);
  const chrome = asString(
    props.chrome,
    surface === 'web' ? 'none' : surface === 'mini-program' ? 'wechat' : 'app',
  );
  const isWebSurface = surface === 'web' || chrome === 'none';
  const isWechatChrome = chrome === 'wechat';
  const isMobileScreen = screenPreset === 'mobile';
  const isTabletScreen = screenPreset === 'tablet';
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
        isWebSurface && styles.screenWeb,
        !isWebSurface && isMobileScreen && styles.screenMobile,
        !isWebSurface && isTabletScreen && styles.screenTablet,
        !isWebSurface && screenPreset === 'desktop' && styles.screenDesktop,
      )}
      style={{
        ...(runtime.cssVars as CSSProperties),
        ...nodeLayoutStyle,
        width: isWebSurface || !isMobileScreen ? '100%' : undefined,
        maxWidth: isWebSurface || !isMobileScreen ? '100%' : undefined,
        height: isWebSurface
          ? undefined
          : isMobileScreen
          ? 'var(--screen-height, var(--app-unit-80))'
          : isTabletScreen
            ? 'var(--screen-height-tablet, calc(var(--app-base-unit) * 128))'
            : 'var(--screen-height-desktop, var(--app-unit-112))',
        maxHeight: isWebSurface
          ? undefined
          : isMobileScreen
          ? 'var(--screen-height, var(--app-unit-80))'
          : isTabletScreen
            ? 'var(--screen-height-tablet, calc(var(--app-base-unit) * 128))'
            : 'var(--screen-height-desktop, var(--app-unit-112))',
        minHeight: isWebSurface
          ? '100%'
          : isMobileScreen
          ? undefined
          : isTabletScreen
            ? 'var(--screen-height-tablet, calc(var(--app-base-unit) * 128))'
            : 'var(--screen-height-desktop, var(--app-unit-112))',
        borderRadius: isWebSurface || isMobileScreen
          ? undefined
          : 'var(--radius-screen, var(--app-radius-3xl))',
      }}
    >
      {!isWebSurface ? (
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
      ) : null}

      {!isWebSurface ? (
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
            <span className={isWechatChrome && isMobileScreen ? styles.miniProgramCapsuleLabel : styles.headerAction}>
              {asString(props.headerActionLabel)}
            </span>
          ) : (
            isWechatChrome && isMobileScreen ? (
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
      ) : null}

      <div
        className={cx(styles.viewport, isWebSurface && styles.viewportWeb)}
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
        ? <div className={cx(styles.footer, isWebSurface && styles.footerWeb)}>{footerChildren}</div>
        : null}
    </section>
  );
}
