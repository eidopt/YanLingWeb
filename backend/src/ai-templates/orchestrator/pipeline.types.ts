import type { VerifierLens } from '@shared/agent/prompts/templates';
import type { ThemeLayoutDocument } from '@shared/agent/types';

/**
 * 用户/批量入口提交的种子需求。
 * 这是流水线唯一的非结构化输入；Stage 1 会把它扩展成完整 brief。
 */
export interface TemplateSeed {
  /** 业务关键词 / 行业 / 用户用一句话能写出的需求 */
  prompt: string;
  /** 期望平台（不指定则 Designer 自选） */
  platform?: 'mini-program' | 'mobile-app' | 'web';
  /** 期望 displayCategory（不指定则 Designer 自选） */
  displayCategory?: string;
  /** 强制使用某 archetype（一般留空让 Designer + Critic 决定） */
  forceArchetype?: TemplateArchetype;
  /** 强制使用某 heroMode（一般留空） */
  forceHeroMode?: HeroMode;
}

export type TemplateArchetype =
  | 'fresh'
  | 'immersive'
  | 'editorial'
  | 'vibrant'
  | 'dark-pro';

export type HeroMode =
  | 'date-strip'
  | 'function-grid'
  | 'cover-story'
  | 'metric-dashboard'
  | 'story-ring'
  | 'dual-column'
  | 'timer-banner'
  | 'search-filter';

export interface DesignerOutput {
  templateId: string;
  name: string;
  tagline: string;
  archetype: TemplateArchetype;
  heroMode: HeroMode;
  platform: 'mini-program' | 'mobile-app' | 'web';
  chrome: 'wechat' | 'app' | 'none';
  scenario: string;
  audience: string;
  pages: {
    id: string;
    name: string;
    kind: string;
    userTask: string;
    primaryAction?: string;
  }[];
  cssVars: Record<string, string>;
  componentTemplatesDraft: {
    alias: string;
    role: string;
    description: string;
  }[];
  bottomTabs: { targetPageId: string; label: string; }[];
  category: string;
  displayCategory: string;
  whyArchetype: string;
  whyHeroMode: string;
  diversitySignature: string;
}

export interface DiversityConflict {
  templateId: string;
  dimension: 'archetype' | 'heroMode' | 'componentTemplate' | 'color-hue' | 'signature';
  description: string;
}

export interface CriticVerdict {
  verdict: 'pass' | 'revise';
  conflicts: DiversityConflict[];
  suggestion?: string;
}

export interface SchemaOutput {
  templateId: string;
  document: ThemeLayoutDocument;
  /** generate_template 工具返回的原始结构化输入（用于持久化） */
  rawToolInput: Record<string, unknown>;
}

export interface VerifierFailure {
  rule: string;
  severity: 'error' | 'warning';
  description: string;
  location?: string;
}

export interface VerifierVerdict {
  lens: VerifierLens;
  pass: boolean;
  failures: VerifierFailure[];
  summary: string;
}

export interface PipelineStageRecord<T> {
  attempt: number;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  cacheHitTokens: number;
  output: T;
}

export interface PipelineResult {
  templateId: string;
  document: ThemeLayoutDocument;
  brief: DesignerOutput;
  stages: {
    designer: PipelineStageRecord<DesignerOutput>[];
    critic: PipelineStageRecord<CriticVerdict>[];
    schema: PipelineStageRecord<SchemaOutput>[];
    verifier: PipelineStageRecord<VerifierVerdict[]>[];
  };
  totalDurationMs: number;
  totalAttempts: number;
}

/**
 * 已生成模板的摘要 — 用于 Stage 2 / Stage 4(diversity) 的对比。
 * 保持轻量：只放真正用于对比的字段，避免污染下游 prompt。
 */
export interface ExistingTemplateSummary {
  templateId: string;
  name: string;
  archetype: TemplateArchetype;
  heroMode: HeroMode;
  displayCategory: string;
  diversitySignature: string;
  componentTemplateAliases: string[];
  primaryHue: string;
}
