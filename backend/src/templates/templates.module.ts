import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { User } from '../users/entities/user.entity';
import { TemplateAgentPermissions } from './entities/template-agent-permissions.entity';
import { TemplateAssetManifest } from './entities/template-asset-manifest.entity';
import { TemplateEvaluationSpec } from './entities/template-evaluation-spec.entity';
import { Template } from './entities/template.entity';
import { TemplateProfileGenerated } from './entities/template-profile-generated.entity';
import { TemplateProfileOverrideEntity } from './entities/template-profile-override.entity';
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
  providers: [TemplatesService, TemplateCategoryRegistryService],
  exports: [TemplatesService, TemplateCategoryRegistryService],
})
export class TemplatesModule {}
