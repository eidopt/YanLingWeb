import { Inject, Injectable, Logger } from '@nestjs/common';
import { CORE_COMPONENTS, STAGE_SCHEMA_GENERATOR_SYSTEM_PROMPT } from '@shared/agent/runtime';
import { migrateThemeLayoutDocument } from '@shared/theme-layout/migrations';

import {
  AI_TEMPLATE_PIPELINE_PROVIDER,
  type AiTemplatePipelineProvider,
} from '../../ai/pipelineProvider.port';
import { GENERATE_TEMPLATE_TOOL } from '../../ai/tools/generateTemplate.tool';
import { validateGeneratedTemplateLayout } from '../../templates/templateLayoutValidation';
import type {
  DesignerOutput,
  PipelineStageRecord,
  SchemaOutput,
} from '../orchestrator/pipeline.types';
import { runStructuredStage } from '../orchestrator/runStage';
import { autoBizComponents, preValidateAndFix } from './preValidateFix';

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

  /**
   * @deprecated — Use preValidateAndFix() from ./preValidateFix instead.
   * Kept temporarily for backward compatibility with any direct callers.
   */
  private dedupeNodeIds(document: { pages?: unknown }): void {
    const seen = new Set<string>();
    const renameDup = (node: unknown): void => {
      if (!node || typeof node !== 'object') {
        return;
      }
      if (Array.isArray(node)) {
        node.forEach(renameDup);
        return;
      }
      const n = node as { id?: string; children?: unknown[] };
      if (typeof n.id === 'string' && n.id.length > 0) {
        if (seen.has(n.id)) {
          let suffix = 2;
          let candidate = `${n.id}-${suffix}`;
          while (seen.has(candidate)) {
            suffix += 1;
            candidate = `${n.id}-${suffix}`;
          }
          n.id = candidate;
        }
        seen.add(n.id);
      }
      (n.children ?? []).forEach(renameDup);
    };
    const pages = Array.isArray(document.pages) ? document.pages : [];
    pages.forEach((page) => renameDup((page as { layout?: unknown }).layout));
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

    // 始终采用带中文 label 的规范 core 组件目录（CORE_COMPONENTS），避免 LLM 漏写
    // prop.label 触发导入端 requireLocalizedPropLabels 校验失败；同时保留 LLM 声明的
    // biz-* 自定义组件描述符（layout 里用到的 alias 必须在 components 目录中声明）。
    const llmComponents = isNonEmptyArray(rawDoc.components)
      ? rawDoc.components
      : Array.isArray(args.components)
        ? (args.components as unknown[])
        : [];
    const customComponents = llmComponents.filter((c): c is Record<string, unknown> => {
      if (!c || typeof c !== 'object') {
        return false;
      }
      const alias = (c as { alias?: unknown }).alias;
      return typeof alias === 'string' && !alias.startsWith('core.');
    });

    // componentTemplates 来源（与下方 documentInput 保持一致）。
    const resolvedComponentTemplates = isNonEmptyObject(rawDoc.componentTemplates)
      ? rawDoc.componentTemplates
      : isNonEmptyObject(args.componentTemplates)
        ? args.componentTemplates
        : {};

    // Auto-complete biz-* component descriptors BEFORE building `documentInput`
    // so that `migrateThemeLayoutDocument` sees the final components catalog.
    // `preValidateAndFix` (called below) is idempotent and will not re-add
    // descriptors that are already in `components` because
    // `autoBizComponents` skips aliases that are already in
    // `declaredAliases`. The remaining chain steps it runs (dedupe,
    // removeUnknownProps, fixDangerousUrls) still need to execute, so we
    // keep the call.
    const preDocForBiz = {
      components: customComponents,
      componentTemplates: resolvedComponentTemplates,
    };
    autoBizComponents(preDocForBiz, resolvedComponentTemplates);
    const autoAdded = preDocForBiz.components;
    const components = [...CORE_COMPONENTS, ...autoAdded];

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
      components,
      componentTemplates: resolvedComponentTemplates,
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

    // Pre-validate fix chain: dedupe IDs, auto-biz (idempotent no-op now
    // because we pre-populated `components` above), remove unknown props,
    // fix dangerous URLs. Runs BEFORE formal validation to mechanically fix
    // common LLM output issues, reducing unnecessary LLM retries.
    const preFixResult = preValidateAndFix(
      document as unknown as Record<string, unknown>,
      resolvedComponentTemplates,
    );
    document = preFixResult.document as unknown as typeof document;
    if (preFixResult.fixes.length > 0) {
      this.logger.debug(`preValidateAndFix applied: ${preFixResult.fixes.join('; ')}`);
    }

    // 用与导入端 (prepareTemplateLayoutForPersistence, requireGeneratedTemplateQuality)
    // 完全一致的成品质量门槛校验 —— 严格 unknownProps + 图片 URL / 本地化 / 中文文案
    // + render smoke。这样生成时就拦下导入会拒绝的文档，错误回喂给 LLM 在本 stage
    // 内重试修正，避免「生成成功却导入失败」。
    // 用 document 自己的 componentTemplates（与上面 autoBiz 补的 components 同源），
    // 而非顶层 args.componentTemplates —— 否则两者不一致会漏补、误报 missing_component_descriptor。
    const check = validateGeneratedTemplateLayout(document, document.componentTemplates);
    if (!check.valid) {
      const errMessages = check.errors
        .slice(0, 5)
        .map((e) => `[${e.code}] ${e.path}: ${e.message}`)
        .join('; ');
      throw new Error(`layoutDocument 校验失败 (${check.errors.length} errors)：${errMessages}`);
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
