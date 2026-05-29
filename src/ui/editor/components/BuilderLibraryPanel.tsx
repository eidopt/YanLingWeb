'use client';

import type { ThemeComponentDescriptor, ThemeLayoutDocument } from '../../layout/types';
import { DynamicThemeRenderer, RendererErrorBoundary, useDynamicThemeRendererController } from '../../renderer';
import { getComponentDisplayName } from '../displayText';
import { themeLayoutBuilderContent } from '../ThemeLayoutBuilder.content';
import styles from '../ThemeLayoutBuilder.module.css';
import type { LayoutBuilderTheme } from '../types';
import { cx } from 'base/classname';
import { type CSSProperties, type DragEvent, useEffect, useRef } from 'react';
import { Box, Button, Text } from 'ui/base';

type BuilderSidebarTab = 'components' | 'templates';

interface BuilderLibraryPanelProps {
  tab: BuilderSidebarTab;
  onTabChange: (tab: BuilderSidebarTab) => void;
  activeTheme: LayoutBuilderTheme;
  templates: LayoutBuilderTheme[];
  activeTemplateId: string;
  layoutDescriptors: ThemeComponentDescriptor[];
  componentDescriptors: ThemeComponentDescriptor[];
  createLibraryPreviewDocument: (descriptor: ThemeComponentDescriptor) => ThemeLayoutDocument;
  onApplyTemplate: (themeId: string) => void;
  onLibraryDragStart: (alias: string, event: DragEvent<HTMLElement>) => void;
  onLibraryDragEnd: () => void;
}

function LibraryCard({
  descriptor,
  activeTheme,
  createLibraryPreviewDocument,
  onLibraryDragStart,
  onLibraryDragEnd,
}: {
  descriptor: ThemeComponentDescriptor;
  activeTheme: LayoutBuilderTheme;
  createLibraryPreviewDocument: (descriptor: ThemeComponentDescriptor) => ThemeLayoutDocument;
  onLibraryDragStart: (alias: string, event: DragEvent<HTMLElement>) => void;
  onLibraryDragEnd: () => void;
}) {
  const previewRef = useRef<HTMLDivElement | null>(null);
  const dragImageRef = useRef<HTMLDivElement | null>(null);
  const rendererController = useDynamicThemeRendererController({
    layoutDocument: createLibraryPreviewDocument(descriptor),
    runtime: activeTheme.runtime,
    screenPreset: 'mobile',
  });

  useEffect(
    () => () => {
      dragImageRef.current?.remove();
      dragImageRef.current = null;
    },
    [],
  );

  function removeDragImage() {
    dragImageRef.current?.remove();
    dragImageRef.current = null;
  }

  function handleDragStart(event: DragEvent<HTMLElement>) {
    const previewElement = previewRef.current;
    if (previewElement) {
      removeDragImage();

      const rect = previewElement.getBoundingClientRect();
      const dragImage = previewElement.cloneNode(true) as HTMLDivElement;
      dragImage.classList.add(styles.libraryPreviewDragImage);
      dragImage.style.width = `${rect.width}px`;
      dragImage.style.height = `${rect.height}px`;
      document.body.appendChild(dragImage);
      event.dataTransfer.setDragImage(dragImage, rect.width / 2, rect.height / 2);
      dragImageRef.current = dragImage;
    }

    onLibraryDragStart(descriptor.alias, event);
  }

  function handleDragEnd() {
    removeDragImage();
    onLibraryDragEnd();
  }

  return (
    <Box as="article" className={styles.libraryCard} draggable onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <Box className={styles.libraryCardHeader}>
        <Text as="strong" size="sm" weight="bold">
          {getComponentDisplayName(descriptor.alias, descriptor.name)}
        </Text>
      </Box>
      <Box ref={previewRef} className={styles.libraryPreview} style={activeTheme.runtime.cssVars}>
        <RendererErrorBoundary resetKeys={[descriptor.alias, activeTheme.id]}>
          <DynamicThemeRenderer controller={rendererController} />
        </RendererErrorBoundary>
      </Box>
    </Box>
  );
}

function TemplateCard({
  template,
  isActive,
  onApply,
}: {
  template: LayoutBuilderTheme;
  isActive: boolean;
  onApply: () => void;
}) {
  const rendererController = useDynamicThemeRendererController({
    layoutDocument: template.layoutDocument,
    runtime: template.runtime,
    screenPreset: 'mobile',
  });

  return (
    <Box
      role="button"
      tabIndex={0}
      className={cx(styles.templateCard, isActive && styles.templateCardActive)}
      onClick={onApply}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          onApply();
        }
      }}
    >
      <Box className={styles.templateCardHeader}>
        <Text as="strong" size="sm" weight="bold">
          {template.name}
        </Text>
        <Box
          as="span"
          className={styles.templateBadge}
          style={{
            color: template.accent,
            backgroundColor: `${template.accent}1a`,
          }}
        >
          {template.tagline}
        </Box>
      </Box>

      <Box className={styles.templateThumbnail}>
        <Box className={styles.templateThumbnailScale} style={template.runtime.cssVars}>
          <RendererErrorBoundary resetKeys={[template.id]}>
            <DynamicThemeRenderer controller={rendererController} />
          </RendererErrorBoundary>
        </Box>
      </Box>
    </Box>
  );
}

export function BuilderLibraryPanel({
  tab,
  onTabChange,
  activeTheme,
  templates,
  activeTemplateId,
  layoutDescriptors,
  componentDescriptors,
  createLibraryPreviewDocument,
  onApplyTemplate,
  onLibraryDragStart,
  onLibraryDragEnd,
}: BuilderLibraryPanelProps) {
  const sidebarStyle: CSSProperties & { '--sidebar-accent': string } = {
    '--sidebar-accent': activeTheme.accent,
  };

  return (
    <Box as="aside" className={cx(styles.panel, styles.sidebarPanel)} style={sidebarStyle}>
      <Box className={styles.sidebarStickyTop}>
        <Box className={styles.sidebarTabs}>
          <Button
            type="button"
            onClick={() => onTabChange('components')}
            fullWidth
            size="sm"
            variant={tab === 'components' ? 'tab-active' : 'tab'}
          >
            {themeLayoutBuilderContent.sidebar.componentsTab}
          </Button>
          <Button
            type="button"
            onClick={() => onTabChange('templates')}
            fullWidth
            size="sm"
            variant={tab === 'templates' ? 'tab-active' : 'tab'}
          >
            {themeLayoutBuilderContent.sidebar.templatesTab}
          </Button>
        </Box>
      </Box>

      <Box className={styles.sidebarContent}>
        {tab === 'templates' ? (
          <Box className={styles.templateList}>
            {templates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                isActive={template.id === activeTemplateId}
                onApply={() => onApplyTemplate(template.id)}
              />
            ))}
          </Box>
        ) : (
          <>
            <Box className={styles.componentTabHeader}>
              <Box as="span" className={styles.sidebarActiveTag} style={{ backgroundColor: activeTheme.accent }}>
                {activeTheme.tagline}
              </Box>
            </Box>

            <Box className={styles.libraryList}>
              {[...layoutDescriptors, ...componentDescriptors].map((descriptor) => (
                <LibraryCard
                  key={descriptor.alias}
                  descriptor={descriptor}
                  activeTheme={activeTheme}
                  createLibraryPreviewDocument={createLibraryPreviewDocument}
                  onLibraryDragStart={onLibraryDragStart}
                  onLibraryDragEnd={onLibraryDragEnd}
                />
              ))}
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
}
