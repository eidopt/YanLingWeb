import type { ThemeLayoutDocument } from '../ui/layout/types';
import type { ThemeRuntime } from '../ui/renderer';
import type { VisualAsset } from '@shared/theme-layout/visualAssets';

export interface TemplateAgentConfig {
  profileGenerated: Record<string, unknown> | null;
  profileOverride: Record<string, unknown> | null;
  effectiveProfile: Record<string, unknown> | null;
  assets: Record<string, unknown> | null;
  permissions: Record<string, unknown> | null;
  evaluation: Record<string, unknown> | null;
}

export interface ThemeSpec {
  id: string;
  recordId?: string;
  ownerUserId?: string | null;
  sourceTemplateId?: string | null;
  isPublic?: boolean;
  name: string;
  tagline: string;
  description: string;
  accent: string;
  category: string;
  categoryLabel?: string;
  displayCategory?: string;
  displayCategoryLabel?: string;
  platformCategories?: string[];
  platformCategoryLabels?: Record<string, string>;
  functionalCategories?: string[];
  functionalCategoryLabels?: Record<string, string>;
  traits: string[];
  tags: string[];
  createdAt?: string;
  updatedAt?: string;
  layoutDocument: ThemeLayoutDocument;
  runtime: ThemeRuntime;
  visualAssets?: VisualAsset[];
  agentConfig?: TemplateAgentConfig;
}
