import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ConfigFactory } from '../config/config.factory';
import { Template } from '../templates/entities/template.entity';
import { User } from '../users/entities/user.entity';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiTokenUsageEvent } from './entities/ai-token-usage.entity';
import { EditorAiConversation } from './entities/editor-ai-conversation.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Template, EditorAiConversation, AiTokenUsageEvent, User]),
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: ConfigFactory.build().jwt.secret,
      }),
    }),
  ],
  controllers: [AiController],
  providers: [AiService, JwtAuthGuard],
  exports: [AiService],
})
export class AiModule {}
