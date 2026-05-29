'use client';

import styles from './PublishedSitePageContent.module.css';
import type { ThemeLayoutDocument } from 'ui/layout/types';
import {
  DynamicThemeRenderer,
  RendererErrorBoundary,
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

export function PublishedSitePageContent({ config }: PublishedSitePageContentProps) {
  const controller = useDynamicThemeRendererController({
    layoutDocument: config.layoutDocument,
    runtime: config.runtime,
    screenPreset: 'mobile',
  });

  return (
    <main className={styles.page} style={config.runtime.cssVars}>
      <RendererErrorBoundary resetKeys={[controller.state.activePageId]}>
        <DynamicThemeRenderer controller={controller} />
      </RendererErrorBoundary>
    </main>
  );
}
