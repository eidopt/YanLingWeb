import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository, SelectQueryBuilder } from 'typeorm';
import { IsNull } from 'typeorm';

import { User } from '../../users/entities/user.entity';
import { Template } from '../entities/template.entity';
import { TemplateAgentPermissions } from '../entities/templateAgentPermissions.entity';
import { TemplateAssetManifest } from '../entities/templateAssetManifest.entity';
import { TemplateEvaluationSpec } from '../entities/templateEvaluationSpec.entity';
import { TemplateProfileGenerated } from '../entities/templateProfileGenerated.entity';
import { TemplateProfileOverrideEntity } from '../entities/templateProfileOverride.entity';
import type {
  TemplateAgentConfigInput,
  TemplateAgentConfigRecords,
  TemplateListFilters,
  TemplatePersistenceRepository,
  TemplatePersistenceStore,
} from './templatePersistence.repository';

class TypeOrmTemplatePersistenceStore implements TemplatePersistenceStore {
  constructor(
    protected readonly templateRepo: Repository<Template>,
    protected readonly profileGeneratedRepo: Repository<TemplateProfileGenerated>,
    protected readonly profileOverrideRepo: Repository<TemplateProfileOverrideEntity>,
    protected readonly assetManifestRepo: Repository<TemplateAssetManifest>,
    protected readonly agentPermissionsRepo: Repository<TemplateAgentPermissions>,
    protected readonly evaluationSpecRepo: Repository<TemplateEvaluationSpec>,
  ) {}

  saveTemplate(template: Template): Promise<Template> {
    return this.templateRepo.save(template);
  }

  async findAgentConfig(templateId: string): Promise<TemplateAgentConfigRecords> {
    const [profileGenerated, profileOverride, assets, permissions, evaluation] = await Promise.all([
      this.profileGeneratedRepo.findOne({ where: { templateId } }),
      this.profileOverrideRepo.findOne({ where: { templateId } }),
      this.assetManifestRepo.findOne({ where: { templateId } }),
      this.agentPermissionsRepo.findOne({ where: { templateId } }),
      this.evaluationSpecRepo.findOne({ where: { templateId } }),
    ]);
    return {
      profileGenerated: profileGenerated?.profile ?? null,
      profileOverride: profileOverride?.override ?? null,
      assets: assets?.manifest ?? null,
      permissions: permissions?.permissions ?? null,
      evaluation: evaluation?.evaluation ?? null,
    };
  }

  generatedProfileExists(templateId: string): Promise<boolean> {
    return this.profileGeneratedRepo.exists({ where: { templateId } });
  }

  async upsertAgentConfig(templateId: string, input: TemplateAgentConfigInput): Promise<void> {
    const operations: Promise<unknown>[] = [];
    if (input.profileGenerated) {
      const profileVersion =
        typeof input.profileGenerated.profileVersion === 'string'
          ? input.profileGenerated.profileVersion
          : '1.0.0';
      const templateVersion =
        typeof input.profileGenerated.templateVersion === 'string'
          ? input.profileGenerated.templateVersion
          : '1.0.0';
      operations.push(
        this.saveProfileGenerated(templateId, {
          templateVersion,
          profileVersion,
          profile: this.withTemplateId(input.profileGenerated, templateId),
        }),
      );
    }
    if (input.profileOverride) {
      const profileVersion =
        typeof input.profileOverride.profileVersion === 'string'
          ? input.profileOverride.profileVersion
          : '1.0.0';
      operations.push(
        this.saveProfileOverride(templateId, {
          profileVersion,
          override: this.withTemplateId(input.profileOverride, templateId),
        }),
      );
    }
    if (input.assets) {
      operations.push(
        this.saveAssetManifest(templateId, {
          manifest: this.withTemplateId(input.assets, templateId),
        }),
      );
    }
    if (input.permissions) {
      operations.push(
        this.saveAgentPermissions(templateId, {
          permissions: this.withTemplateId(input.permissions, templateId),
        }),
      );
    }
    if (input.evaluation) {
      operations.push(
        this.saveEvaluationSpec(templateId, {
          evaluation: this.withTemplateId(input.evaluation, templateId),
        }),
      );
    }

    await Promise.all(operations);
  }

  private async saveProfileGenerated(
    templateId: string,
    patch: Pick<TemplateProfileGenerated, 'templateVersion' | 'profileVersion' | 'profile'>,
  ): Promise<void> {
    const existing = await this.profileGeneratedRepo.findOne({ where: { templateId } });
    await this.profileGeneratedRepo.save(
      Object.assign(existing ?? this.profileGeneratedRepo.create({ templateId }), patch),
    );
  }

  private async saveProfileOverride(
    templateId: string,
    patch: Pick<TemplateProfileOverrideEntity, 'profileVersion' | 'override'>,
  ): Promise<void> {
    const existing = await this.profileOverrideRepo.findOne({ where: { templateId } });
    await this.profileOverrideRepo.save(
      Object.assign(existing ?? this.profileOverrideRepo.create({ templateId }), patch),
    );
  }

  private async saveAssetManifest(
    templateId: string,
    patch: Pick<TemplateAssetManifest, 'manifest'>,
  ): Promise<void> {
    const existing = await this.assetManifestRepo.findOne({ where: { templateId } });
    await this.assetManifestRepo.save(
      Object.assign(existing ?? this.assetManifestRepo.create({ templateId }), patch),
    );
  }

  private async saveAgentPermissions(
    templateId: string,
    patch: Pick<TemplateAgentPermissions, 'permissions'>,
  ): Promise<void> {
    const existing = await this.agentPermissionsRepo.findOne({ where: { templateId } });
    await this.agentPermissionsRepo.save(
      Object.assign(existing ?? this.agentPermissionsRepo.create({ templateId }), patch),
    );
  }

  private async saveEvaluationSpec(
    templateId: string,
    patch: Pick<TemplateEvaluationSpec, 'evaluation'>,
  ): Promise<void> {
    const existing = await this.evaluationSpecRepo.findOne({ where: { templateId } });
    await this.evaluationSpecRepo.save(
      Object.assign(existing ?? this.evaluationSpecRepo.create({ templateId }), patch),
    );
  }

  private withTemplateId(
    value: Record<string, unknown>,
    templateId: string,
  ): Record<string, unknown> {
    return { ...structuredClone(value), templateId };
  }
}

@Injectable()
export class TypeOrmTemplatePersistenceRepository
  extends TypeOrmTemplatePersistenceStore
  implements TemplatePersistenceRepository
{
  constructor(
    @InjectRepository(Template)
    templateRepo: Repository<Template>,
    @InjectRepository(TemplateProfileGenerated)
    profileGeneratedRepo: Repository<TemplateProfileGenerated>,
    @InjectRepository(TemplateProfileOverrideEntity)
    profileOverrideRepo: Repository<TemplateProfileOverrideEntity>,
    @InjectRepository(TemplateAssetManifest)
    assetManifestRepo: Repository<TemplateAssetManifest>,
    @InjectRepository(TemplateAgentPermissions)
    agentPermissionsRepo: Repository<TemplateAgentPermissions>,
    @InjectRepository(TemplateEvaluationSpec)
    evaluationSpecRepo: Repository<TemplateEvaluationSpec>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {
    super(
      templateRepo,
      profileGeneratedRepo,
      profileOverrideRepo,
      assetManifestRepo,
      agentPermissionsRepo,
      evaluationSpecRepo,
    );
  }

  createTemplate(input: Partial<Template>): Template {
    return this.templateRepo.create(input);
  }

  async upsertTemplates(templates: Template[]): Promise<void> {
    for (const template of templates) {
      const existing = await this.templateRepo.findOne({
        where: { templateId: template.templateId },
      });
      await this.templateRepo.save(Object.assign(existing ?? new Template(), template));
    }
  }

  async findMarketplace(filters: TemplateListFilters): Promise<Template[]> {
    const qb = this.templateRepo
      .createQueryBuilder('t')
      .where('t.ownerUserId IS NULL')
      .andWhere('t.isPublic = :isPublic', { isPublic: true });
    this.applyTemplateListFilters(qb, filters);
    qb.orderBy('t.createdAt', 'ASC');
    return qb.getMany();
  }

  async findOwned(ownerUserId: string, filters: TemplateListFilters): Promise<Template[]> {
    const qb = this.templateRepo
      .createQueryBuilder('t')
      .where('t.ownerUserId = :ownerUserId', { ownerUserId });
    this.applyTemplateListFilters(qb, filters);
    qb.orderBy('t.updatedAt', 'DESC');
    return qb.getMany();
  }

  findRecentOwned(ownerUserId: string, limit: number): Promise<Template[]> {
    return this.templateRepo.find({
      where: { ownerUserId },
      order: { updatedAt: 'DESC' },
      take: limit,
    });
  }

  findPublicByTemplateId(templateId: string): Promise<Template | null> {
    return this.templateRepo.findOne({
      where: { templateId, ownerUserId: IsNull(), isPublic: true },
    });
  }

  findOwnedByTemplateId(ownerUserId: string, templateId: string): Promise<Template | null> {
    return this.templateRepo.findOne({
      where: { templateId, ownerUserId },
    });
  }

  findAccessibleByTemplateId(ownerUserId: string, templateId: string): Promise<Template | null> {
    return this.templateRepo.findOne({
      where: [
        { templateId, ownerUserId },
        { templateId, ownerUserId: IsNull(), isPublic: true },
      ],
    });
  }

  findByTemplateId(templateId: string): Promise<Template | null> {
    return this.templateRepo.findOne({ where: { templateId } });
  }

  existsByTemplateId(templateId: string): Promise<boolean> {
    return this.templateRepo.exists({ where: { templateId } });
  }

  findAllTemplates(): Promise<Template[]> {
    return this.templateRepo.find();
  }

  async findExistingGeneratedProfileTemplateIds(): Promise<string[]> {
    const profiles = await this.profileGeneratedRepo.find({
      select: { templateId: true },
    });
    return profiles.map((profile) => profile.templateId);
  }

  async findAllUserIds(): Promise<string[]> {
    const users = await this.userRepo.find({ select: { id: true } });
    return users.map((user) => user.id);
  }

  async findPublicTemplateIds(): Promise<string[]> {
    const templates = await this.templateRepo.find({
      where: { ownerUserId: IsNull(), isPublic: true },
      select: { templateId: true },
    });
    return templates.map((template) => template.templateId);
  }

  findOwnerlessTemplates(): Promise<Template[]> {
    return this.templateRepo.find({
      where: { ownerUserId: IsNull() },
    });
  }

  runInTransaction<T>(work: (store: TemplatePersistenceStore) => Promise<T>): Promise<T> {
    return this.templateRepo.manager.transaction((manager) => work(this.storeFor(manager)));
  }

  private storeFor(manager: EntityManager): TemplatePersistenceStore {
    return new TypeOrmTemplatePersistenceStore(
      manager.getRepository(Template),
      manager.getRepository(TemplateProfileGenerated),
      manager.getRepository(TemplateProfileOverrideEntity),
      manager.getRepository(TemplateAssetManifest),
      manager.getRepository(TemplateAgentPermissions),
      manager.getRepository(TemplateEvaluationSpec),
    );
  }

  private applyTemplateListFilters(
    qb: SelectQueryBuilder<Template>,
    filters: TemplateListFilters,
  ): void {
    if (filters.category) {
      qb.andWhere('t.category = :category', { category: filters.category });
    }
    if (filters.displayCategory) {
      qb.andWhere('t.displayCategory = :displayCategory', {
        displayCategory: filters.displayCategory,
      });
    }
    if (filters.functionalCategory) {
      qb.andWhere('t.primaryFunctionalCategory = :fc', { fc: filters.functionalCategory });
    }
    if (filters.platformCategory) {
      qb.andWhere('t.platformCategories LIKE :pc', { pc: `%${filters.platformCategory}%` });
    }
    if (filters.search) {
      const q = `%${filters.search.toLowerCase()}%`;
      qb.andWhere(
        [
          '(LOWER(t.name) LIKE :q',
          'OR LOWER(t.tagline) LIKE :q',
          'OR LOWER(t.description) LIKE :q',
          'OR LOWER(t.searchText) LIKE :q)',
        ].join(' '),
        { q },
      );
    }
  }
}
