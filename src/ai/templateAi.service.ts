import { BrowserTemplateStore } from './adapters/browserTemplateStore';
import { TemplateGenerationAgent } from './agents/templateGenerationAgent';
import { BackendProxyProvider } from './core/providers/backendProxy.provider';
import type { AgentEvent } from '@shared/agent/contracts/agent';
import { type HttpClient, resolveHttpClient } from 'services/http/HttpClient';

export interface AiGenerateEvent {
  type: 'text' | 'intent_plan' | 'tool_start' | 'tool_done' | 'template_saved' | 'pipeline_stage' | 'error' | 'done';
  data: string;
}

export interface GenerateTemplateOptions {
  prompt: string;
  model?: string;
  onEvent: (event: AiGenerateEvent) => void;
  signal?: AbortSignal;
}

function eventDataToString(data: unknown): string {
  if (typeof data === 'string') {
    return data;
  }
  if (data == null) {
    return '';
  }
  return JSON.stringify(data);
}

function getToolEventName(data: unknown): string {
  if (data && typeof data === 'object' && 'name' in data) {
    const name = (data as { name?: unknown }).name;
    return typeof name === 'string' ? name : eventDataToString(data);
  }
  return eventDataToString(data);
}

function forwardGenerateAgentEvent(event: AgentEvent, onEvent: (event: AiGenerateEvent) => void): void {
  switch (event.type) {
    case 'intent_plan':
      onEvent({ type: 'intent_plan', data: eventDataToString(event.data) });
      break;
    case 'text':
      onEvent({ type: 'text', data: eventDataToString(event.data) });
      break;
    case 'tool_start':
      onEvent({ type: 'tool_start', data: getToolEventName(event.data) });
      break;
    case 'tool_done':
      onEvent({ type: 'tool_done', data: getToolEventName(event.data) });
      break;
    case 'template_saved':
      onEvent({ type: 'template_saved', data: eventDataToString(event.data) });
      break;
    case 'tool_error':
    case 'error':
      onEvent({ type: 'error', data: eventDataToString(event.data) });
      break;
    case 'done':
      onEvent({ type: 'done', data: '' });
      break;
    case 'edit_applied':
      break;
  }
}

export class TemplateAiService {
  private provider: BackendProxyProvider;
  private static defaultModel: string | null = null;
  private readonly http: HttpClient;
  /**
   * Per-call sequence token. Incremented at the top of every `generate()` call;
   * the `onStructuredEvent` callback closure captures the call's own token and
   * drops envelopes that arrive after a newer call has started. This protects
   * against a stale callback (from a previous `generate()`) firing into the
   * current call's onEvent.
   */
  private generateCallToken = 0;

  constructor(
    private readonly getToken: () => string | null,
    private readonly onAuthExpired?: () => void,
    httpClient?: HttpClient,
    provider?: BackendProxyProvider,
  ) {
    this.http = httpClient ?? resolveHttpClient(getToken);
    this.provider = provider ?? new BackendProxyProvider(getToken, onAuthExpired, this.http);
  }

  static async fetchConfig(token: string | null, httpClient = resolveHttpClient(() => token)): Promise<string> {
    if (TemplateAiService.defaultModel) {
      return TemplateAiService.defaultModel;
    }
    try {
      const { data, response } = await httpClient.json<{ provider: string; model: string }>('/api/proxy/ai/config', {
        auth: Boolean(token),
      });
      if (response.ok) {
        TemplateAiService.defaultModel = data.model;
        return data.model;
      }
    } catch {
      // Fall through to the browser-safe default.
    }
    return 'gpt-5.4';
  }

  async generate(opts: GenerateTemplateOptions): Promise<void> {
    const { prompt, model, onEvent, signal } = opts;
    let cancelled = false;

    // Bump the per-call sequence token BEFORE the await so the captured closure
    // is installed synchronously at the top of the call. The token check inside
    // the closure drops envelopes that arrive after a newer generate() call has
    // started and replaced `this.provider.onStructuredEvent`.
    const myToken = ++this.generateCallToken;
    const activeProvider = this.provider;
    activeProvider.resetConversation();
    activeProvider.onStructuredEvent = (envelope) => {
      if (myToken !== this.generateCallToken) {
        return; // stale call, drop
      }
      if (envelope.type === 'pipeline_stage_start' || envelope.type === 'pipeline_stage_end') {
        const phase = envelope.type === 'pipeline_stage_start' ? 'start' : 'end';
        onEvent({
          type: 'pipeline_stage',
          data: JSON.stringify({ phase, ...(envelope.payload as Record<string, unknown>) }),
        });
      }
    };
    const cancelOnAbort = () => {
      cancelled = true;
      activeProvider.cancel();
    };
    signal?.addEventListener('abort', cancelOnAbort, { once: true });

    try {
      const cfgModel = await TemplateAiService.fetchConfig(this.getToken(), this.http);
      const effectiveModel = model ?? cfgModel;
      const agent = new TemplateGenerationAgent({
        provider: activeProvider,
        model: effectiveModel,
        templateStore: new BrowserTemplateStore(this.getToken, this.http),
        persist: true,
        isCancelled: () => cancelled,
        onEvent: (event) => {
          forwardGenerateAgentEvent(event, onEvent);
        },
      });
      const result = await agent.run({ prompt });
      if (result.status === 'errored' && result.error) {
        onEvent({ type: 'error', data: result.error });
      }
    } finally {
      signal?.removeEventListener('abort', cancelOnAbort);
    }
  }
}
