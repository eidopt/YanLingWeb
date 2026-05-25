import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from '../auth/auth.module';
import { Template } from '../templates/entities/template.entity';
import { PublishedSite } from './entities/published-site.entity';
import { PublishedSiteRevision } from './entities/published-site-revision.entity';
import { SitesController } from './sites.controller';
import { SitesService } from './sites.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([PublishedSite, PublishedSiteRevision, Template]),
    AuthModule,
  ],
  controllers: [SitesController],
  providers: [SitesService],
})
export class SitesModule {}
