import { Injectable, Logger } from '@nestjs/common';

import { DesignerAgent } from '../stages/designer.agent';
import { DiversityCriticAgent } from '../stages/diversityCritic.agent';
import { SchemaGeneratorAgent } from '../stages/schemaGenerator.agent';
import { VerifierAgent } from '../stages/verifier.agent';
import type {
  CriticVerdict,
  DesignerOutput,
  ExistingTemplateSummary,
  PipelineExternalResult,
  PipelineResult,
  PipelineStageRecord,
  SchemaOutput,
  TemplateSeed,
  VerifierVerdict,
} from './pipeline.types';

const MAX_PIPELINE_ATTEMPTS = 3;

interface AccumulatedStages {
  designer: PipelineStageRecord<DesignerOutput>[];
  critic: PipelineStageRecord<CriticVerdict>[];
  schema: PipelineStageRecord<SchemaOutput>[];
  verifier: PipelineStageRecord<VerifierVerdict[]>[];
}

type PipelineFailure = Error & {
  lastSchema?: PipelineResult;
};

/**
 * 4-Stage 模板生成编排器
 *
 *  Stage 1: Designer       — TemplateSeed → DesignerOutput (设计 brief)
 *  Stage 2: Critic         — brief + 已有摘要 → 通过 / 打回（带建议）
 *  Stage 3: Schema Gen     — brief → ThemeLayoutDocument
 *  Stage 4: Verifier (×3)  — schema + brief → 3 个独立审查 verdict
 *
 * 回滚策略：Critic 或任意 Verifier lens 判 fail，整条流水线回 Stage 1，
 * 最多 3 次。Designer 在重试时会收到上一轮的 reviseSuggestion，
 * 避免重复出同样的 brief。
 */
@Injectable()
export class TemplatePipelineService {
  private readonly logger = new Logger(TemplatePipelineService.name);

  constructor(
    private readonly designer: DesignerAgent,
    private readonly critic: DiversityCriticAgent,
    private readonly schemaGenerator: SchemaGeneratorAgent,
    private readonly verifier: VerifierAgent,
  ) {}

  async generate(seed: TemplateSeed, existing: ExistingTemplateSummary[]): Promise<PipelineResult> {
    const pipelineStart = Date.now();
    const stages: AccumulatedStages = {
      designer: [],
      critic: [],
      schema: [],
      verifier: [],
    };

    let reviseSuggestion: string | undefined;
    let lastError: string | undefined;

    for (let attempt = 1; attempt <= MAX_PIPELINE_ATTEMPTS; attempt++) {
      this.logger.log(`pipeline attempt ${attempt}/${MAX_PIPELINE_ATTEMPTS} for "${seed.prompt}"`);

      // Stage 1: Designer
      const designerRecord = await this.designer.run(seed, reviseSuggestion, attempt);
      stages.designer.push(designerRecord);
      const brief = designerRecord.output;

      // Stage 2: Diversity Critic
      const criticRecord = await this.critic.run(brief, existing, attempt);
      stages.critic.push(criticRecord);
      if (criticRecord.output.verdict === 'revise') {
        reviseSuggestion =
          criticRecord.output.suggestion ??
          `多样性冲突 ${criticRecord.output.conflicts.length} 个，换一个 archetype 或 heroMode`;
        lastError = `critic revise: ${reviseSuggestion}`;
        // diversity 是「尽力而为」：前几次 attempt 打回 Designer 重试以优化多样性；
        // 但**最后一次 attempt 即使仍 revise 也放行到 Schema** —— 不让 diversity 把
        // attempts 吃光、导致整条生成彻底失败（产出一个稍欠差异化的模板远胜于没有产出）。
        if (attempt < MAX_PIPELINE_ATTEMPTS) {
          this.logger.warn(`attempt ${attempt} critic revise — retrying`);
          continue;
        }
        this.logger.warn(`attempt ${attempt} critic revise — 末次放行（diversity best-effort）`);
      }

      // Stage 3: Schema Generation (with independent stage-level retries)
      let schemaRecord;
      let schemaGenSucceeded = false;
      const SCHEMA_STAGE_RETRIES = 3;
      for (let stageRetry = 0; stageRetry < SCHEMA_STAGE_RETRIES; stageRetry++) {
        try {
          schemaRecord = await this.schemaGenerator.run(brief, attempt);
          schemaGenSucceeded = true;
          break;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(
            `attempt ${attempt} schema gen stage-retry ${stageRetry + 1}/${SCHEMA_STAGE_RETRIES}: ${msg}`,
          );
          if (stageRetry === SCHEMA_STAGE_RETRIES - 1) {
            reviseSuggestion = `Stage 3 schema generation failed: ${msg}`;
            lastError = `schema gen throw: ${msg}`;
          }
        }
      }
      if (!schemaGenSucceeded) {
        this.logger.warn(
          `attempt ${attempt} schema gen exhausted stage retries — falling back to Designer`,
        );
        continue;
      }
      stages.schema.push(schemaRecord!);

      // Stage 4: Verifier (3 lenses concurrently inside)
      const verifierRecord = await this.verifier.run(brief, schemaRecord.output, existing, attempt);
      stages.verifier.push(verifierRecord);

      const failedLenses = verifierRecord.output.filter((v) => !v.pass);
      if (failedLenses.length === 0) {
        return {
          templateId: brief.templateId,
          document: schemaRecord.output.document,
          brief,
          stages,
          totalDurationMs: Date.now() - pipelineStart,
          totalAttempts: attempt,
        };
      }

      reviseSuggestion = failedLenses.map((v) => `[${v.lens}] ${v.summary}`).join(' | ');
      lastError = `verifier fail: ${reviseSuggestion}`;
      this.logger.warn(`attempt ${attempt} verifier fail — retrying`);
    }

    const issue = lastError ?? 'unknown';
    const failure = new Error(
      `Template pipeline exhausted ${MAX_PIPELINE_ATTEMPTS} attempts. Last issue: ${issue}`,
    );
    // 把最后一次 schema attempt 附加到 error 上，让上层 CLI 落盘调试。
    const lastSchema = stages.schema.at(-1);
    const lastDesigner = stages.designer.at(-1);
    if (lastSchema && lastDesigner) {
      (failure as PipelineFailure).lastSchema = {
        templateId: lastSchema.output.templateId,
        document: lastSchema.output.document,
        brief: lastDesigner.output,
        stages,
        totalDurationMs: Date.now() - pipelineStart,
        totalAttempts: MAX_PIPELINE_ATTEMPTS,
      };
    }
    throw failure;
  }

  async generateExternal(
    seed: TemplateSeed,
    existing: ExistingTemplateSummary[],
  ): Promise<PipelineExternalResult> {
    const result = await this.generate(seed, existing);
    return this.toExternalResult(result);
  }

  private toExternalResult(result: PipelineResult): PipelineExternalResult {
    return {
      templateId: result.templateId,
      document: result.document,
      brief: result.brief,
      totalDurationMs: result.totalDurationMs,
    };
  }
}
