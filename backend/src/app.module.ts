import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AiModule } from './ai/ai.module';
import { ConfigFactory } from './config/config.factory';
import { ExportRecord } from './exports/entities/export-record.entity';
import { ExportsModule } from './exports/exports.module';
import { Template } from './templates/entities/template.entity';
import { TemplatesModule } from './templates/templates.module';
import { Theme } from './themes/entities/theme.entity';
import { ThemesModule } from './themes/themes.module';
import { User } from './users/entities/user.entity';
import { UsersModule } from './users/users.module';

const startupServerFlavor = ConfigFactory.applyStartupFlavor();

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: ConfigFactory.envFilePaths(startupServerFlavor),
      isGlobal: true,
    }),

    TypeOrmModule.forRootAsync({
      useFactory: () => {
        const env = ConfigFactory.build();
        return {
          type: 'sqljs',
          location: env.database.path,
          autoSave: true,
          useLocalForage: false,
          entities: [Theme, Template, ExportRecord, User],
          synchronize: true, // auto-create tables on start (dev only)
          logging: env.database.logging,
        };
      },
    }),

    ThemesModule,
    TemplatesModule,
    ExportsModule,
    UsersModule,
    AiModule,
  ],
})
export class AppModule {}
