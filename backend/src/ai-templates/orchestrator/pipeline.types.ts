import type { ThemeLayoutDocument } from '@shared/agent/contracts/agent';
import type { VerifierLens } from '@shared/agent/runtime';

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

export type TemplateArchetype = 'fresh' | 'immersive' | 'editorial' | 'vibrant' | 'dark-pro';

/** 每个 archetype 的子变体，用于在骨架层面制造多样性 */
export type ArchetypeVariant =
  | 'standard'
  | 'compact'
  | 'spacious'
  | 'borderless'
  | 'waterfall'
  | 'overlap'
  | 'gradient-mask'
  | 'float-card'
  | 'split-diagonal'
  | 'layered-stack';

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
  variant: ArchetypeVariant;
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
  bottomTabs: DesignerBottomTab[];
  category: string;
  displayCategory: string;
  whyArchetype: string;
  whyHeroMode: string;
  diversitySignature: string;
}

export interface DesignerBottomTab {
  targetPageId: string;
  label: string;
}

export interface DiversityConflict {
  templateId: string;
  dimension: 'archetype' | 'heroMode' | 'componentTemplate' | 'color-hue' | 'signature' | 'structure';
  description: string;
}

export type ReviseAction =
  | { type: 'add_section'; afterRegion: string; sectionKind: string }
  | { type: 'replace_section'; regionKey: string; newKind: string }
  | { type: 'adjust_layout'; regionKey: string; direction: 'row' | 'column' }
  | { type: 'improve_contrast'; regionKey: string; suggestion: string };

export interface CriticVerdict {
  verdict: 'pass' | 'revise';
  conflicts: DiversityConflict[];
  suggestion?: string;
  /** Structured revise actions for targeted fixes (optional, used by SchemaGen). */
  reviseActions?: ReviseAction[];
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

export interface PipelineExternalResult {
  templateId: string;
  document: ThemeLayoutDocument;
  brief: DesignerOutput;
  totalDurationMs: number;
}

export type PipelineFailure = Error & {
  lastSchema?: PipelineResult;
};

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
  /** 渲染树结构指纹：screen(panel(text,button),tabs) 形式 */
  layoutSignature: string;
}
