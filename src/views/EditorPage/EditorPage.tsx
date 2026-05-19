'use client';

import styles from './EditorPage.module.css';
import { useAppServices } from 'hooks/useAppServices';
import { useSearchParams } from 'next/navigation';
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ThemeSpec } from 'types/theme.types';
import { ThemeLayoutBuilder } from 'ui/editor/ThemeLayoutBuilder';
import type { BuilderCanvas, LayoutBuilderTheme } from 'ui/editor/types';
import type { ThemeLayoutDocument } from 'ui/layout/types';

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

function EditorPageInner() {
  const searchParams = useSearchParams();
  const themeId = searchParams.get('themeId') ?? undefined;
  const ownedTemplateId = searchParams.get('templateId') ?? undefined;
  const { templateService } = useAppServices();
  const [marketTemplates, setMarketTemplates] = useState<ThemeSpec[]>([]);
  const [ownedTemplate, setOwnedTemplate] = useState<ThemeSpec | null>(null);
  const [loading, setLoading] = useState(true);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef('');

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      templateService.fetchAll(),
      ownedTemplateId
        ? templateService.fetchOwnedById(ownedTemplateId)
        : Promise.resolve(null),
    ])
      .then(([market, owned]) => {
        if (cancelled) {
          return;
        }
        setMarketTemplates(market);
        setOwnedTemplate(owned);
      })
      .catch(() => {
        if (!cancelled) {
          setMarketTemplates([]);
          setOwnedTemplate(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
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

  const initialThemeId = ownedTemplateId ?? themeId;

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
    if (serialized === lastSavedRef.current) {
      return;
    }

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      lastSavedRef.current = serialized;
      void templateService.saveOwned(ownedTemplateId, {
        layoutDocument,
      });
    }, 900);
  }, [ownedTemplateId, templateService]);

  if (loading || templates.length === 0) {
    return <div className={styles.viewport} />;
  }

  return (
    <div className={styles.viewport}>
      <ThemeLayoutBuilder
        themes={templates}
        initialThemeId={initialThemeId}
        onCanvasesChange={handleCanvasesChange}
      />
    </div>
  );
}

export function EditorPage() {
  return (
    <Suspense fallback={<div className={styles.viewport} />}>
      <EditorPageInner />
    </Suspense>
  );
}
