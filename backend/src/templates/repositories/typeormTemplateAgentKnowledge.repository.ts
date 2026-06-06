import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { TemplateAgentPermissions } from '../entities/templateAgentPermissions.entity';
import { TemplateAssetManifest } from '../entities/templateAssetManifest.entity';
import { TemplateEvaluationSpec } from '../entities/templateEvaluationSpec.entity';
import { TemplateProfileGenerated } from '../entities/templateProfileGenerated.entity';
import { TemplateProfileOverrideEntity } from '../entities/templateProfileOverride.entity';
import type {
  TemplateAgentKnowledgeRecords,
  TemplateAgentKnowledgeRepository,
} from './templateAgentKnowledge.repository';

interface TemplateAgentRecordIdentity {
  templateId: string;
}

interface TemplateAgentRecordFindOptions {
  where: TemplateAgentRecordIdentity;
}

interface TemplateAgentRecordRepository<T extends TemplateAgentRecordIdentity> {
  findOne(options: TemplateAgentRecordFindOptions): Promise<T | null>;
}

@Injectable()
export class TypeOrmTemplateAgentKnowledgeRepository implements TemplateAgentKnowledgeRepository {
  constructor(
    @InjectRepository(TemplateProfileGenerated)
    private readonly profileGeneratedRepo: Repository<TemplateProfileGenerated>,
    @InjectRepository(TemplateProfileOverrideEntity)
    private readonly profileOverrideRepo: Repository<TemplateProfileOverrideEntity>,
    @InjectRepository(TemplateAssetManifest)
    private readonly assetManifestRepo: Repository<TemplateAssetManifest>,
    @InjectRepository(TemplateAgentPermissions)
    private readonly agentPermissionsRepo: Repository<TemplateAgentPermissions>,
    @InjectRepository(TemplateEvaluationSpec)
    private readonly evaluationSpecRepo: Repository<TemplateEvaluationSpec>,
  ) {}

  async findForTemplate(
    templateId: string,
    fallbackTemplateId?: string,
  ): Promise<TemplateAgentKnowledgeRecords> {
    const [profileGenerated, profileOverride, assets, permissions, evaluation] = await Promise.all([
      this.findTemplateAgentRecord(this.profileGeneratedRepo, templateId, fallbackTemplateId),
      this.findTemplateAgentRecord(this.profileOverrideRepo, templateId, fallbackTemplateId),
      this.findTemplateAgentRecord(this.assetManifestRepo, templateId, fallbackTemplateId),
      this.findTemplateAgentRecord(this.agentPermissionsRepo, templateId, fallbackTemplateId),
      this.findTemplateAgentRecord(this.evaluationSpecRepo, templateId, fallbackTemplateId),
    ]);

    return {
      profileGenerated: profileGenerated?.profile ?? null,
      profileOverride: profileOverride?.override ?? null,
      assets: assets?.manifest ?? null,
      permissions: permissions?.permissions ?? null,
      evaluation: evaluation?.evaluation ?? null,
    };
  }

  private async findTemplateAgentRecord<T extends TemplateAgentRecordIdentity>(
    repo: TemplateAgentRecordRepository<T>,
    templateId: string,
    fallbackTemplateId?: string,
  ): Promise<T | null> {
    const current = await repo.findOne({ where: { templateId } });
    if (current || !fallbackTemplateId) {
      return current;
    }
    return repo.findOne({ where: { templateId: fallbackTemplateId } });
  }
}
