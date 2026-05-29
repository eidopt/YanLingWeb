import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ThemeLayoutDocument } from '@shared/agent/contracts/agent';
import {
  type AgentTemplateKnowledgeContext,
  applyTemplateProfileOverride,
  buildTemplateProfile,
  isTemplateProfile,
  type TemplateProfile,
} from '@shared/agent/runtime';

import {
  TEMPLATE_AGENT_KNOWLEDGE_REPOSITORY,
  type TemplateAgentKnowledgeRepository,
} from './repositories/template-agent-knowledge.repository';
import {
  TEMPLATE_READ_REPOSITORY,
  type TemplateReadRepository,
} from './repositories/template-read.repository';

export const TEMPLATE_AGENT_KNOWLEDGE_SERVICE = 'TEMPLATE_AGENT_KNOWLEDGE_SERVICE';

export interface LoadTemplateAgentKnowledgeInput {
  ownerUserId: string;
  document: ThemeLayoutDocument;
  templateId?: string;
}

export interface TemplateAgentKnowledgeServicePort {
  loadForEditor(input: LoadTemplateAgentKnowledgeInput): Promise<AgentTemplateKnowledgeContext>;
}

@Injectable()
export class TemplateAgentKnowledgeService implements TemplateAgentKnowledgeServicePort {
  private readonly logger = new Logger(TemplateAgentKnowledgeService.name);

  constructor(
    @Inject(TEMPLATE_READ_REPOSITORY)
    private readonly templates: TemplateReadRepository,
    @Inject(TEMPLATE_AGENT_KNOWLEDGE_REPOSITORY)
    private readonly knowledge: TemplateAgentKnowledgeRepository,
  ) {}

  async loadForEditor(
    input: LoadTemplateAgentKnowledgeInput,
  ): Promise<AgentTemplateKnowledgeContext> {
    const requestedTemplateId = input.templateId ?? input.document.themeId;
    const template = requestedTemplateId
      ? await this.templates.findAccessibleIdentity(input.ownerUserId, requestedTemplateId)
      : null;
    const templateId = template?.templateId;
    const fallbackTemplateId = template?.sourceTemplateId ?? undefined;
    const records = templateId
      ? await this.knowledge.findForTemplate(templateId, fallbackTemplateId)
      : {
          profileGenerated: null,
          profileOverride: null,
          assets: null,
          permissions: null,
          evaluation: null,
        };

    const generatedProfile: TemplateProfile | Record<string, unknown> =
      records.profileGenerated ?? buildTemplateProfile(input.document);
    const profileOverrideRecord = records.profileOverride;
    let effectiveProfile: TemplateProfile | Record<string, unknown> = generatedProfile;
    if (profileOverrideRecord) {
      if (isTemplateProfile(generatedProfile)) {
        try {
          effectiveProfile = applyTemplateProfileOverride(generatedProfile, profileOverrideRecord);
        } catch (error) {
          this.logger.warn(
            `[TemplateAgentConfig] Failed to apply profile override for ${templateId}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      } else {
        this.logger.warn(
          [
            `[TemplateAgentConfig] Ignoring profile override for ${templateId}:`,
            'generated profile is malformed.',
          ].join(' '),
        );
      }
    }

    return {
      profileGenerated: generatedProfile,
      profileOverride: profileOverrideRecord,
      effectiveProfile,
      assets: records.assets,
      permissions: records.permissions,
      evaluation: records.evaluation,
    };
  }
}
