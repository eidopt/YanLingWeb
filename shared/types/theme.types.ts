// Shared theme types — used by both frontend (Next.js) and backend (NestJS)
import type { VisualAsset } from '../theme-layout/visualAssets';

export interface ThemeDto {
  id: string;
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
  cssVars: Record<string, string>;
  visualAssets?: VisualAsset[];
  componentTemplates: Record<string, unknown>;
  layoutDocument: Record<string, unknown>;
  agentConfig?: {
    profileGenerated: Record<string, unknown> | null;
    profileOverride: Record<string, unknown> | null;
    effectiveProfile: Record<string, unknown> | null;
    assets: Record<string, unknown> | null;
    permissions: Record<string, unknown> | null;
    evaluation: Record<string, unknown> | null;
  };
  createdAt: string;
  updatedAt: string;
}

export interface CreateThemeDto {
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
  cssVars: Record<string, string>;
  visualAssets?: VisualAsset[];
  componentTemplates: Record<string, unknown>;
  layoutDocument: Record<string, unknown>;
}

export type UpdateThemeDto = Partial<CreateThemeDto>;

export interface ThemeListResponse {
  data: ThemeDto[];
  total: number;
}
