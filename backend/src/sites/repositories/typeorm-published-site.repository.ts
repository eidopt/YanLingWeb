import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { PublishedSite } from '../entities/published-site.entity';
import { PublishedSiteRevision } from '../entities/published-site-revision.entity';
import type {
  PublishedSiteDetailRecord,
  PublishedSiteRepository,
  PublishNewSiteInput,
  RepublishSiteInput,
} from './published-site.repository';

@Injectable()
export class TypeOrmPublishedSiteRepository implements PublishedSiteRepository {
  constructor(
    @InjectRepository(PublishedSite)
    private readonly siteRepo: Repository<PublishedSite>,
    @InjectRepository(PublishedSiteRevision)
    private readonly revisionRepo: Repository<PublishedSiteRevision>,
  ) {}

  publishNewSite(input: PublishNewSiteInput): Promise<PublishedSiteDetailRecord> {
    return this.siteRepo.manager.transaction(async (manager) => {
      const siteRepo = manager.getRepository(PublishedSite);
      const revisionRepo = manager.getRepository(PublishedSiteRevision);

      let site = siteRepo.create({
        ownerUserId: input.ownerUserId,
        templateId: input.templateId,
        subdomain: input.subdomain,
        status: 'active',
        activeRevisionId: null,
      });
      site = await siteRepo.save(site);

      const revision = await revisionRepo.save(
        revisionRepo.create({
          siteId: site.id,
          templateId: input.templateId,
          status: 'active',
          errorMessage: null,
          ...input.payload,
        }),
      );

      site.activeRevisionId = revision.id;
      site = await siteRepo.save(site);
      return { site, activeRevision: revision };
    });
  }

  republishSite(input: RepublishSiteInput): Promise<PublishedSiteDetailRecord> {
    return this.siteRepo.manager.transaction(async (manager) => {
      const siteRepo = manager.getRepository(PublishedSite);
      const revisionRepo = manager.getRepository(PublishedSiteRevision);
      const site = await siteRepo.findOne({
        where: { id: input.siteId, ownerUserId: input.ownerUserId },
      });
      if (!site) {
        throw new NotFoundException(`Site "${input.siteId}" not found`);
      }

      const revision = await revisionRepo.save(
        revisionRepo.create({
          siteId: site.id,
          templateId: input.templateId,
          status: 'active',
          errorMessage: null,
          ...input.payload,
        }),
      );

      site.activeRevisionId = revision.id;
      const savedSite = await siteRepo.save(site);
      return { site: savedSite, activeRevision: revision };
    });
  }

  activateRevision(input: {
    ownerUserId: string;
    siteId: string;
    revisionId: string;
  }): Promise<PublishedSiteDetailRecord> {
    return this.siteRepo.manager.transaction(async (manager) => {
      const siteRepo = manager.getRepository(PublishedSite);
      const revisionRepo = manager.getRepository(PublishedSiteRevision);
      const site = await siteRepo.findOne({
        where: { id: input.siteId, ownerUserId: input.ownerUserId },
      });
      if (!site) {
        throw new NotFoundException(`Site "${input.siteId}" not found`);
      }

      const revision = await revisionRepo.findOne({
        where: { id: input.revisionId, siteId: site.id },
      });
      if (!revision) {
        throw new NotFoundException(`Revision "${input.revisionId}" not found`);
      }

      site.activeRevisionId = revision.id;
      const savedSite = await siteRepo.save(site);
      return { site: savedSite, activeRevision: revision };
    });
  }

  findForOwner(ownerUserId: string): Promise<PublishedSite[]> {
    return this.siteRepo.find({
      where: { ownerUserId },
      order: { updatedAt: 'DESC' },
    });
  }

  findOwnedSite(ownerUserId: string, siteId: string): Promise<PublishedSite | null> {
    return this.siteRepo.findOne({ where: { id: siteId, ownerUserId } });
  }

  findBySubdomain(subdomain: string): Promise<PublishedSite | null> {
    return this.siteRepo.findOne({ where: { subdomain } });
  }

  findActiveBySubdomain(subdomain: string): Promise<PublishedSite | null> {
    return this.siteRepo.findOne({ where: { subdomain, status: 'active' } });
  }

  findRevision(siteId: string, revisionId: string): Promise<PublishedSiteRevision | null> {
    return this.revisionRepo.findOne({
      where: { id: revisionId, siteId },
    });
  }

  findRevisionsForSite(siteId: string): Promise<PublishedSiteRevision[]> {
    return this.revisionRepo.find({
      where: { siteId },
      order: { createdAt: 'DESC' },
    });
  }
}
