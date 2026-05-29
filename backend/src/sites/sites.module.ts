import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { TemplatesModule } from '../templates/templates.module';
import { PublishedSite } from './entities/published-site.entity';
import { PublishedSiteRevision } from './entities/published-site-revision.entity';
import { PUBLISHED_SITE_REPOSITORY, TypeOrmPublishedSiteRepository } from './repositories';
import { SitesController } from './sites.controller';
import { SitesService } from './sites.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([PublishedSite, PublishedSiteRevision]),
    AuthModule,
    TemplatesModule,
  ],
  controllers: [SitesController],
  providers: [
    SitesService,
    {
      provide: PUBLISHED_SITE_REPOSITORY,
      useClass: TypeOrmPublishedSiteRepository,
    },
  ],
})
export class SitesModule {}
