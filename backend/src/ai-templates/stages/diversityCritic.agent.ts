import { Inject, Injectable, Logger } from '@nestjs/common';
import { STAGE_DIVERSITY_CRITIC_SYSTEM_PROMPT } from '@shared/agent/runtime';

import {
  AI_TEMPLATE_PIPELINE_PROVIDER,
  type AiTemplatePipelineProvider,
} from '../../ai/pipelineProvider.port';
import type {
  CriticVerdict,
  DesignerOutput,
  DiversityConflict,
  ExistingTemplateSummary,
  PipelineStageRecord,
  ReviseAction,
} from '../orchestrator/pipeline.types';
import { runStructuredStage } from '../orchestrator/runStage';
import { SUBMIT_DIVERSITY_VERDICT_TOOL } from '../tools/submitDiversityVerdict.tool';

const VALID_DIMENSIONS = new Set<DiversityConflict['dimension']>([
  'archetype',
  'heroMode',
  'componentTemplate',
  'color-hue',
  'signature',
  'structure',
]);

/**
 * PR-B.1: per-variant type guards for `ReviseAction`. Each entry says which
 * fields are required given the `type` discriminator. Anything missing or
 * wrong is dropped silently — malformed LLM output should not abort the
 * stage. Surviving actions are forwarded to the pipeline.
 */
const REVISE_ACTION_RULES: Record<ReviseAction['type'], readonly string[]> = {
  add_section: ['afterRegion', 'sectionKind'],
  replace_section: ['regionKey', 'newKind'],
  adjust_layout: ['regionKey', 'direction'],
  improve_contrast: ['regionKey', 'suggestion'],
};
const VALID_REVISE_TYPES = new Set<ReviseAction['type']>(
  Object.keys(REVISE_ACTION_RULES) as ReviseAction['type'][],
);
const VALID_REVISE_DIRECTIONS = new Set<
  NonNullable<Extract<ReviseAction, { direction: string }>['direction']>
>(['row', 'column']);

const ALL_ARCHETYPES = ['fresh', 'immersive', 'editorial', 'vibrant', 'dark-pro'] as const;
const ALL_HERO_MODES = [
  'date-strip',
  'function-grid',
  'cover-story',
  'metric-dashboard',
  'story-ring',
  'dual-column',
  'timer-banner',
  'search-filter',
] as const;

/**
 * Stage 2 — Diversity Critic
 *
 * 两层防御：
 *  1. 程序化硬规则（archetype/heroMode/componentTemplate 重复上限）— 免费、快
 *  2. LLM 语义检查（diversitySignature 语义雷同）— 只在硬规则通过时调用
 *
 * 任意一层触发冲突就 verdict=revise，把"明确的换什么"建议传回 Designer。
 */
@Injectable()
export class DiversityCriticAgent {
  private readonly logger = new Logger(DiversityCriticAgent.name);

  constructor(
    @Inject(AI_TEMPLATE_PIPELINE_PROVIDER)
    private readonly aiProvider: AiTemplatePipelineProvider,
  ) {}

  async run(
    candidate: DesignerOutput,
    existing: ExistingTemplateSummary[],
    attempt: number,
    ownerUserId?: string,
    signal?: AbortSignal,
  ): Promise<PipelineStageRecord<CriticVerdict>> {
    const start = Date.now();
    this.logger.debug(
      `critic attempt=${attempt} candidate=${candidate.templateId}` +
        ` existing=${existing.length}`,
    );

    const hardConflicts = this.findHardConflicts(candidate, existing);
    if (hardConflicts.length > 0) {
      const verdict: CriticVerdict = {
        verdict: 'revise',
        conflicts: hardConflicts,
        suggestion: this.buildSuggestion(candidate, existing),
      };
      return {
        attempt,
        durationMs: Date.now() - start,
        inputTokens: 0,
        outputTokens: 0,
        cacheHitTokens: 0,
        output: verdict,
      };
    }

    // 没有硬冲突，跑 LLM 语义检查
    if (existing.length === 0) {
      const verdict: CriticVerdict = { verdict: 'pass', conflicts: [] };
      return {
        attempt,
        durationMs: Date.now() - start,
        inputTokens: 0,
        outputTokens: 0,
        cacheHitTokens: 0,
        output: verdict,
      };
    }

    // Critic 语义检查是辅助审查，用 lite 快模型提速。
    const {
      provider,
      liteModel: model,
      apiKeyConfigured,
    } = this.aiProvider.getProviderForTemplatePipeline();
    if (!apiKeyConfigured) {
      // API key 未配置时退化为只看硬规则的判断。
      this.logger.warn('AI_API_KEY is not configured; Critic skips LLM semantic checks');
      return {
        attempt,
        durationMs: Date.now() - start,
        inputTokens: 0,
        outputTokens: 0,
        cacheHitTokens: 0,
        output: { verdict: 'pass', conflicts: [] },
      };
    }

    const userMessage = this.buildUserMessage(candidate, existing);
    const result = await runStructuredStage<CriticVerdict>({
      provider,
      model,
      systemPrompt: STAGE_DIVERSITY_CRITIC_SYSTEM_PROMPT,
      userMessage,
      tool: SUBMIT_DIVERSITY_VERDICT_TOOL,
      parse: (args) => this.parseVerdict(args),
      aiProvider: this.aiProvider,
      ownerUserId,
      cacheKey: 'pipeline-critic',
      signal,
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

  private findHardConflicts(
    candidate: DesignerOutput,
    existing: ExistingTemplateSummary[],
  ): DiversityConflict[] {
    const conflicts: DiversityConflict[] = [];
    const existingInCategory = existing.filter(
      (e) => e.displayCategory === candidate.displayCategory,
    );

    const archUsageCounts = ALL_ARCHETYPES.map(
      (arch) => existingInCategory.filter((e) => e.archetype === arch).length,
    );
    const minArchUsage = Math.min(...archUsageCounts);
    const sameArchetype = existingInCategory.filter((e) => e.archetype === candidate.archetype);
    if (sameArchetype.length >= Math.max(2, minArchUsage + 1)) {
      for (const e of sameArchetype) {
        conflicts.push({
          templateId: e.templateId,
          dimension: 'archetype',
          description:
            `同 archetype "${candidate.archetype}"` +
            ` 在 displayCategory "${candidate.displayCategory}"` +
            ` 下已有 ${sameArchetype.length} 个`,
        });
      }
    }

    const heroUsageCounts = ALL_HERO_MODES.map(
      (mode) => existingInCategory.filter((e) => e.heroMode === mode).length,
    );
    const minHeroUsage = Math.min(...heroUsageCounts);
    const sameHero = existingInCategory.filter((e) => e.heroMode === candidate.heroMode);
    if (sameHero.length >= Math.max(1, minHeroUsage + 1)) {
      for (const e of sameHero) {
        conflicts.push({
          templateId: e.templateId,
          dimension: 'heroMode',
          description:
            `同 heroMode "${candidate.heroMode}"` +
            ` 在 displayCategory "${candidate.displayCategory}"` +
            ` 下已被 ${e.templateId} 使用`,
        });
      }
    }

    const candidateAliases = new Set(candidate.componentTemplatesDraft.map((c) => c.alias));
    for (const e of existing) {
      for (const alias of e.componentTemplateAliases) {
        if (candidateAliases.has(alias)) {
          conflicts.push({
            templateId: e.templateId,
            dimension: 'componentTemplate',
            description: `componentTemplate alias "${alias}" 已被 ${e.templateId} 使用`,
          });
        }
      }
    }

    return conflicts;
  }

  private buildSuggestion(candidate: DesignerOutput, existing: ExistingTemplateSummary[]): string {
    const digest = existing.map((e) => `${e.templateId}(${e.archetype}/${e.heroMode})`).join(', ');
    return (
      `请换一个 archetype 或 heroMode；当前 displayCategory` +
      ` "${candidate.displayCategory}" 下已有: ${digest}`
    );
  }

  private buildUserMessage(candidate: DesignerOutput, existing: ExistingTemplateSummary[]): string {
    const candidateSummary = {
      templateId: candidate.templateId,
      archetype: candidate.archetype,
      variant: candidate.variant,
      heroMode: candidate.heroMode,
      displayCategory: candidate.displayCategory,
      diversitySignature: candidate.diversitySignature,
      componentTemplateAliases: candidate.componentTemplatesDraft.map((c) => c.alias),
      primaryHue: candidate.cssVars['--color-primary'] ?? '#000000',
    };
    // 检查候选 brief 是否可能产出与已有模板结构相似的骨架
    const structuralAlerts = existing
      .filter((e) => e.layoutSignature && candidate.diversitySignature)
      .map((e) => `  - ${e.templateId}: layout=${e.layoutSignature}`)
      .join('\n');
    return [
      '判断候选 brief 是否与已生成模板雷同。重点对比：',
      '1. diversitySignature 的语义相似度',
      '2. 已有模板的 layoutSignature（渲染树骨架），防止结构雷同',
      '只要语义雷同或骨架高度相似就 verdict=revise，并通过 suggestion 给出明确的换什么。',
      '',
      '候选：',
      '```json',
      JSON.stringify(candidateSummary, null, 2),
      '```',
      '',
      '已生成模板摘要（含结构指纹）：',
      '```json',
      JSON.stringify(existing, null, 2),
      '```',
      '',
      structuralAlerts ? '结构对比提示：已有模板的渲染树骨架：\n' + structuralAlerts : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private parseVerdict(args: Record<string, unknown>): CriticVerdict {
    const verdict = args.verdict;
    if (verdict !== 'pass' && verdict !== 'revise') {
      throw new Error(`Critic verdict 字段必须是 "pass" 或 "revise"`);
    }
    const conflictsRaw = Array.isArray(args.conflicts) ? args.conflicts : [];
    const conflicts: DiversityConflict[] = conflictsRaw.map((c, i) => {
      if (!c || typeof c !== 'object') {
        throw new Error(`Critic conflicts[${i}] 必须是对象`);
      }
      const item = c as Record<string, unknown>;
      const str = (key: string): string => (typeof item[key] === 'string' ? item[key] : '');
      const dim = str('dimension');
      if (!VALID_DIMENSIONS.has(dim as DiversityConflict['dimension'])) {
        throw new Error(`Critic conflicts[${i}].dimension "${dim}" 不在合法枚举内`);
      }
      return {
        templateId: str('templateId'),
        dimension: dim as DiversityConflict['dimension'],
        description: str('description'),
      };
    });
    const reviseActions = parseReviseActions(args.reviseActions, (msg) => this.logger.debug(msg));
    return {
      verdict,
      conflicts,
      suggestion: typeof args.suggestion === 'string' ? args.suggestion : undefined,
      ...(reviseActions.length > 0 ? { reviseActions } : {}),
    };
  }
}

/**
 * PR-B.1: validate each ReviseAction by its `type` discriminator. Malformed
 * entries are dropped (reported via `onDropped` for debug) so a single bad
 * row cannot break the whole verdict. Returns the surviving list in input
 * order. Empty input or all-malformed returns [].
 *
 * Exported for unit testing without instantiating the Nest-injected agent.
 */
export function parseReviseActions(
  raw: unknown,
  onDropped?: (message: string) => void,
): ReviseAction[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [];
  }
  const kept: ReviseAction[] = [];
  let dropped = 0;
  raw.forEach((entry) => {
    if (!entry || typeof entry !== 'object') {
      dropped += 1;
      return;
    }
    const item = entry as Record<string, unknown>;
    const type = item.type;
    if (typeof type !== 'string' || !VALID_REVISE_TYPES.has(type as ReviseAction['type'])) {
      dropped += 1;
      return;
    }
    const required = REVISE_ACTION_RULES[type as ReviseAction['type']];
    const fields: Record<string, string> = {};
    let valid = true;
    for (const field of required) {
      const v = item[field];
      if (typeof v !== 'string' || v.length === 0) {
        valid = false;
        break;
      }
      fields[field] = v;
    }
    if (!valid) {
      dropped += 1;
      return;
    }
    // Per-type semantic checks
    const direction = fields.direction as 'row' | 'column';
    if (type === 'adjust_layout' && !VALID_REVISE_DIRECTIONS.has(direction)) {
      dropped += 1;
      return;
    }
    const action = { type: type as ReviseAction['type'], ...fields } as ReviseAction;
    kept.push(action);
  });
  if (dropped > 0) {
    onDropped?.(`parseReviseActions: dropped ${dropped} malformed action(s) of ${raw.length}`);
  }
  return kept;
}
