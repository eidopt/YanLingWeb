'use client';

import styles from './PublishedSitePageContent.module.css';
import type { ThemeLayoutDocument } from 'ui/layout/types';
import {
  DynamicThemeRenderer,
  type ThemeRuntime,
  useDynamicThemeRendererController,
} from 'ui/renderer';

export interface PublicSiteConfig {
  layoutDocument: ThemeLayoutDocument;
  runtime: ThemeRuntime;
}

interface PublishedSitePageContentProps {
  config: PublicSiteConfig;
}

export function PublishedSitePageContent({
  config,
}: PublishedSitePageContentProps) {
  const controller = useDynamicThemeRendererController({
    layoutDocument: config.layoutDocument,
    runtime: config.runtime,
    screenPreset: 'mobile',
  });

  return (
    <main
      className={styles.page}
      style={config.runtime.cssVars}
    >
      <DynamicThemeRenderer controller={controller} />
    </main>
  );
}
