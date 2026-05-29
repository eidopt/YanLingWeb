import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { TemplatesModule } from '../templates/templates.module';
import { AgentEvalController } from './agent-eval.controller';
import { AgentRunnerService } from './agent-runner.service';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiTokenUsageEvent } from './entities/ai-token-usage.entity';
import { EditorAiConversation } from './entities/editor-ai-conversation.entity';
import { AI_TEMPLATE_PIPELINE_PROVIDER } from './pipeline-provider.port';
import {
  EDITOR_CONVERSATION_REPOSITORY,
  TOKEN_USAGE_REPOSITORY,
  TypeOrmEditorConversationRepository,
  TypeOrmTokenUsageRepository,
} from './repositories';
import { EditorConversationService } from './services/editor-conversation.service';
import { ProviderLogCompactionService } from './services/provider-log-compaction.service';
import { TokenUsageService } from './services/token-usage.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([EditorAiConversation, AiTokenUsageEvent]),
    AuthModule,
    TemplatesModule,
  ],
  controllers: [AiController, AgentEvalController],
  providers: [
    AiService,
    AgentRunnerService,
    TokenUsageService,
    EditorConversationService,
    ProviderLogCompactionService,
    {
      provide: EDITOR_CONVERSATION_REPOSITORY,
      useClass: TypeOrmEditorConversationRepository,
    },
    {
      provide: TOKEN_USAGE_REPOSITORY,
      useClass: TypeOrmTokenUsageRepository,
    },
    {
      provide: AI_TEMPLATE_PIPELINE_PROVIDER,
      useExisting: AiService,
    },
  ],
  exports: [AiService, AgentRunnerService, AI_TEMPLATE_PIPELINE_PROVIDER],
})
export class AiModule {}
