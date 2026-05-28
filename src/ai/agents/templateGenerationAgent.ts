import type { TemplateStore } from '../adapters/browserTemplateStore';
import type { AIProvider, ProviderMessage, ProviderTool } from '../core/providers/types';
import { QueryLoop } from '../core/query-loop';
import { formatUiIntentPlanForPrompt, planUiIntent } from '../planning/ui-intent-router';
import { GENERATE_TEMPLATE_TOOL, type TemplateToolInput } from '../tools/generate-template.tool';
import { AgentEventRecorder } from './agentEventRecorder';
import { TEMPLATE_DESIGNER_SYSTEM_PROMPT } from '@shared/agent/prompts/templateDesignerPrompt';
import {
  formatUiDesignSkillContextForPrompt,
  inferUiDesignSkillContext,
} from '@shared/agent/skills/uiDesignSkillRegistry';
import type {
  AgentEvalScenario,
  AgentRunResult,
  ThemeLayoutDocument,
} from '@shared/agent/types';
import {
  evaluateSemanticAssertions,
} from '@shared/agent/validation/semanticAssertions';
import { evaluateUnrelatedDiff } from '@shared/agent/validation/templateDiff';
import {
  renderSmokeThemeLayoutDocument,
  validateThemeLayoutDocument,
} from '@shared/agent/validation/themeLayoutValidator';
import {
  applyVisualAssetsToLayoutDocument,
  normalizeVisualAssets,
} from '@shared/theme-layout/visualAssets';

export interface TemplateGenerationAgentOptions {
  provider: AIProvider;
  model: string;
  templateStore?: TemplateStore;
  persist?: boolean;
  maxIterations?: number;
  isCancelled?: () => boolean;
  onEvent?: (event: ReturnType<AgentEventRecorder['event']>) => void;
}

export interface TemplateGenerationRunInput {
  prompt: string;
  scenario?: AgentEvalScenario;
  scenarioId?: string;
}

function asThemeLayoutDocument(value: unknown): ThemeLayoutDocument {
  return value as ThemeLayoutDocument;
}

export class TemplateGenerationAgent {
  constructor(private readonly options: TemplateGenerationAgentOptions) {}

  async run(input: TemplateGenerationRunInput): Promise<AgentRunResult> {
    const startedAt = Date.now();
    const recorder = new AgentEventRecorder();
    const emit = (type: Parameters<AgentEventRecorder['event']>[0], data?: unknown) => {
      const event = recorder.event(type, data);
      this.options.onEvent?.(event);
    };
    const intentPlan = planUiIntent(input.prompt);
    const skillContext = inferUiDesignSkillContext(input.prompt, intentPlan.matchedCategories);
    emit('intent_plan', intentPlan);

    let finalDocument: ThemeLayoutDocument | undefined;
    let terminalError = '';

    const tools: ProviderTool[] = [GENERATE_TEMPLATE_TOOL];
    const messages: ProviderMessage[] = [
      { role: 'system', content: TEMPLATE_DESIGNER_SYSTEM_PROMPT },
      { role: 'system', content: formatUiIntentPlanForPrompt(intentPlan) },
      { role: 'system', content: formatUiDesignSkillContextForPrompt(skillContext) },
      { role: 'user', content: input.prompt },
    ];

    const loop = new QueryLoop({
      provider: this.options.provider,
      model: this.options.model,
      tools,
      toolSpecs: new Map([[GENERATE_TEMPLATE_TOOL.name, { name: GENERATE_TEMPLATE_TOOL.name }]]),
      maxIterations: this.options.maxIterations ?? 10,
      isCancelled: () => this.options.isCancelled?.() ?? false,
      onTextDelta: (text) => emit('text', text),
      onToolEvent: (event) => {
        emit(event.status === 'error' ? 'tool_error' : event.status === 'start' ? 'tool_start' : 'tool_done', event);
      },
      onError: (message) => {
        terminalError = message;
        emit('error', message);
      },
      toolExecutor: async (name, args) => {
        const call = recorder.toolCall(name, args);
        if (name !== GENERATE_TEMPLATE_TOOL.name) {
          call.error = `Unknown tool: ${name}`;
          return { output: JSON.stringify({ error: call.error }) };
        }
        const inputValue = args as unknown as TemplateToolInput;
        const visualAssets = normalizeVisualAssets(inputValue.visualAssets);
        const candidateDocument = asThemeLayoutDocument(
          applyVisualAssetsToLayoutDocument(
            inputValue.layoutDocument,
            visualAssets,
          ),
        );
        const validation = validateThemeLayoutDocument(candidateDocument, {
          componentTemplates: inputValue.componentTemplates,
        });
        if (!validation.valid) {
          call.error = 'Generated template failed validation';
          call.result = { validation };
          return { output: JSON.stringify({ error: call.error, validation }) };
        }
        finalDocument = {
          ...candidateDocument,
          componentTemplates: inputValue.componentTemplates,
          cssVars: inputValue.cssVars,
          cssAnimations: inputValue.cssAnimations,
        };
        if (this.options.persist) {
          if (!this.options.templateStore) {
            call.error = 'persist=true requires a templateStore';
            return { output: JSON.stringify({ error: call.error }) };
          }
          const saved = await this.options.templateStore.saveGeneratedTemplate({
            ...inputValue,
            layoutDocument: candidateDocument as unknown as Record<string, unknown>,
            ...(visualAssets.length > 0 ? { visualAssets } : {}),
          });
          emit('template_saved', { ...saved, name: inputValue.name });
          call.result = { success: true, ...saved };
          return { output: JSON.stringify({ success: true, ...saved }) };
        }
        call.result = { success: true, dryRun: true };
        return { output: JSON.stringify({ success: true, dryRun: true }) };
      },
    });

    const loopResult = await loop.run(messages);
    if (loopResult.stopReason === 'error' && loopResult.error) {
      terminalError = loopResult.error;
    }
    emit('done');

    const validation = finalDocument
      ? validateThemeLayoutDocument(finalDocument)
      : {
          valid: false,
          errors: [{
            path: 'toolCalls',
            code: 'missing_generate_template',
            message: 'generate_template did not produce a final document',
            severity: 'error' as const,
          }],
          warnings: [],
          score: 0,
        };
    const semantic = evaluateSemanticAssertions(finalDocument, undefined, input.scenario?.expected);
    const unrelatedDiff = evaluateUnrelatedDiff(undefined, finalDocument, input.scenario?.expected);
    const render = finalDocument
      ? renderSmokeThemeLayoutDocument(finalDocument)
      : { passed: false, score: 0, errors: ['Missing final document'], visibleTextCount: 0 };
    const calledExpectedTool = recorder.toolCalls.some((call) => call.name === GENERATE_TEMPLATE_TOOL.name);
    const passed = !terminalError && calledExpectedTool && validation.valid && semantic.passed && unrelatedDiff.passed
      && render.passed;

    return {
      scenarioId: input.scenarioId ?? input.scenario?.id,
      mode: 'template_generation',
      prompt: input.prompt,
      status: passed ? 'passed' : terminalError ? 'errored' : 'failed',
      events: recorder.events,
      toolCalls: recorder.toolCalls,
      finalDocument,
      validation,
      semantic,
      unrelatedDiff,
      render,
      durationMs: Date.now() - startedAt,
      error: terminalError || undefined,
    };
  }
}
