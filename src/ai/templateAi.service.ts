import { parseSseEnvelope } from './core/providers/backendProxy.provider.events';
import { type HttpClient, resolveHttpClient } from 'services/http/HttpClient';

export interface AiGenerateEvent {
  type: 'text' | 'intent_plan' | 'tool_start' | 'tool_done' | 'template_saved' | 'pipeline_stage' | 'error' | 'done';
  data: string;
}

export interface GenerateTemplateOptions {
  prompt: string;
  platform?: 'mini-program' | 'mobile-app' | 'web';
  displayCategory?: string;
  model?: string;
  onEvent: (event: AiGenerateEvent) => void;
  signal?: AbortSignal;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export class TemplateAiService {
  private readonly http: HttpClient;
  private generateCallToken = 0;
  private activeAbortController: AbortController | null = null;

  constructor(
    private readonly getToken: () => string | null,
    private readonly onAuthExpired?: () => void,
    httpClient?: HttpClient,
  ) {
    this.http = httpClient ?? resolveHttpClient(getToken);
  }

  cancel(): void {
    this.activeAbortController?.abort();
    this.activeAbortController = null;
  }

  async generate(opts: GenerateTemplateOptions): Promise<void> {
    const { prompt, platform, displayCategory, onEvent, signal } = opts;
    const myToken = ++this.generateCallToken;

    this.activeAbortController?.abort();
    const abortController = new AbortController();
    this.activeAbortController = abortController;

    const isStaleOrAborted = () => myToken !== this.generateCallToken || abortController.signal.aborted;
    const cancelOnAbort = () => {
      abortController.abort();
    };
    if (signal?.aborted) {
      cancelOnAbort();
      onEvent({ type: 'done', data: '' });
      return;
    }
    signal?.addEventListener('abort', cancelOnAbort, { once: true });

    let emittedDone = false;
    const emitDone = () => {
      if (emittedDone || isStaleOrAborted()) {
        return;
      }
      emittedDone = true;
      onEvent({ type: 'done', data: '' });
    };

    try {
      const token = this.getToken();
      if (!token) {
        onEvent({ type: 'error', data: '未登录，请先登录后再生成模板。' });
        emitDone();
        return;
      }

      const { response, events } = await this.http.stream('/api/proxy/aiTemplates/generate/stream', {
        method: 'POST',
        auth: true,
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          ...(platform ? { platform } : {}),
          ...(displayCategory ? { displayCategory } : {}),
        }),
        signal: abortController.signal,
      });

      if (isStaleOrAborted()) {
        return;
      }

      if (response.status === 401) {
        this.onAuthExpired?.();
        onEvent({ type: 'error', data: '登录已过期，请重新登录。' });
        emitDone();
        return;
      }

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        let message = `HTTP ${String(response.status)}`;
        try {
          const parsed = JSON.parse(text) as { message?: unknown };
          if (typeof parsed.message === 'string' && parsed.message) {
            message = parsed.message;
          } else if (text) {
            message = text;
          }
        } catch {
          if (text) {
            message = text;
          }
        }
        onEvent({ type: 'error', data: message });
        emitDone();
        return;
      }

      for await (const streamEvent of events) {
        if (isStaleOrAborted()) {
          return;
        }
        const parsed = parseSseEnvelope(streamEvent.data);
        if (!parsed.ok) {
          continue;
        }
        const { type, payload } = parsed.envelope;
        if (type === 'pipeline_stage_start' || type === 'pipeline_stage_end') {
          const phase = type === 'pipeline_stage_start' ? 'start' : 'end';
          onEvent({
            type: 'pipeline_stage',
            data: JSON.stringify({ phase, ...asRecord(payload) }),
          });
          continue;
        }
        if (type === 'template_saved') {
          onEvent({
            type: 'template_saved',
            data: JSON.stringify(asRecord(payload)),
          });
          continue;
        }
        if (type === 'text_delta') {
          const text = asString(asRecord(payload).text);
          if (text) {
            onEvent({ type: 'text', data: text });
          }
          continue;
        }
        if (type === 'error') {
          const message = asString(asRecord(payload).message) || '生成失败，请重试';
          onEvent({ type: 'error', data: message });
          continue;
        }
        if (type === 'done') {
          emitDone();
          return;
        }
      }

      emitDone();
    } catch (err) {
      if (!isStaleOrAborted()) {
        onEvent({ type: 'error', data: err instanceof Error ? err.message : String(err) });
        emitDone();
      }
    } finally {
      signal?.removeEventListener('abort', cancelOnAbort);
      if (this.activeAbortController === abortController) {
        this.activeAbortController = null;
      }
    }
  }
}
