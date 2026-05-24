import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ConfigService } from '../config/config.service';
import { Template } from '../templates/entities/template.entity';
import { User } from '../users/entities/user.entity';
import { AgentEvalController } from './agent-eval.controller';
import { AgentRunnerService } from './agent-runner.service';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiTokenUsageEvent } from './entities/ai-token-usage.entity';
import { EditorAiConversation } from './entities/editor-ai-conversation.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Template, EditorAiConversation, AiTokenUsageEvent, User]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.jwt.secret,
      }),
    }),
  ],
  controllers: [AiController, AgentEvalController],
  providers: [AiService, AgentRunnerService, JwtAuthGuard],
  exports: [AiService, AgentRunnerService],
})
export class AiModule {}
