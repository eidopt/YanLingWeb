import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AiModule } from './ai/ai.module';
import { ConfigFactory } from './config/config.factory';
import { DatabaseModule } from './database/database.module';
import { ExportsModule } from './exports/exports.module';
import { TemplatesModule } from './templates/templates.module';
import { ThemesModule } from './themes/themes.module';
import { UsersModule } from './users/users.module';

const startupServerFlavor = ConfigFactory.applyStartupFlavor();

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: ConfigFactory.envFilePaths(startupServerFlavor),
      isGlobal: true,
    }),

    DatabaseModule,
    ThemesModule,
    TemplatesModule,
    ExportsModule,
    UsersModule,
    AiModule,
  ],
})
export class AppModule {}
