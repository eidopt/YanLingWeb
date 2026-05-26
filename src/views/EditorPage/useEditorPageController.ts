'use client';

import { useAppServices } from 'hooks/useAppServices';
import { useSearchParams } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { TemplateRequestError } from 'services/TemplateService';
import type { ThemeSpec } from 'types/theme.types';
import type { BuilderCanvas, LayoutBuilderTheme } from 'ui/editor/types';
import type { ThemeLayoutDocument } from 'ui/layout/types';

export interface EditorPageController {
  loading: boolean;
  templates: ThemeSpec[];
  libraryTemplates: ThemeSpec[];
  initialThemeId: string | undefined;
  handleCanvasesChange: (
    canvases: BuilderCanvas[],
    activeCanvasId: string,
    activeTheme: LayoutBuilderTheme,
  ) => void;
}

export function useEditorPageController(): EditorPageController {
  const searchParams = useSearchParams();
  const themeId = searchParams.get('themeId') ?? undefined;
  const ownedTemplateId = searchParams.get('templateId') ?? undefined;
  const { templateService } = useAppServices();
  const [marketTemplates, setMarketTemplates] = useState<ThemeSpec[]>([]);
  const [ownedTemplate, setOwnedTemplate] = useState<ThemeSpec | null>(null);
  const [loading, setLoading] = useState(true);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef('');
  const pendingSaveRef = useRef('');

  useEffect(() => {
    const requestState = { cancelled: false };

    void Promise.all([
      templateService.fetchAll(),
      ownedTemplateId
        ? templateService.fetchOwnedById(ownedTemplateId)
        : Promise.resolve(null),
    ])
      .then(([market, owned]) => {
        if (requestState.cancelled) {
          return;
        }
        setMarketTemplates(market);
        setOwnedTemplate(owned);
      })
      .catch(() => {
        if (!requestState.cancelled) {
          setMarketTemplates([]);
          setOwnedTemplate(null);
        }
      })
      .finally(() => {
        if (!requestState.cancelled) {
          setLoading(false);
        }
      });

    return () => {
      requestState.cancelled = true;
    };
  }, [ownedTemplateId, templateService]);

  useEffect(() => () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
  }, []);

  const templates = useMemo(() => {
    if (!ownedTemplate) {
      return marketTemplates;
    }

    const withoutDuplicate = marketTemplates.filter(
      (template) => template.id !== ownedTemplate.id,
    );
    return [ownedTemplate, ...withoutDuplicate];
  }, [marketTemplates, ownedTemplate]);

  const handleCanvasesChange = useCallback((
    canvases: BuilderCanvas[],
    activeCanvasId: string,
    activeTheme: LayoutBuilderTheme,
  ) => {
    if (!ownedTemplateId || activeTheme.id !== ownedTemplateId) {
      return;
    }

    const layoutDocument = buildLayoutDocumentFromCanvases(
      canvases,
      activeCanvasId,
    );
    const serialized = JSON.stringify(layoutDocument);
    if (
      serialized === lastSavedRef.current ||
      serialized === pendingSaveRef.current
    ) {
      return;
    }

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    pendingSaveRef.current = serialized;
    const runSave = (delayMs: number) => {
      saveTimerRef.current = setTimeout(() => {
        if (pendingSaveRef.current && pendingSaveRef.current !== serialized) {
          return;
        }
        void templateService.saveOwned(ownedTemplateId, { layoutDocument })
          .then(() => {
            lastSavedRef.current = serialized;
            if (pendingSaveRef.current === serialized) {
              pendingSaveRef.current = '';
            }
          })
          .catch((error: unknown) => {
            if (pendingSaveRef.current && pendingSaveRef.current !== serialized) {
              return;
            }
            pendingSaveRef.current = '';
            if (error instanceof TemplateRequestError && error.status === 429) {
              runSave(error.retryAfterMs ?? 3000);
              return;
            }
            console.warn(
              'Failed to autosave owned template',
              error instanceof Error ? error.message : error,
            );
          });
      }, delayMs);
    };
    runSave(900);
  }, [ownedTemplateId, templateService]);

  return {
    loading,
    templates,
    libraryTemplates: marketTemplates,
    initialThemeId: ownedTemplateId ?? themeId,
    handleCanvasesChange,
  };
}

function buildLayoutDocumentFromCanvases(
  canvases: BuilderCanvas[],
  activeCanvasId: string,
): ThemeLayoutDocument {
  const activeCanvas =
    canvases.find((canvas) => canvas.id === activeCanvasId) ?? canvases[0];
  const pages = canvases.map((canvas) => ({
    id: canvas.document.defaultPageId,
    name: canvas.document.pageName ?? canvas.name,
    layout: canvas.document.layout,
  }));

  return {
    ...activeCanvas.document,
    pageName: activeCanvas.document.pageName ?? activeCanvas.name,
    defaultPageId: activeCanvas.document.defaultPageId,
    layout: activeCanvas.document.layout,
    pages,
  };
}
