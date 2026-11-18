import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { User } from '../users/entities/user.entity';
import { AssetLibraryService } from './assetLibrary.service';
import { AssetLibraryImage } from './entities/assetLibraryImage.entity';
import { Template } from './entities/template.entity';
import { TemplateAgentPermissions } from './entities/templateAgentPermissions.entity';
import { TemplateAssetManifest } from './entities/templateAssetManifest.entity';
import { TemplateEvaluationSpec } from './entities/templateEvaluationSpec.entity';
import { TemplateProfileGenerated } from './entities/templateProfileGenerated.entity';
import { TemplateProfileOverrideEntity } from './entities/templateProfileOverride.entity';
import { PooledTemplateAssetStore } from './pooledTemplateAssetStore';
import {
  TEMPLATE_AGENT_KNOWLEDGE_REPOSITORY,
  TEMPLATE_PERSISTENCE_REPOSITORY,
  TEMPLATE_READ_REPOSITORY,
  TypeOrmTemplateAgentKnowledgeRepository,
  TypeOrmTemplatePersistenceRepository,
  TypeOrmTemplateReadRepository,
} from './repositories';
import {
  TEMPLATE_AGENT_KNOWLEDGE_SERVICE,
  TemplateAgentKnowledgeService,
} from './templateAgentKnowledge.service';
import { TemplateAssetService } from './templateAsset.service';
import { TemplateAssetsController } from './templateAssets.controller';
import { LocalDiskTemplateAssetStore, TEMPLATE_ASSET_STORE } from './templateAssetStore';
import { TemplateCategoryRegistryService } from './templateCategoryRegistry.service';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Template,
      TemplateProfileGenerated,
      TemplateProfileOverrideEntity,
      TemplateAssetManifest,
      TemplateAgentPermissions,
      TemplateEvaluationSpec,
      AssetLibraryImage,
      User,
    ]),
    AuthModule,
  ],
  controllers: [TemplatesController, TemplateAssetsController],
  providers: [
    TemplatesService,
    TemplateAssetService,
    TemplateCategoryRegistryService,
    AssetLibraryService,
    // 模板图片存储端口：默认 = 本地磁盘 + 素材库语义索引复用 (PooledTemplateAssetStore)。
    // 未来换远端图床时，把 useClass 换成远端实现即可，调用方无需改动。
    LocalDiskTemplateAssetStore,
    {
      provide: TEMPLATE_ASSET_STORE,
      useClass: PooledTemplateAssetStore,
    },
    {
      provide: TEMPLATE_READ_REPOSITORY,
      useClass: TypeOrmTemplateReadRepository,
    },
    {
      provide: TEMPLATE_AGENT_KNOWLEDGE_REPOSITORY,
      useClass: TypeOrmTemplateAgentKnowledgeRepository,
    },
    {
      provide: TEMPLATE_PERSISTENCE_REPOSITORY,
      useClass: TypeOrmTemplatePersistenceRepository,
    },
    {
      provide: TEMPLATE_AGENT_KNOWLEDGE_SERVICE,
      useClass: TemplateAgentKnowledgeService,
    },
  ],
  exports: [
    TemplatesService,
    TemplateAssetService,
    TemplateCategoryRegistryService,
    AssetLibraryService,
    TEMPLATE_PERSISTENCE_REPOSITORY,
    TEMPLATE_READ_REPOSITORY,
    TEMPLATE_AGENT_KNOWLEDGE_SERVICE,
  ],
})
export class TemplatesModule {}
