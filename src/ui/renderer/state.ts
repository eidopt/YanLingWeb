import {
  getThemeLayoutPage,
  normalizeThemeLayoutDocument,
  type ThemeLayoutDocument,
  type ThemeLayoutNode,
  type ThemeLayoutPage,
} from '../layout/types';
import type {
  DynamicThemeRendererState,
  DynamicThemeScreenPreset,
} from './types';
import { useEffect, useMemo, useState } from 'react';

interface DynamicThemeRendererStateOptions {
  layoutDocument: ThemeLayoutDocument;
  screenPreset?: DynamicThemeScreenPreset;
  initialPageId?: string;
  onNavigateToPage?: (pageId: string) => boolean | void;
}

const DEFAULT_STATUS_TIME = '9:41';

function createRootNode(
  page: ThemeLayoutPage,
  screenPreset: DynamicThemeScreenPreset,
  statusTime: string,
): ThemeLayoutNode {
  return {
    ...page.layout,
    props: {
      ...(page.layout.props ?? {}),
      statusTime,
      __screenPreset: screenPreset,
      __pageId: page.id,
      __pageName: page.name,
    },
  };
}

export function createDynamicThemeRendererState({
  layoutDocument,
  screenPreset = 'mobile',
  initialPageId,
  onNavigateToPage,
}: DynamicThemeRendererStateOptions): DynamicThemeRendererState {
  const normalizedDocument = normalizeThemeLayoutDocument(layoutDocument);
  const activePage = getThemeLayoutPage(normalizedDocument, initialPageId);

  return {
    layoutDocument: normalizedDocument,
    pages: normalizedDocument.pages,
    activePageId: activePage.id,
    activePage,
    rootNode: createRootNode(activePage, screenPreset, DEFAULT_STATUS_TIME),
    screenPreset,
    navigateToPage: (pageId: string) => {
      onNavigateToPage?.(pageId);
    },
  };
}

export function useDynamicThemeRendererState(
  options: DynamicThemeRendererStateOptions,
): DynamicThemeRendererState {
  const {
    layoutDocument,
    screenPreset = 'mobile',
    initialPageId,
    onNavigateToPage,
  } = options;
  const normalizedDocument = useMemo(
    () => normalizeThemeLayoutDocument(layoutDocument),
    [layoutDocument],
  );
  const [activePageId, setActivePageId] = useState(
    initialPageId ?? normalizedDocument.defaultPageId,
  );

  useEffect(() => {
    if (initialPageId) {
      if (initialPageId !== activePageId) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing controlled pageId prop
        setActivePageId(initialPageId);
      }
      return;
    }

    if (!normalizedDocument.pages.some((page) => page.id === activePageId)) {
      setActivePageId(normalizedDocument.defaultPageId);
    }
  }, [
    activePageId,
    initialPageId,
    normalizedDocument.defaultPageId,
    normalizedDocument.pages,
  ]);

  return useMemo(
    () => {
      const activePage = getThemeLayoutPage(normalizedDocument, activePageId);

      return {
        layoutDocument: normalizedDocument,
        pages: normalizedDocument.pages,
        activePageId: activePage.id,
        activePage,
        rootNode: createRootNode(
          activePage, screenPreset, DEFAULT_STATUS_TIME,
        ),
        screenPreset,
        navigateToPage: (pageId: string) => {
          const handled = onNavigateToPage?.(pageId);
          if (handled) {
            return;
          }

          if (!normalizedDocument.pages.some((page) => page.id === pageId)) {
            return;
          }

          setActivePageId(pageId);
        },
      };
    },
    [activePageId, normalizedDocument, onNavigateToPage, screenPreset],
  );
}
