import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ConfigFactory } from '../config/config.factory';
import { User } from '../users/entities/user.entity';
import { Template } from './entities/template.entity';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Template, User]),
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: ConfigFactory.build().jwt.secret,
      }),
    }),
  ],
  controllers: [TemplatesController],
  providers: [TemplatesService, JwtAuthGuard],
  exports: [TemplatesService],
})
export class TemplatesModule {}
