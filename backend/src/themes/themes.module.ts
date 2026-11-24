import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { Theme } from './entities/theme.entity';
import { THEME_REPOSITORY, TypeOrmThemeRepository } from './repositories';
import { ThemesController } from './themes.controller';
import { ThemesService } from './themes.service';

@Module({
  imports: [TypeOrmModule.forFeature([Theme]), AuthModule],
  controllers: [ThemesController],
  providers: [
    ThemesService,
    {
      provide: THEME_REPOSITORY,
      useClass: TypeOrmThemeRepository,
    },
  ],
  exports: [ThemesService],
})
export class ThemesModule {}
