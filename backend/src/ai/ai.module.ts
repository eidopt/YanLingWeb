import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { TemplatesModule } from '../templates/templates.module';
import { UsersModule } from '../users/users.module';
import { AgentEvalController } from './agentEval.controller';
import { AgentRunnerService } from './agentRunner.service';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiTokenUsageEvent } from './entities/aiTokenUsage.entity';
import { EditorAiConversation } from './entities/editorAiConversation.entity';
import { PendingClarificationStore } from './pendingClarification.store';
import { AI_TEMPLATE_PIPELINE_PROVIDER } from './pipelineProvider.port';
import {
  EDITOR_CONVERSATION_REPOSITORY,
  TOKEN_USAGE_REPOSITORY,
  TypeOrmEditorConversationRepository,
  TypeOrmTokenUsageRepository,
} from './repositories';
import { EditorConversationService } from './services/editorConversation.service';
import { EditorEditOutbox } from './services/editorEditOutbox.service';
import { ProviderLogCompactionService } from './services/providerLogCompaction.service';
import { TokenUsageService } from './services/tokenUsage.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([EditorAiConversation, AiTokenUsageEvent]),
    AuthModule,
    TemplatesModule,
    UsersModule,
  ],
  controllers: [AiController, AgentEvalController],
  providers: [
    AiService,
    AgentRunnerService,
    TokenUsageService,
    EditorConversationService,
    EditorEditOutbox,
    PendingClarificationStore,
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
