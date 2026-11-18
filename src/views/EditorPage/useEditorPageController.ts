'use client';

import { editorPageContent as c } from './EditorPage.content';
import { buildLayoutDocumentFromCanvases, EditorAutosaveScheduler } from 'domain/editor/autosaveStrategy';
import { useAppServices } from 'hooks/useAppServices';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { TemplateRequestError } from 'services/TemplateService';
import { editorPageStateActions, useEditorPageSnapshot } from 'state/editorPageState';
import type { ThemeSpec } from 'types/theme.types';
import type { BuilderCanvas, LayoutBuilderTheme } from 'ui/editor/types';

const EMPTY_TEMPLATES: ThemeSpec[] = [];

/** Minimal shape of a `pipeline_stage` SSE event for the view's progress consumer. */
export interface PipelineStageEvent {
  type: string;
  data: string;
}

export interface EditorPageController {
  loading: boolean;
  generating: boolean;
  generateError: string | null;
  templates: ThemeSpec[];
  libraryTemplates: ThemeSpec[];
  initialThemeId: string | undefined;
  handleCanvasesChange: (canvases: BuilderCanvas[], activeCanvasId: string, activeTheme: LayoutBuilderTheme) => void;
  /** Register a listener for `pipeline_stage` events emitted during template generation. */
  onPipelineEvent: (listener: (event: PipelineStageEvent) => void) => () => void;
  goHome: () => void;
}

export function useEditorPageController(): EditorPageController {
  const searchParams = useSearchParams();
  const router = useRouter();
  const themeId = searchParams.get('themeId') ?? undefined;
  const ownedTemplateId = searchParams.get('templateId') ?? undefined;
  const autoGenerate = searchParams.get('autoGenerate') === 'true';
  const promptParam = searchParams.get('prompt') ?? '';
  const { templateService, templateAiService } = useAppServices();
  const state = useEditorPageSnapshot();
  const autosaveRef = useRef<EditorAutosaveScheduler | null>(null);
  const pipelineListenersRef = useRef<Set<(event: PipelineStageEvent) => void>>(new Set());
  const loadKey = ownedTemplateId ?? '';
  const generationKey = `${autoGenerate ? 'auto' : 'manual'}:${promptParam}`;
  const shouldGenerate = autoGenerate && !!promptParam;
  const isCurrentLoad = state.loadKey === loadKey;
  const isCurrentGeneration = state.generationKey === generationKey;
  const loading = isCurrentLoad ? state.loading : true;
  const marketTemplates = isCurrentLoad ? state.marketTemplates : EMPTY_TEMPLATES;
  const ownedTemplate = isCurrentLoad ? state.ownedTemplate : null;
  const generating = isCurrentGeneration ? state.generating : shouldGenerate;
  const generateError = isCurrentGeneration ? state.generateError : null;

  useEffect(() => {
    const requestState = { cancelled: false };
    editorPageStateActions.startLoading(loadKey);

    void Promise.all([
      templateService.fetchAll(),
      ownedTemplateId ? templateService.fetchOwnedById(ownedTemplateId) : Promise.resolve(null),
    ])
      .then(([market, owned]) => {
        if (requestState.cancelled) {
          return;
        }
        editorPageStateActions.finishLoading(loadKey, market, owned);
      })
      .catch(() => {
        if (!requestState.cancelled) {
          editorPageStateActions.failLoading(loadKey);
        }
      });

    return () => {
      requestState.cancelled = true;
    };
  }, [loadKey, ownedTemplateId, templateService]);

  useEffect(() => {
    editorPageStateActions.syncGenerationIntent(generationKey, shouldGenerate);
  }, [generationKey, shouldGenerate]);

  useEffect(() => {
    if (!shouldGenerate) {
      return;
    }

    const abort = new AbortController();
    let savedTemplateId: string | null = null;
    let receivedError = false;

    void templateAiService.generate({
      prompt: promptParam,
      signal: abort.signal,
      onEvent: (event) => {
        if (event.type === 'pipeline_stage') {
          for (const listener of pipelineListenersRef.current) {
            listener(event);
          }
        }
        if (event.type === 'template_saved') {
          try {
            const data = JSON.parse(event.data) as { templateId?: string };
            if (data.templateId) {
              savedTemplateId = data.templateId;
            }
          } catch {
            // ignore parse error
          }
        }
        if (event.type === 'done') {
          if (savedTemplateId) {
            editorPageStateActions.finishGeneration(generationKey);
            router.replace(`/editor?templateId=${encodeURIComponent(savedTemplateId)}`);
          } else if (!receivedError) {
            editorPageStateActions.setGenerationError(generationKey, c.generateDefaultError);
          } else {
            editorPageStateActions.finishGeneration(generationKey);
          }
        }
        if (event.type === 'error') {
          receivedError = true;
          editorPageStateActions.setGenerationError(generationKey, event.data || c.generateDefaultError);
        }
      },
    });

    return () => {
      abort.abort();
    };
  }, [generationKey, promptParam, router, shouldGenerate, templateAiService]);

  useEffect(() => {
    if (!ownedTemplateId) {
      autosaveRef.current?.dispose();
      autosaveRef.current = null;
      return undefined;
    }

    const autosave = new EditorAutosaveScheduler({
      initialDelayMs: 900,
      save: (layoutDocument) => templateService.saveOwned(ownedTemplateId, { layoutDocument }).then(() => undefined),
      getRetry: (error) =>
        error instanceof TemplateRequestError && error.status === 429
          ? { retryAfterMs: error.retryAfterMs ?? 3000 }
          : null,
      onError: (error) => {
        console.warn('Failed to autosave owned template', error instanceof Error ? error.message : error);
      },
    });
    autosaveRef.current = autosave;
    return () => {
      autosave.dispose();
      if (autosaveRef.current === autosave) {
        autosaveRef.current = null;
      }
    };
  }, [ownedTemplateId, templateService]);

  const templates = useMemo(() => {
    if (!ownedTemplate) {
      return marketTemplates;
    }

    const withoutDuplicate = marketTemplates.filter((template) => template.id !== ownedTemplate.id);
    return [ownedTemplate, ...withoutDuplicate];
  }, [marketTemplates, ownedTemplate]);

  const handleCanvasesChange = useCallback(
    (canvases: BuilderCanvas[], activeCanvasId: string, activeTheme: LayoutBuilderTheme) => {
      if (!ownedTemplateId || activeTheme.id !== ownedTemplateId) {
        return;
      }

      const layoutDocument = buildLayoutDocumentFromCanvases(canvases, activeCanvasId);
      autosaveRef.current?.schedule(layoutDocument);
    },
    [ownedTemplateId],
  );

  const onPipelineEvent = useCallback((listener: (event: PipelineStageEvent) => void): (() => void) => {
    pipelineListenersRef.current.add(listener);
    return () => {
      pipelineListenersRef.current.delete(listener);
    };
  }, []);

  const goHome = useCallback(() => {
    router.push('/');
  }, [router]);

  return {
    loading,
    generating,
    generateError,
    templates,
    libraryTemplates: marketTemplates,
    initialThemeId: ownedTemplateId ?? themeId,
    handleCanvasesChange,
    onPipelineEvent,
    goHome,
  };
}
