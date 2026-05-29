import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { User } from '../users/entities/user.entity';
import { Template } from './entities/template.entity';
import { TemplateAgentPermissions } from './entities/template-agent-permissions.entity';
import { TemplateAssetManifest } from './entities/template-asset-manifest.entity';
import { TemplateEvaluationSpec } from './entities/template-evaluation-spec.entity';
import { TemplateProfileGenerated } from './entities/template-profile-generated.entity';
import { TemplateProfileOverrideEntity } from './entities/template-profile-override.entity';
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
} from './template-agent-knowledge.service';
import { TemplateAssetService } from './template-asset.service';
import { TemplateCategoryRegistryService } from './template-category-registry.service';
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
      User,
    ]),
    AuthModule,
  ],
  controllers: [TemplatesController],
  providers: [
    TemplatesService,
    TemplateAssetService,
    TemplateCategoryRegistryService,
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
    TEMPLATE_PERSISTENCE_REPOSITORY,
    TEMPLATE_READ_REPOSITORY,
    TEMPLATE_AGENT_KNOWLEDGE_SERVICE,
  ],
})
export class TemplatesModule {}
