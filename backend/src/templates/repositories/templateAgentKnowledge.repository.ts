export const TEMPLATE_AGENT_KNOWLEDGE_REPOSITORY = Symbol('TEMPLATE_AGENT_KNOWLEDGE_REPOSITORY');

export interface TemplateAgentKnowledgeRecords {
  profileGenerated: Record<string, unknown> | null;
  profileOverride: Record<string, unknown> | null;
  assets: Record<string, unknown> | null;
  permissions: Record<string, unknown> | null;
  evaluation: Record<string, unknown> | null;
}

export interface TemplateAgentKnowledgeRepository {
  findForTemplate(
    templateId: string,
    fallbackTemplateId?: string,
  ): Promise<TemplateAgentKnowledgeRecords>;
}
