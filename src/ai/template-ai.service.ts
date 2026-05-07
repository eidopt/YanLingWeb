import { BackendProxyProvider } from './core/providers/backend-proxy.provider';
import type { ProviderMessage, ProviderTool } from './core/providers/types';
import { QueryLoop } from './core/query-loop';
import { formatUiIntentPlanForPrompt, planUiIntent } from './planning/ui-intent-router';
import { GENERATE_TEMPLATE_TOOL, type TemplateToolInput } from './tools/generate-template.tool';

export interface AiGenerateEvent {
  type:
    | 'text'
    | 'intent_plan'
    | 'tool_start'
    | 'tool_done'
    | 'template_saved'
    | 'error'
    | 'done';
  data: string;
}

export interface GenerateTemplateOptions {
  prompt: string;
  model?: string;
  onEvent: (event: AiGenerateEvent) => void;
  signal?: AbortSignal;
}

const SYSTEM_PROMPT = [
  'You are an expert UI template designer for an AI app and website builder.',
  '',
  'Your task: given a user description, design a complete editable UI template',
  'for an app, website, mini program, or web experience, then call generate_template',
  'once to save it.',
  '',
  'Guidelines:',
  '- Use Chinese text for all UI labels, titles, and content.',
  '- Set cssVars with at least: --color-accent, --color-bg, --color-surface, --color-text.',
  '- Build a layoutDocument with 1-4 pages. Each page has a core.screen root.',
  '- All layout nodes need: id (kebab-case), alias, layout: { mode: "flow", order: N,',
  '  width: "100%" }, props.',
  '- Use core.panel with tone for visual grouping.',
  '- Create componentTemplates for reusable patterns.',
  '- If the UI intent plan says a capability is missing, approximate it with supported',
  '  layout primitives and explain the limitation after saving.',
  '- Never use an alias unless it is a core.* alias or defined in componentTemplates.',
  '- templateId format: {category}-{theme} (e.g. "fitness-tracker").',
  '- Call generate_template exactly ONCE. After saving, describe what you created.',
].join('\n');

export class TemplateAiService {
  private provider: BackendProxyProvider;

  constructor(private readonly getToken: () => string | null) {
    this.provider = new BackendProxyProvider(getToken);
  }

  async generate(opts: GenerateTemplateOptions): Promise<void> {
    const { prompt, model = 'gpt-5.4', onEvent, signal } = opts;
    const intentPlan = planUiIntent(prompt);
    const intentPlanPrompt = formatUiIntentPlanForPrompt(intentPlan);

    onEvent({ type: 'intent_plan', data: JSON.stringify(intentPlan) });

    let cancelled = false;
    signal?.addEventListener('abort', () => {
      cancelled = true;
      this.provider.cancel();
    });

    const tools: ProviderTool[] = [GENERATE_TEMPLATE_TOOL];
    const messages: ProviderMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'system', content: intentPlanPrompt },
      { role: 'user', content: prompt },
    ];

    const loop = new QueryLoop({
      provider: this.provider,
      model,
      tools,
      toolSpecs: new Map([[
        GENERATE_TEMPLATE_TOOL.name,
        { name: GENERATE_TEMPLATE_TOOL.name },
      ]]),
      maxIterations: 10,
      isCancelled: () => cancelled,

      onTextDelta: (text) => { onEvent({ type: 'text', data: text }); },

      onToolEvent: (event) => {
        if (event.status === 'start') {
          onEvent({ type: 'tool_start', data: event.name });
        } else if (event.status === 'done') {
          onEvent({ type: 'tool_done', data: event.name });
        }
      },

      onError: (msg) => { onEvent({ type: 'error', data: msg }); },

      toolExecutor: async (name, args) => {
        if (name === 'generate_template') {
          return this.saveTemplate(args as unknown as TemplateToolInput, onEvent);
        }
        return { output: JSON.stringify({ error: `Unknown tool: ${name}` }) };
      },
    });

    const result = await loop.run(messages);

    if (result.stopReason === 'error') {
      onEvent({ type: 'error', data: result.error ?? 'Unknown error' });
    }
    onEvent({ type: 'done', data: '' });
  }

  private async saveTemplate(
    input: TemplateToolInput,
    onEvent: (e: AiGenerateEvent) => void,
  ): Promise<{ output: string }> {
    const token = this.getToken();
    const res = await fetch('/api/proxy/ai/templates', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(input),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let message = `Failed to save template (${res.status})`;
      try {
        message = (JSON.parse(text) as { message?: string }).message ?? message;
      } catch { /* use raw status */ }
      return { output: JSON.stringify({ error: message }) };
    }

    const saved = await res.json() as { templateId: string; action: string };
    onEvent({
      type: 'template_saved',
      data: JSON.stringify({ ...saved, name: input.name }),
    });
    return { output: JSON.stringify({ success: true, ...saved }) };
  }
}
