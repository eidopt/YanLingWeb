import type { Template } from '../entities/template.entity';

export const TEMPLATE_PERSISTENCE_REPOSITORY = Symbol('TEMPLATE_PERSISTENCE_REPOSITORY');

export interface TemplateListFilters {
  category?: string;
  displayCategory?: string;
  functionalCategory?: string;
  platformCategory?: string;
  search?: string;
}

export interface TemplateAgentConfigInput {
  profileGenerated?: Record<string, unknown>;
  profileOverride?: Record<string, unknown>;
  assets?: Record<string, unknown>;
  permissions?: Record<string, unknown>;
  evaluation?: Record<string, unknown>;
}

export interface TemplateAgentConfigRecords {
  profileGenerated: Record<string, unknown> | null;
  profileOverride: Record<string, unknown> | null;
  assets: Record<string, unknown> | null;
  permissions: Record<string, unknown> | null;
  evaluation: Record<string, unknown> | null;
}

export interface TemplatePersistenceStore {
  saveTemplate(template: Template): Promise<Template>;
  findByTemplateId(templateId: string): Promise<Template | null>;
  existsByTemplateId(templateId: string): Promise<boolean>;
  findAgentConfig(templateId: string): Promise<TemplateAgentConfigRecords>;
  generatedProfileExists(templateId: string): Promise<boolean>;
  upsertAgentConfig(templateId: string, input: TemplateAgentConfigInput): Promise<void>;
}

export interface TemplatePersistenceRepository extends TemplatePersistenceStore {
  createTemplate(input: Partial<Template>): Template;
  upsertTemplates(templates: Template[]): Promise<void>;
  findMarketplace(filters: TemplateListFilters): Promise<Template[]>;
  findOwned(ownerUserId: string, filters: TemplateListFilters): Promise<Template[]>;
  findRecentOwned(ownerUserId: string, limit: number): Promise<Template[]>;
  findPublicByTemplateId(templateId: string): Promise<Template | null>;
  findOwnedByTemplateId(ownerUserId: string, templateId: string): Promise<Template | null>;
  findAccessibleByTemplateId(ownerUserId: string, templateId: string): Promise<Template | null>;
  findByTemplateId(templateId: string): Promise<Template | null>;
  existsByTemplateId(templateId: string): Promise<boolean>;
  findAllTemplates(): Promise<Template[]>;
  findExistingGeneratedProfileTemplateIds(): Promise<string[]>;
  findAllUserIds(): Promise<string[]>;
  findPublicTemplateIds(): Promise<string[]>;
  findOwnerlessTemplates(): Promise<Template[]>;
  runInTransaction<T>(work: (store: TemplatePersistenceStore) => Promise<T>): Promise<T>;
}
