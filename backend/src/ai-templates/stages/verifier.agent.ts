import { Inject, Injectable, Logger } from '@nestjs/common';
import { buildVerifierSystemPrompt, type VerifierLens } from '@shared/agent/runtime';

import {
  AI_TEMPLATE_PIPELINE_PROVIDER,
  type AiTemplatePipelineProvider,
} from '../../ai/pipelineProvider.port';
import { validateGeneratedTemplateLayout } from '../../templates/templateLayoutValidation';
import type {
  DesignerOutput,
  ExistingTemplateSummary,
  PipelineStageRecord,
  SchemaOutput,
  VerifierFailure,
  VerifierVerdict,
} from '../orchestrator/pipeline.types';
import { runStructuredStage, type StageRunUsage } from '../orchestrator/runStage';
import { SUBMIT_VERIFIER_VERDICT_TOOL } from '../tools/submitVerifierVerdict.tool';

const LENSES: readonly VerifierLens[] = [
  'spec-compliance',
  'diversity',
  'business-fidelity',
] as const;

/**
 * Stage 4 — Verifier
 *
 * 3 个独立 lens 并发跑（Promise.all）。每个 lens 是独立 QueryLoop session，
 * 共享 sharedSpec 前缀 → 第二个 lens 起命中 OpenAI 缓存。
 *
 * spec-compliance lens 在 LLM 之前先跑程序化 validateThemeLayoutDocument。
 * 如果程序化校验有 error，直接 fail 不再调 LLM（节省 token 且更确定）。
 */
@Injectable()
export class VerifierAgent {
  private readonly logger = new Logger(VerifierAgent.name);

  constructor(
    @Inject(AI_TEMPLATE_PIPELINE_PROVIDER)
    private readonly aiProvider: AiTemplatePipelineProvider,
  ) {}

  async run(
    brief: DesignerOutput,
    schema: SchemaOutput,
    existing: ExistingTemplateSummary[],
    attempt: number,
    ownerUserId?: string,
    lenses: readonly VerifierLens[] = LENSES,
    signal?: AbortSignal,
  ): Promise<PipelineStageRecord<VerifierVerdict[]>> {
    const start = Date.now();
    this.logger.debug(`verifier attempt=${attempt} schema=${schema.templateId}`);

    // Verifier 3 lens 全保留（不砍审查），但用 lite 快模型提速；合法性仍由程序化校验把关。
    const {
      provider,
      liteModel: model,
      apiKeyConfigured,
    } = this.aiProvider.getProviderForTemplatePipeline();

    const usageTotal: StageRunUsage = { inputTokens: 0, outputTokens: 0, cacheHitTokens: 0 };

    const verdicts = await Promise.all(
      lenses.map(async (lens): Promise<VerifierVerdict> => {
        if (lens === 'spec-compliance') {
          const programmatic = this.runProgrammaticSpecCheck(schema);
          if (!programmatic.pass) {
            return programmatic;
          }
        }
        if (!apiKeyConfigured) {
          this.logger.warn(
            `AI_API_KEY is not configured; verifier lens=${lens} falls back to pass`,
          );
          return { lens, pass: true, failures: [], summary: '未启用 LLM 检查' };
        }
        const result = await runStructuredStage<VerifierVerdict>({
          provider,
          model,
          systemPrompt: buildVerifierSystemPrompt(lens),
          userMessage: this.buildUserMessage(lens, brief, schema, existing),
          tool: SUBMIT_VERIFIER_VERDICT_TOOL,
          parse: (args) => this.parseVerdict(args, lens),
          aiProvider: this.aiProvider,
          ownerUserId,
          cacheKey: 'pipeline-verifier',
          signal,
        });
        usageTotal.inputTokens += result.usage.inputTokens;
        usageTotal.outputTokens += result.usage.outputTokens;
        usageTotal.cacheHitTokens += result.usage.cacheHitTokens;
        return result.output;
      }),
    );

    return {
      attempt,
      durationMs: Date.now() - start,
      inputTokens: usageTotal.inputTokens,
      outputTokens: usageTotal.outputTokens,
      cacheHitTokens: usageTotal.cacheHitTokens,
      output: verdicts,
    };
  }

  /**
   * 程序化校验 — 比 LLM 更确定，零 token 成本。
   * 只生成 error 级失败；warning 仍交给 LLM lens 做语义判断。
   */
  private runProgrammaticSpecCheck(schema: SchemaOutput): VerifierVerdict {
    // 与导入端 + schema-gen 同一套成品质量门槛（严格 schema + render smoke），
    // 保证三处校验不漂移。
    const check = validateGeneratedTemplateLayout(
      schema.document,
      (schema.document as { componentTemplates?: unknown }).componentTemplates as
        | Record<string, unknown>
        | undefined,
    );
    if (check.valid) {
      return { lens: 'spec-compliance', pass: true, failures: [], summary: '程序化校验通过' };
    }
    const failures: VerifierFailure[] = check.errors.slice(0, 20).map((e) => ({
      rule: e.code,
      severity: 'error',
      description: e.message,
      location: e.path,
    }));
    return {
      lens: 'spec-compliance',
      pass: false,
      failures,
      summary: `程序化校验 ${check.errors.length} 个 error`,
    };
  }

  private buildUserMessage(
    lens: VerifierLens,
    brief: DesignerOutput,
    schema: SchemaOutput,
    existing: ExistingTemplateSummary[],
  ): string {
    const compactDoc = this.buildCompactDocumentForVerifier(schema.document);
    const documentSerialized = JSON.stringify(compactDoc);
    // 控制 prompt 长度 — verifier 不需要看完整 brief，只要关键字段
    const briefDigest = {
      templateId: brief.templateId,
      archetype: brief.archetype,
      heroMode: brief.heroMode,
      platform: brief.platform,
      scenario: brief.scenario,
      audience: brief.audience,
      diversitySignature: brief.diversitySignature,
      pages: brief.pages.map((p) => ({ id: p.id, kind: p.kind, userTask: p.userTask })),
    };

    const sharedPrefix = [
      '原始 brief 摘要：',
      '```json',
      JSON.stringify(briefDigest, null, 2),
      '```',
      '',
      '本次生成的 ThemeLayoutDocument 摘要：',
      '```json',
      documentSerialized,
      '```',
      '',
    ];

    if (lens === 'diversity') {
      return [
        ...sharedPrefix,
        '已生成模板摘要：',
        '```json',
        JSON.stringify(existing, null, 2),
        '```',
        '',
        '审查任务（diversity）：审查生成结果的视觉差异化。重点比对 hero 结构、componentTemplates、cssVars 主色相。',
      ].join('\n');
    }

    if (lens === 'business-fidelity') {
      return [
        ...sharedPrefix,
        '审查任务（business-fidelity）：审查页面是否真正服务于声称的业务场景（不是套壳）。',
      ].join('\n');
    }

    // spec-compliance —— 程序化已通过了 hard rules，这里跑语义 / 设计规则
    return [
      ...sharedPrefix,
      '审查任务（spec-compliance）：审查生成结果是否真正落地 archetype 和 heroMode，',
      '以及是否符合 sharedSpec 中的设计规则',
      '（archetype 视觉表达、heroMode 结构、跨页一致性、组件多样性等）。',
    ].join('\n');
  }

  /**
   * 精简送入 Verifier LLM 的文档负载：移除体积庞大的内置 CORE_COMPONENTS 静态目录、
   * 与 pages[0].layout 重复的顶层 layout、与 cssVars 重复的 style，以及冗长生图 prompt，
   * 可将 Verifier token 负载压降一半以上同时完整保留所有页面结构、props、交互与主题色。
   */
  private buildCompactDocumentForVerifier(
    document: SchemaOutput['document'],
  ): Record<string, unknown> {
    const raw = document as unknown as Record<string, unknown>;
    const rawComponents = Array.isArray(raw.components) ? raw.components : [];
    const customComponents = rawComponents.filter((comp) => {
      const alias =
        comp && typeof comp === 'object' ? (comp as { alias?: unknown }).alias : undefined;
      return typeof alias === 'string' && !alias.startsWith('core.');
    });
    const rawAssets: unknown[] = Array.isArray(raw.visualAssets)
      ? (raw.visualAssets as unknown[])
      : [];
    const compactAssets = rawAssets.map((asset): unknown => {
      if (!asset || typeof asset !== 'object') {
        return asset;
      }
      const item = asset as Record<string, unknown>;
      const promptStr = typeof item.prompt === 'string' ? item.prompt.trim() : '';
      return {
        id: item.id,
        nodeId: item.nodeId,
        pageId: item.pageId,
        role: item.role,
        provider: item.provider,
        status: item.status ?? 'pending',
        alt: item.alt,
        ...(promptStr ? { prompt: promptStr.slice(0, 48) } : {}),
      };
    });

    return {
      themeId: raw.themeId,
      themeName: raw.themeName,
      description: raw.description,
      defaultPageId: raw.defaultPageId,
      cssVars: raw.cssVars,
      ...(customComponents.length > 0 ? { customComponents } : {}),
      componentTemplates: raw.componentTemplates ?? {},
      visualAssets: compactAssets,
      pages: raw.pages,
    };
  }

  private parseVerdict(args: Record<string, unknown>, lens: VerifierLens): VerifierVerdict {
    if (typeof args.pass !== 'boolean') {
      throw new Error(`verifier verdict 字段 "pass" 必须是 boolean`);
    }
    if (typeof args.summary !== 'string') {
      throw new Error(`verifier verdict 字段 "summary" 必须是 string`);
    }
    const failuresRaw = Array.isArray(args.failures) ? args.failures : [];
    const failures: VerifierFailure[] = failuresRaw.map((f, i) => {
      if (!f || typeof f !== 'object') {
        throw new Error(`verifier failures[${i}] 必须是对象`);
      }
      const item = f as Record<string, unknown>;
      const severity = item.severity;
      if (severity !== 'error' && severity !== 'warning') {
        throw new Error(`verifier failures[${i}].severity 必须是 "error" 或 "warning"`);
      }
      const str = (key: string): string => (typeof item[key] === 'string' ? item[key] : '');
      return {
        rule: str('rule'),
        severity,
        description: str('description'),
        location: typeof item.location === 'string' ? item.location : undefined,
      };
    });
    const hasError = failures.some((f) => f.severity === 'error');
    const pass = failures.length > 0 && !hasError ? true : args.pass;
    return { lens, pass, failures, summary: args.summary };
  }
}
