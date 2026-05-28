import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';
import { Template } from '../templates/entities/template.entity';
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
 * Round 2 起 stage agents 会从 AiModule 注入 AiService 拿 provider。
 * 当前 Round 1 全部是 stub，不需要 AiService 依赖，但保留 AiModule import
 * 以便后续无缝接入。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Template]),
    AuthModule,
    AiModule,
  ],
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
