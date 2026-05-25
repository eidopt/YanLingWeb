// Shared theme types — used by both frontend (Next.js) and backend (NestJS)

export interface ThemeDto {
  id: string;
  name: string;
  tagline: string;
  description: string;
  accent: string;
  category: string;
  platformCategories?: string[];
  functionalCategories?: string[];
  traits: string[];
  cssVars: Record<string, string>;
  componentTemplates: Record<string, unknown>;
  layoutDocument: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateThemeDto {
  name: string;
  tagline: string;
  description: string;
  accent: string;
  category: string;
  platformCategories?: string[];
  functionalCategories?: string[];
  traits: string[];
  cssVars: Record<string, string>;
  componentTemplates: Record<string, unknown>;
  layoutDocument: Record<string, unknown>;
}

export type UpdateThemeDto = Partial<CreateThemeDto>;

export interface ThemeListResponse {
  data: ThemeDto[];
  total: number;
}
