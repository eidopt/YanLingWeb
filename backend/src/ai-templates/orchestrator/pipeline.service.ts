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
  PipelineFailure,
  PipelineGenerateOptions,
  PipelineResult,
  PipelineStageEventCallback,
  PipelineStageEventPayload,
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

  async generate(
    seed: TemplateSeed,
    existing: ExistingTemplateSummary[],
    options?: PipelineGenerateOptions,
  ): Promise<PipelineResult> {
    const pipelineStart = Date.now();
    const stages: AccumulatedStages = {
      designer: [],
      critic: [],
      schema: [],
      verifier: [],
    };
    const emitStage = (phase: 'start' | 'end', payload: PipelineStageEventPayload): void => {
      this.safeEmitStage(options?.onStageEvent, phase, payload);
    };
    const ownerUserId = options?.ownerUserId;

    let reviseSuggestion: string | undefined;
    let lastError: string | undefined;

    for (let attempt = 1; attempt <= MAX_PIPELINE_ATTEMPTS; attempt++) {
      this.logger.log(`pipeline attempt ${attempt}/${MAX_PIPELINE_ATTEMPTS} for "${seed.prompt}"`);

      // Stage 1: Designer
      emitStage('start', { stage: 'designer', attempt });
      let designerRecord: PipelineStageRecord<DesignerOutput>;
      const designerStart = Date.now();
      try {
        designerRecord = await this.designer.run(seed, reviseSuggestion, attempt, ownerUserId);
      } catch (err) {
        emitStage('end', {
          stage: 'designer',
          attempt,
          durationMs: Date.now() - designerStart,
          status: 'failed',
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
      emitStage('end', {
        stage: 'designer',
        attempt,
        durationMs: designerRecord.durationMs,
        status: 'ok',
      });
      stages.designer.push(designerRecord);
      const brief = designerRecord.output;

      // Stage 2: Diversity Critic
      emitStage('start', { stage: 'critic', attempt });
      let criticRecord: PipelineStageRecord<CriticVerdict>;
      const criticStart = Date.now();
      try {
        criticRecord = await this.critic.run(brief, existing, attempt, ownerUserId);
      } catch (err) {
        emitStage('end', {
          stage: 'critic',
          attempt,
          durationMs: Date.now() - criticStart,
          status: 'failed',
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
      stages.critic.push(criticRecord);
      if (criticRecord.output.verdict === 'revise') {
        reviseSuggestion = this.buildCriticReviseSuggestion(criticRecord.output);
        lastError = `critic revise: ${reviseSuggestion}`;
        // diversity 是「尽力而为」：前几次 attempt 打回 Designer 重试以优化多样性；
        // 但**最后一次 attempt 即使仍 revise 也放行到 Schema** —— 不让 diversity 把
        // attempts 吃光、导致整条生成彻底失败（产出一个稍欠差异化的模板远胜于没有产出）。
        if (attempt < MAX_PIPELINE_ATTEMPTS) {
          emitStage('end', {
            stage: 'critic',
            attempt,
            durationMs: criticRecord.durationMs,
            status: 'failed',
            error: reviseSuggestion,
          });
          this.logger.warn(`attempt ${attempt} critic revise — retrying`);
          continue;
        }
        this.logger.warn(`attempt ${attempt} critic revise — 末次放行（diversity best-effort）`);
      }
      emitStage('end', {
        stage: 'critic',
        attempt,
        durationMs: criticRecord.durationMs,
        status: 'ok',
      });

      // Stage 3: Schema Generation
      // Pipeline-level retries: re-run schemaGenerator with the same brief,
      // without going back to Designer. Only fall back to Designer when all
      // pipeline retries are exhausted.
      emitStage('start', { stage: 'schema', attempt });
      const schemaStart = Date.now();
      let schemaRecord: PipelineStageRecord<SchemaOutput> | undefined;
      const SCHEMA_STAGE_RETRIES = 3;
      const SCHEMA_PIPELINE_RETRIES = 2;
      let lastSchemaError: string | undefined;

      for (let pipelineRetry = 0; pipelineRetry <= SCHEMA_PIPELINE_RETRIES; pipelineRetry++) {
        for (let stageRetry = 0; stageRetry < SCHEMA_STAGE_RETRIES; stageRetry++) {
          try {
            schemaRecord = await this.schemaGenerator.run(brief, attempt, ownerUserId);
            break;
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            lastSchemaError = msg;
            this.logger.warn(
              [
                `attempt ${attempt} schemaGen pipeline-retry ${pipelineRetry}`,
                `stage-retry ${stageRetry + 1}/${SCHEMA_STAGE_RETRIES}: ${msg}`,
              ].join(' '),
            );
          }
        }
        if (schemaRecord) {
          break;
        }
        const retryAction =
          pipelineRetry < SCHEMA_PIPELINE_RETRIES
            ? 'retrying with same brief'
            : 'falling back to Designer';
        this.logger.warn(
          `attempt ${attempt} schemaGen pipeline-retry` +
            ` ${pipelineRetry + 1}/${SCHEMA_PIPELINE_RETRIES + 1}` +
            ` exhausted inner retries — ${retryAction}`,
        );
      }

      if (!schemaRecord) {
        emitStage('end', {
          stage: 'schema',
          attempt,
          durationMs: Date.now() - schemaStart,
          status: 'failed',
          error: lastSchemaError,
        });
        reviseSuggestion = `Stage 3 schema generation failed: ${lastSchemaError}`;
        lastError = `schema gen throw: ${lastSchemaError}`;
        continue;
      }
      emitStage('end', {
        stage: 'schema',
        attempt,
        durationMs: schemaRecord.durationMs,
        status: 'ok',
      });
      stages.schema.push(schemaRecord);

      // Stage 4: Verifier (3 lenses concurrently inside)
      emitStage('start', { stage: 'verifier', attempt });
      const verifierStart = Date.now();
      const schemaOutput = schemaRecord.output;
      let verifierRecord: PipelineStageRecord<VerifierVerdict[]>;
      try {
        verifierRecord = await this.verifier.run(
          brief,
          schemaOutput,
          existing,
          attempt,
          ownerUserId,
        );
      } catch (err) {
        emitStage('end', {
          stage: 'verifier',
          attempt,
          durationMs: Date.now() - verifierStart,
          status: 'failed',
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
      stages.verifier.push(verifierRecord);

      const failedLenses = verifierRecord.output.filter((v) => !v.pass);
      if (failedLenses.length === 0) {
        emitStage('end', {
          stage: 'verifier',
          attempt,
          durationMs: verifierRecord.durationMs,
          status: 'ok',
        });
        return {
          templateId: brief.templateId,
          document: schemaOutput.document,
          brief,
          stages,
          totalDurationMs: Date.now() - pipelineStart,
          totalAttempts: attempt,
        };
      }

      this.logVerifierFailures(attempt, failedLenses);

      // 末次 diversity best-effort：如果前 2 轮已尝试差异化，第 3 轮仅 diversity 未通过
      // （spec-compliance 与 business-fidelity 均已通过），放行输出合格模板，不浪费整条链路。
      if (attempt === MAX_PIPELINE_ATTEMPTS && this.isDiversityOnlyFailure(failedLenses)) {
        this.logger.warn(
          `attempt ${attempt} verifier 仅 diversity 未通过 — 末次放行（diversity best-effort）`,
        );
        emitStage('end', {
          stage: 'verifier',
          attempt,
          durationMs: verifierRecord.durationMs,
          status: 'ok',
        });
        return {
          templateId: brief.templateId,
          document: schemaOutput.document,
          brief,
          stages,
          totalDurationMs: Date.now() - pipelineStart,
          totalAttempts: attempt,
        };
      }

      // 分级修复：如果是 spec-compliance / business-fidelity 问题，先尝试对现有 schema 做 1 次
      // 局部修补并复检，避免每次都直接杀回 Stage 1 从 Designer 重头重跑。
      const repairedSchemaRecord = await this.schemaGenerator.repairFromVerifierFeedback(
        brief,
        schemaOutput,
        failedLenses,
        attempt,
        ownerUserId,
      );
      if (repairedSchemaRecord) {
        stages.schema.push(repairedSchemaRecord);
        const reverifyRecord = await this.verifier.run(
          brief,
          repairedSchemaRecord.output,
          existing,
          attempt,
          ownerUserId,
        );
        stages.verifier.push(reverifyRecord);
        const remainingFailed = reverifyRecord.output.filter((v) => !v.pass);
        if (
          remainingFailed.length === 0 ||
          (attempt === MAX_PIPELINE_ATTEMPTS && this.isDiversityOnlyFailure(remainingFailed))
        ) {
          if (remainingFailed.length > 0) {
            this.logger.warn(
              `attempt ${attempt} verifier 修复后仅 diversity 未通过 — 末次放行（diversity best-effort）`,
            );
          } else {
            this.logger.log(`attempt ${attempt} verifier 局部修复成功，跳过回退 Stage 1`);
          }
          emitStage('end', {
            stage: 'verifier',
            attempt,
            durationMs: verifierRecord.durationMs + repairedSchemaRecord.durationMs,
            status: 'ok',
          });
          return {
            templateId: brief.templateId,
            document: repairedSchemaRecord.output.document,
            brief,
            stages,
            totalDurationMs: Date.now() - pipelineStart,
            totalAttempts: attempt,
          };
        }
        this.logVerifierFailures(attempt, remainingFailed, 'after-repair');
        reviseSuggestion = this.formatVerifierSummary(remainingFailed);
      } else {
        reviseSuggestion = this.formatVerifierSummary(failedLenses);
      }

      emitStage('end', {
        stage: 'verifier',
        attempt,
        durationMs: verifierRecord.durationMs,
        status: 'failed',
        error: reviseSuggestion,
      });
      lastError = `verifier fail: ${reviseSuggestion}`;
      this.logger.warn(`attempt ${attempt} verifier fail — retrying (${reviseSuggestion})`);
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

  /**
   * PR-B.1: build a `reviseSuggestion` for the next Designer attempt from a
   * Critic revise verdict. If the verdict carries structured `reviseActions`,
   * they are appended as a typed bullet list so the LLM can act on them
   * directly. The original `suggestion` text is kept as the lead line for
   * human readability.
   *
   * Kept as a static (non-instance) method so it can be unit-tested without
   * wiring up the full Nest module.
   */
  static buildCriticReviseSuggestion(verdict: CriticVerdict): string {
    const base =
      verdict.suggestion ??
      `多样性冲突 ${verdict.conflicts.length} 个，换一个 archetype 或 heroMode`;
    if (!verdict.reviseActions || verdict.reviseActions.length === 0) {
      return base;
    }
    const actionLines = verdict.reviseActions.map((action) => {
      switch (action.type) {
        case 'add_section':
          return `- [add_section] 在 ${action.afterRegion} 之后新增 section: ${action.sectionKind}`;
        case 'replace_section':
          return `- [replace_section] 将 ${action.regionKey} 替换为 ${action.newKind}`;
        case 'adjust_layout':
          return `- [adjust_layout] 将 ${action.regionKey} 调整为 ${action.direction}`;
        case 'improve_contrast':
          return `- [improve_contrast] ${action.regionKey}: ${action.suggestion}`;
      }
    });
    return `${base}\n结构化修订动作:\n${actionLines.join('\n')}`;
  }

  private safeEmitStage(
    callback: PipelineStageEventCallback | undefined,
    phase: 'start' | 'end',
    payload: PipelineStageEventPayload,
  ): void {
    if (!callback) {
      return;
    }
    try {
      callback(phase, payload);
    } catch (err) {
      this.logger.warn(`onStageEvent threw: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private buildCriticReviseSuggestion(verdict: CriticVerdict): string {
    return TemplatePipelineService.buildCriticReviseSuggestion(verdict);
  }

  private isDiversityOnlyFailure(failedLenses: readonly VerifierVerdict[]): boolean {
    return failedLenses.length > 0 && failedLenses.every((v) => v.lens === 'diversity');
  }

  private formatVerifierSummary(failedLenses: readonly VerifierVerdict[]): string {
    return failedLenses.map((v) => `[${v.lens}] ${v.summary}`).join(' | ');
  }

  private logVerifierFailures(
    attempt: number,
    failedLenses: readonly VerifierVerdict[],
    phaseLabel = 'initial',
  ): void {
    for (const verdict of failedLenses) {
      const failureDetails = verdict.failures
        .slice(0, 5)
        .map(
          (f) =>
            `${f.rule || 'rule'}(${f.severity})${f.location ? `@${f.location}` : ''}: ${
              f.description
            }`,
        )
        .join('; ');
      this.logger.warn(
        `attempt ${attempt} verifier[${phaseLabel}] [${verdict.lens}] fail: ${verdict.summary}` +
          (failureDetails ? ` | ${failureDetails}` : ''),
      );
    }
  }
}
