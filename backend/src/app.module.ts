import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';

import { AiModule } from './ai/ai.module';
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

    ConfigModule,
    DatabaseModule,
    ThemesModule,
    TemplatesModule,
    SitesModule,
    ExportsModule,
    UsersModule,
    AiModule,
  ],
})
export class AppModule {}
