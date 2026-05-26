import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AiModule } from './ai/ai.module';
import { AuthModule } from './auth/auth.module';
import { ConfigFactory } from './config/config.factory';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { ExportsModule } from './exports/exports.module';
import { SitesModule } from './sites/sites.module';
import { TemplatesModule } from './templates/templates.module';
import { ThemesModule } from './themes/themes.module';
import { UsersModule } from './users/users.module';

const startupServerFlavor = ConfigFactory.applyStartupFlavor();

@Module({
  imports: [
    NestConfigModule.forRoot({
      envFilePath: ConfigFactory.envFilePaths(startupServerFlavor),
      isGlobal: true,
    }),
    ThrottlerModule.forRoot([{
      ttl: 60000,  // 1 minute window
      limit: 120,  // general API limit; auth and AI endpoints apply stricter guards
    }]),

    ConfigModule,
    DatabaseModule,
    AuthModule,
    ThemesModule,
    TemplatesModule,
    SitesModule,
    ExportsModule,
    UsersModule,
    AiModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
