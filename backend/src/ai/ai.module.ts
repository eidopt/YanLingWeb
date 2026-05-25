import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { Template } from '../templates/entities/template.entity';
import { User } from '../users/entities/user.entity';
import { AgentEvalController } from './agent-eval.controller';
import { AgentRunnerService } from './agent-runner.service';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiTokenUsageEvent } from './entities/ai-token-usage.entity';
import { EditorAiConversation } from './entities/editor-ai-conversation.entity';
import { EditorConversationService } from './services/editor-conversation.service';
import { ProviderLogCompactionService } from './services/provider-log-compaction.service';
import { TokenUsageService } from './services/token-usage.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Template, EditorAiConversation, AiTokenUsageEvent, User]),
    AuthModule,
  ],
  controllers: [AiController, AgentEvalController],
  providers: [
    AiService,
    AgentRunnerService,
    TokenUsageService,
    EditorConversationService,
    ProviderLogCompactionService,
  ],
  exports: [AiService, AgentRunnerService],
})
export class AiModule {}
