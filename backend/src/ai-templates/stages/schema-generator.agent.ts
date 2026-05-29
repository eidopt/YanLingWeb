import { Inject, Injectable, Logger } from '@nestjs/common';
import { validateThemeLayoutDocument } from '@shared/agent/contracts/validation';
import { CORE_COMPONENTS, STAGE_SCHEMA_GENERATOR_SYSTEM_PROMPT } from '@shared/agent/runtime';
import { migrateThemeLayoutDocument } from '@shared/theme-layout/migrations';

import {
  AI_TEMPLATE_PIPELINE_PROVIDER,
  type AiTemplatePipelineProvider,
} from '../../ai/pipeline-provider.port';
import { GENERATE_TEMPLATE_TOOL } from '../../ai/tools/generate-template.tool';
import type {
  DesignerOutput,
  PipelineStageRecord,
  SchemaOutput,
} from '../orchestrator/pipeline.types';
import { runStructuredStage } from '../orchestrator/run-stage';

/**
 * Stage 3 — Schema Generator
 *
 * 把 brief 翻译成完整 ThemeLayoutDocument。复用已成熟的 GENERATE_TEMPLATE_TOOL。
 *
 * 校验链路：LLM 输出 → parseSchema 提取 layoutDocument → validateThemeLayoutDocument
 * → 失败的话抛错，stage 内部会被 runStructuredStage 捕获并回报给 LLM 重试。
 */
@Injectable()
export class SchemaGeneratorAgent {
  private readonly logger = new Logger(SchemaGeneratorAgent.name);

  constructor(
    @Inject(AI_TEMPLATE_PIPELINE_PROVIDER)
    private readonly aiProvider: AiTemplatePipelineProvider,
  ) {}

  async run(brief: DesignerOutput, attempt: number): Promise<PipelineStageRecord<SchemaOutput>> {
    const start = Date.now();
    const { provider, model, apiKeyConfigured } = this.aiProvider.getProviderForTemplatePipeline();
    if (!apiKeyConfigured) {
      throw new Error('AI_API_KEY 未配置 — SchemaGenerator 无法运行');
    }

    this.logger.debug(`schema generator attempt=${attempt} brief=${brief.templateId}`);

    const result = await runStructuredStage<SchemaOutput>({
      provider,
      model,
      systemPrompt: STAGE_SCHEMA_GENERATOR_SYSTEM_PROMPT,
      userMessage: this.buildUserMessage(brief),
      tool: GENERATE_TEMPLATE_TOOL,
      parse: (args) => this.parseAndValidate(args, brief),
      maxIterations: 8,
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

  private buildUserMessage(brief: DesignerOutput): string {
    return [
      '已通过审查的设计 brief 如下。请严格按 brief 输出完整 ThemeLayoutDocument，',
      '通过 generate_template 工具一次提交。',
      '所有 archetype / heroMode / cssVars 决策不可更改。',
      '',
      '```json',
      JSON.stringify(brief, null, 2),
      '```',
    ].join('\n');
  }

  private parseAndValidate(args: Record<string, unknown>, brief: DesignerOutput): SchemaOutput {
    const templateIdRaw = args.templateId;
    if (typeof templateIdRaw !== 'string' || templateIdRaw.length === 0) {
      throw new Error('generate_template 输入缺少 templateId');
    }
    const layoutDocumentRaw = args.layoutDocument;
    if (!layoutDocumentRaw || typeof layoutDocumentRaw !== 'object') {
      throw new Error('generate_template 输入缺少 layoutDocument');
    }

    // generate_template 工具在顶层声明 templateId / name / description /
    // componentTemplates / visualAssets / cssVars / cssAnimations 等，但
    // ThemeLayoutDocument 持久化和 Verifier 读 schema 都期望这些字段也在
    // layoutDocument 内部。合并策略：layoutDocument 内已有则保留，否则用顶层值填。
    const rawDoc = layoutDocumentRaw as Record<string, unknown>;
    const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
    const isNonEmptyObject = (v: unknown): v is Record<string, unknown> =>
      !!v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length > 0;
    const isNonEmptyArray = (v: unknown): v is unknown[] => Array.isArray(v) && v.length > 0;
    const documentInput = {
      ...rawDoc,
      version: typeof rawDoc.version === 'number' ? rawDoc.version : 1,
      themeId: isNonEmptyString(rawDoc.themeId) ? rawDoc.themeId : templateIdRaw,
      themeName: isNonEmptyString(rawDoc.themeName)
        ? rawDoc.themeName
        : isNonEmptyString(args.name)
          ? args.name
          : templateIdRaw,
      description: isNonEmptyString(rawDoc.description)
        ? rawDoc.description
        : isNonEmptyString(args.description)
          ? args.description
          : brief.tagline,
      components: isNonEmptyArray(rawDoc.components)
        ? rawDoc.components
        : Array.isArray(args.components) && args.components.length > 0
          ? args.components
          : CORE_COMPONENTS,
      componentTemplates: isNonEmptyObject(rawDoc.componentTemplates)
        ? rawDoc.componentTemplates
        : isNonEmptyObject(args.componentTemplates)
          ? args.componentTemplates
          : {},
      visualAssets: isNonEmptyArray(rawDoc.visualAssets)
        ? rawDoc.visualAssets
        : isNonEmptyArray(args.visualAssets)
          ? args.visualAssets
          : [],
      cssVars: isNonEmptyObject(rawDoc.cssVars)
        ? rawDoc.cssVars
        : isNonEmptyObject(args.cssVars)
          ? args.cssVars
          : brief.cssVars,
      cssAnimations: isNonEmptyObject(rawDoc.cssAnimations)
        ? rawDoc.cssAnimations
        : isNonEmptyObject(args.cssAnimations)
          ? args.cssAnimations
          : undefined,
    };
    let document = migrateThemeLayoutDocument(documentInput);

    // document.layout 必须就是 pages[defaultPageId].layout —— 如果 LLM 给的不一致，
    // 强制对齐。同时如果 defaultPageId 不存在，回退到第一个 page。
    const pages = Array.isArray(document.pages) ? document.pages : [];
    const fallbackPage = pages.length > 0 ? pages[0] : undefined;
    const defaultPage = pages.find((p) => p.id === document.defaultPageId) ?? fallbackPage;
    if (defaultPage) {
      document = {
        ...document,
        layout: defaultPage.layout,
        defaultPageId: defaultPage.id,
      };
    }

    // failOnUnknownProps=false 容忍 GENERATE_TEMPLATE_TOOL 工具描述里写了
    // 但 validator descriptor 未列出的 props（如 core.screen 的 statusTime /
    // headerActionLabel）。这些 prop 会变成 warning 而不是 error。
    const validation = validateThemeLayoutDocument(document, {
      failOnUnknownProps: false,
      componentTemplates: args.componentTemplates as Record<string, unknown> | undefined,
    });
    if (!validation.valid) {
      const errMessages = validation.errors
        .slice(0, 5)
        .map((e) => `[${e.code}] ${e.path}: ${e.message}`)
        .join('; ');
      throw new Error(
        `layoutDocument 校验失败 (${validation.errors.length} errors)：${errMessages}`,
      );
    }

    if (templateIdRaw !== brief.templateId) {
      this.logger.warn(
        `LLM 返回的 templateId "${templateIdRaw}" 与 brief 中的 "${brief.templateId}" 不一致，以 LLM 输出为准`,
      );
    }

    return {
      templateId: templateIdRaw,
      document,
      rawToolInput: args,
    };
  }
}
