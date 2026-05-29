import type { ThemeLayoutDocument } from 'ui/layout/types';

export interface LayoutDocumentCanvas {
  id: string;
  name: string;
  document: ThemeLayoutDocument;
}

export type AutosaveTimerHandle = ReturnType<typeof setTimeout>;

export interface AutosaveTimerApi {
  setTimeout(handler: () => void, delayMs: number): AutosaveTimerHandle;
  clearTimeout(handle: AutosaveTimerHandle): void;
}

export interface AutosaveRetry {
  retryAfterMs: number;
}

export interface EditorAutosaveSchedulerOptions {
  initialDelayMs: number;
  save(document: ThemeLayoutDocument): Promise<void>;
  getRetry(error: unknown): AutosaveRetry | null;
  onError(error: unknown): void;
  timer?: AutosaveTimerApi;
  serialize?: (document: ThemeLayoutDocument) => string;
}

const defaultTimer: AutosaveTimerApi = {
  setTimeout: (handler, delayMs) => setTimeout(handler, delayMs),
  clearTimeout: (handle) => clearTimeout(handle),
};

export class EditorAutosaveScheduler {
  private readonly timer: AutosaveTimerApi;
  private readonly serialize: (document: ThemeLayoutDocument) => string;
  private timerHandle: AutosaveTimerHandle | null = null;
  private lastSaved = '';
  private pendingSave = '';

  constructor(private readonly options: EditorAutosaveSchedulerOptions) {
    this.timer = options.timer ?? defaultTimer;
    this.serialize = options.serialize ?? JSON.stringify;
  }

  schedule(document: ThemeLayoutDocument): void {
    const serialized = this.serialize(document);
    if (serialized === this.lastSaved || serialized === this.pendingSave) {
      return;
    }

    this.clearTimer();
    this.pendingSave = serialized;
    this.runSave(document, serialized, this.options.initialDelayMs);
  }

  dispose(): void {
    this.clearTimer();
  }

  private runSave(document: ThemeLayoutDocument, serialized: string, delayMs: number): void {
    this.timerHandle = this.timer.setTimeout(() => {
      if (this.pendingSave && this.pendingSave !== serialized) {
        return;
      }

      void this.options
        .save(document)
        .then(() => {
          this.lastSaved = serialized;
          if (this.pendingSave === serialized) {
            this.pendingSave = '';
          }
        })
        .catch((error: unknown) => {
          if (this.pendingSave && this.pendingSave !== serialized) {
            return;
          }
          const retry = this.options.getRetry(error);
          if (retry) {
            this.runSave(document, serialized, retry.retryAfterMs);
            return;
          }
          this.pendingSave = '';
          this.options.onError(error);
        });
    }, delayMs);
  }

  private clearTimer(): void {
    if (this.timerHandle !== null) {
      this.timer.clearTimeout(this.timerHandle);
      this.timerHandle = null;
    }
  }
}

export function buildLayoutDocumentFromCanvases(
  canvases: LayoutDocumentCanvas[],
  activeCanvasId: string,
): ThemeLayoutDocument {
  const activeCanvas = canvases.find((canvas) => canvas.id === activeCanvasId) ?? canvases[0];
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
