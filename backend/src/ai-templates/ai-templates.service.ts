import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Template } from '../templates/entities/template.entity';
import { TemplatePipelineService } from './orchestrator/pipeline.service';
import type {
  ExistingTemplateSummary,
  HeroMode,
  PipelineResult,
  TemplateArchetype,
  TemplateSeed,
} from './orchestrator/pipeline.types';

const ARCHETYPE_TRAIT_PREFIX = 'archetype:';
const HERO_TRAIT_PREFIX = 'hero:';
const SIGNATURE_TRAIT_PREFIX = 'sig:';

const VALID_ARCHETYPES: readonly TemplateArchetype[] = [
  'fresh', 'immersive', 'editorial', 'vibrant', 'dark-pro',
];
const VALID_HERO_MODES: readonly HeroMode[] = [
  'date-strip', 'function-grid', 'cover-story', 'metric-dashboard',
  'story-ring', 'dual-column', 'timer-banner', 'search-filter',
];

/**
 * AI Templates Service
 *
 * 对外业务层。负责：
 *  - 收集"已有模板摘要"作为 Diversity Critic 的输入
 *  - 调用 Pipeline 跑 4-stage 流水线
 *  - Round 2 起：把生成结果持久化到 Template 表
 *
 * 当前 Round 1：只做流水线调用 + summary 提取，不做持久化。
 */
@Injectable()
export class AiTemplatesService {
  private readonly logger = new Logger(AiTemplatesService.name);

  constructor(
    @InjectRepository(Template)
    private readonly templateRepo: Repository<Template>,
    private readonly pipeline: TemplatePipelineService,
  ) {}

  async generate(seed: TemplateSeed): Promise<PipelineResult> {
    const existing = await this.collectExistingSummaries(seed);
    this.logger.log(
      `generating template "${seed.prompt}" with ${existing.length} existing baselines`,
    );
    return this.pipeline.generate(seed, existing);
  }

  /**
   * 提取已有模板的多样性摘要。
   *
   * archetype / heroMode / diversitySignature 通过 traits 数组中的
   * 前缀化条目持久化（如 "archetype:fresh"、"hero:cover-story"、"sig:..."）。
   * 已有模板没有这些 trait 时，对应字段降级为 "unknown"。
   */
  private async collectExistingSummaries(
    seed: TemplateSeed,
  ): Promise<ExistingTemplateSummary[]> {
    // 仅取公共模板 + 同 displayCategory（如果种子已指定）作为对比基线，
    // 控制 critic prompt 长度。
    const where: Record<string, unknown> = { isPublic: true };
    if (seed.displayCategory) {
      where.displayCategory = seed.displayCategory;
    }
    const templates = await this.templateRepo.find({
      where,
      take: 50,
      order: { updatedAt: 'DESC' },
    });

    return templates.map((t) => this.toSummary(t));
  }

  private toSummary(template: Template): ExistingTemplateSummary {
    const traits = template.traits;
    const archetype = this.extractTrait<TemplateArchetype>(
      traits, ARCHETYPE_TRAIT_PREFIX, VALID_ARCHETYPES, 'fresh',
    );
    const heroMode = this.extractTrait<HeroMode>(
      traits, HERO_TRAIT_PREFIX, VALID_HERO_MODES, 'function-grid',
    );
    const signature = traits
      .find((t) => t.startsWith(SIGNATURE_TRAIT_PREFIX))
      ?.slice(SIGNATURE_TRAIT_PREFIX.length) ?? `legacy-${template.templateId}`;

    const componentTemplateAliases = Object.keys(template.componentTemplates);
    const primaryHue = template.cssVars['--color-primary'] ?? template.accent;

    return {
      templateId: template.templateId,
      name: template.name,
      archetype,
      heroMode,
      displayCategory: template.displayCategory,
      diversitySignature: signature,
      componentTemplateAliases,
      primaryHue,
    };
  }

  private extractTrait<T extends string>(
    traits: string[],
    prefix: string,
    valid: readonly T[],
    fallback: T,
  ): T {
    const found = traits
      .find((t) => t.startsWith(prefix))
      ?.slice(prefix.length);
    return (valid as readonly string[]).includes(found ?? '') ? (found as T) : fallback;
  }
}
