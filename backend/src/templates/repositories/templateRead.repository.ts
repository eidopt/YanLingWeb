import type { ThemeLayoutDocument } from '@shared/agent/contracts/agent';

export const TEMPLATE_READ_REPOSITORY = 'TEMPLATE_READ_REPOSITORY';

export interface TemplateSearchRecord {
  templateId: string;
  name: string;
  tagline: string;
  description: string;
  category: string;
  displayCategory?: string;
  accent: string;
  traits: string[];
  tags: string[];
}

export interface TemplateDiversitySummaryRecord {
  templateId: string;
  name: string;
  displayCategory: string;
  traits: string[];
  componentTemplates: Record<string, unknown>;
  cssVars: Record<string, string>;
  accent: string;
  /** 用于计算结构指纹 */
  layoutDocument: ThemeLayoutDocument | null;
}

export interface TemplatePublishSnapshot {
  templateId: string;
  name: string;
  description: string;
  accent: string;
  category: string;
  cssVars: Record<string, string>;
  cssAnimations: Record<string, string> | null;
  componentTemplates: Record<string, unknown>;
  layoutDocument: ThemeLayoutDocument;
}

export interface TemplateAccessibleIdentity {
  templateId: string;
  sourceTemplateId: string | null;
}

export interface TemplateReadRepository {
  searchPublicTemplates(input: {
    keywords: string[];
    categories: string[];
    limit: number;
  }): Promise<TemplateSearchRecord[]>;

  findDiversitySummaries(input: {
    displayCategory?: string;
    limit: number;
  }): Promise<TemplateDiversitySummaryRecord[]>;

  findOwnedPublishSnapshot(
    ownerUserId: string,
    templateId: string,
  ): Promise<TemplatePublishSnapshot | null>;

  findAccessibleIdentity(
    ownerUserId: string,
    templateId: string,
  ): Promise<TemplateAccessibleIdentity | null>;
}
