import { Module } from '@nestjs/common';

import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';
import { TemplatesModule } from '../templates/templates.module';
import { AiTemplatesController } from './ai-templates.controller';
import { AiTemplatesService } from './ai-templates.service';
import { TemplatePipelineService } from './orchestrator/pipeline.service';
import { DesignerAgent } from './stages/designer.agent';
import { DiversityCriticAgent } from './stages/diversity-critic.agent';
import { SchemaGeneratorAgent } from './stages/schema-generator.agent';
import { VerifierAgent } from './stages/verifier.agent';

/**
 * AI Templates Module
 *
 * 4-Stage 模板生成流水线的独立 NestJS 模块。和 AiModule 解耦：
 *  - AiModule 提供基础设施（Provider、QueryLoop、token usage 持久化）
 *  - AiTemplatesModule 在此之上编排多 agent 流水线
 *
 * Stage agents depend on the AI_TEMPLATE_PIPELINE_PROVIDER token exported by AiModule,
 * not on AiService directly. Keep that boundary intact when changing provider
 * selection or template-pipeline execution.
 */
@Module({
  imports: [AuthModule, AiModule, TemplatesModule],
  controllers: [AiTemplatesController],
  providers: [
    AiTemplatesService,
    TemplatePipelineService,
    DesignerAgent,
    DiversityCriticAgent,
    SchemaGeneratorAgent,
    VerifierAgent,
  ],
  exports: [AiTemplatesService],
})
export class AiTemplatesModule {}
