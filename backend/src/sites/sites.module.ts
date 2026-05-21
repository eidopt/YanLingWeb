import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ConfigService } from '../config/config.service';
import { Template } from '../templates/entities/template.entity';
import { PublishedSiteRevision } from './entities/published-site-revision.entity';
import { PublishedSite } from './entities/published-site.entity';
import { SitesController } from './sites.controller';
import { SitesService } from './sites.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([PublishedSite, PublishedSiteRevision, Template]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.jwt.secret,
      }),
    }),
  ],
  controllers: [SitesController],
  providers: [SitesService, JwtAuthGuard],
})
export class SitesModule {}
