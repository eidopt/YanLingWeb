import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ConfigFactory } from '../config/config.factory';
import { Template } from '../templates/entities/template.entity';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Template]),
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
