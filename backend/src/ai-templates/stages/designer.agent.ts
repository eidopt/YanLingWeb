import { Inject, Injectable, Logger } from '@nestjs/common';
import { STAGE_DESIGNER_SYSTEM_PROMPT } from '@shared/agent/runtime';

import {
  AI_TEMPLATE_PIPELINE_PROVIDER,
  type AiTemplatePipelineProvider,
} from '../../ai/pipelineProvider.port';
import type {
  DesignerOutput,
  PipelineStageRecord,
  TemplateSeed,
} from '../orchestrator/pipeline.types';
import { runStructuredStage } from '../orchestrator/runStage';
import { SUBMIT_TEMPLATE_BRIEF_TOOL } from '../tools/submitTemplateBrief.tool';

const VALID_ARCHETYPES = new Set(['fresh', 'immersive', 'editorial', 'vibrant', 'dark-pro']);
const VALID_HERO_MODES = new Set([
  'date-strip',
  'function-grid',
  'cover-story',
  'metric-dashboard',
  'story-ring',
  'dual-column',
  'timer-banner',
  'search-filter',
]);
const VALID_PLATFORMS = new Set(['mini-program', 'mobile-app', 'web']);
const VALID_CHROMES = new Set(['wechat', 'app', 'none']);

/**
 * Stage 1 — Designer
 *
 * 把 TemplateSeed 扩展成完整设计 brief。通过 submit_template_brief 工具
 * 强制结构化输出。
 */
@Injectable()
export class DesignerAgent {
  private readonly logger = new Logger(DesignerAgent.name);

  constructor(
    @Inject(AI_TEMPLATE_PIPELINE_PROVIDER)
    private readonly aiProvider: AiTemplatePipelineProvider,
  ) {}

  async run(
    seed: TemplateSeed,
    reviseSuggestion: string | undefined,
    attempt: number,
  ): Promise<PipelineStageRecord<DesignerOutput>> {
    const start = Date.now();
    // Designer 出的 brief 是喂给 SchemaGen 的质量关键输入，**必须用 pro**：
    // 降级 lite 会让 brief 注水 → SchemaGen 反复生成不合法文档、耗尽迭代甚至失败
    // （实测「驴友」用 lite Designer 三次 attempt 全 schema-gen throw 失败）。
    // 只有纯审查 stage（Critic/Verifier）才安全降级到 lite。
    const { provider, model, apiKeyConfigured } = this.aiProvider.getProviderForTemplatePipeline();
    if (!apiKeyConfigured) {
      throw new Error('AI_API_KEY 未配置 — Designer 无法运行');
    }

    const userMessage = this.buildUserMessage(seed, reviseSuggestion);
    this.logger.debug(`designer attempt=${attempt} seed=${seed.prompt}`);

    const result = await runStructuredStage<DesignerOutput>({
      provider,
      model,
      systemPrompt: STAGE_DESIGNER_SYSTEM_PROMPT,
      userMessage,
      tool: SUBMIT_TEMPLATE_BRIEF_TOOL,
      parse: (args) => this.parseBrief(args),
    });

    return {
      attempt,
      durationMs: Date.now() - start,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      cacheHitTokens: result.usage.cacheHitTokens,
      output: result.output,
    };
  }

  private buildUserMessage(seed: TemplateSeed, revise: string | undefined): string {
    const payload: Record<string, unknown> = {
      seed: {
        prompt: seed.prompt,
        platform: seed.platform ?? null,
        displayCategory: seed.displayCategory ?? null,
        forceArchetype: seed.forceArchetype ?? null,
        forceHeroMode: seed.forceHeroMode ?? null,
      },
    };
    if (revise) {
      payload.previousAttemptFailed = true;
      payload.reviseSuggestion = revise;
    }
    return [
      '请根据下方 seed 输出一份完整的设计 brief，通过 submit_template_brief' + ' 工具一次提交。',
      revise
        ? '注意：上一次产出被审查拒绝，请按 reviseSuggestion 调整 archetype' + ' 或 heroMode。'
        : '',
      '',
      '```json',
      JSON.stringify(payload, null, 2),
      '```',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private parseBrief(args: Record<string, unknown>): DesignerOutput {
    const requireString = (key: string): string => {
      const v = args[key];
      if (typeof v !== 'string' || v.length === 0) {
        throw new Error(`Designer brief 缺少字段 "${key}"`);
      }
      return v;
    };
    const requireEnum = <T extends string>(key: string, valid: Set<string>): T => {
      const v = requireString(key);
      if (!valid.has(v)) {
        throw new Error(`Designer brief 字段 "${key}" 值 "${v}" 不在合法枚举内`);
      }
      return v as T;
    };
    const requireArray = (key: string): unknown[] => {
      const v = args[key];
      if (!Array.isArray(v)) {
        throw new Error(`Designer brief 字段 "${key}" 必须是数组`);
      }
      return v;
    };
    const requireObject = (key: string): Record<string, unknown> => {
      const v = args[key];
      if (!v || typeof v !== 'object' || Array.isArray(v)) {
        throw new Error(`Designer brief 字段 "${key}" 必须是对象`);
      }
      return v as Record<string, unknown>;
    };

    return {
      templateId: requireString('templateId'),
      name: requireString('name'),
      tagline: requireString('tagline'),
      archetype: requireEnum('archetype', VALID_ARCHETYPES),
      heroMode: requireEnum('heroMode', VALID_HERO_MODES),
      platform: requireEnum('platform', VALID_PLATFORMS),
      chrome: requireEnum('chrome', VALID_CHROMES),
      scenario: requireString('scenario'),
      audience: requireString('audience'),
      pages: requireArray('pages').map((p, i) => {
        if (!p || typeof p !== 'object') {
          throw new Error(`Designer brief pages[${i}] 必须是对象`);
        }
        const page = p as Record<string, unknown>;
        const str = (key: string): string => (typeof page[key] === 'string' ? page[key] : '');
        return {
          id: str('id'),
          name: str('name'),
          kind: str('kind'),
          userTask: str('userTask'),
          primaryAction: typeof page.primaryAction === 'string' ? page.primaryAction : undefined,
        };
      }),
      cssVars: Object.fromEntries(
        Object.entries(requireObject('cssVars')).map(([k, v]) => [k, String(v)]),
      ),
      componentTemplatesDraft: requireArray('componentTemplatesDraft').map((c, i) => {
        if (!c || typeof c !== 'object') {
          throw new Error(`Designer brief componentTemplatesDraft[${i}] 必须是对象`);
        }
        const item = c as Record<string, unknown>;
        const str = (key: string): string => (typeof item[key] === 'string' ? item[key] : '');
        return { alias: str('alias'), role: str('role'), description: str('description') };
      }),
      bottomTabs: requireArray('bottomTabs').map((t, i) => {
        if (!t || typeof t !== 'object') {
          throw new Error(`Designer brief bottomTabs[${i}] 必须是对象`);
        }
        const tab = t as Record<string, unknown>;
        const str = (key: string): string => (typeof tab[key] === 'string' ? tab[key] : '');
        return { targetPageId: str('targetPageId'), label: str('label') };
      }),
      category: requireString('category'),
      displayCategory: requireString('displayCategory'),
      whyArchetype: requireString('whyArchetype'),
      whyHeroMode: requireString('whyHeroMode'),
      diversitySignature: requireString('diversitySignature'),
    };
  }
}
