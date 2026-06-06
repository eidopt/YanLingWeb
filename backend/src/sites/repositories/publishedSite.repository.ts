import type { PublishedSite } from '../entities/publishedSite.entity';
import type { PublishedSiteRevision } from '../entities/publishedSiteRevision.entity';

export const PUBLISHED_SITE_REPOSITORY = Symbol('PUBLISHED_SITE_REPOSITORY');

export interface PublishedSiteRevisionPayload {
  schemaVersion: number;
  runtimeVersion: string;
  layoutJson: Record<string, unknown>;
  themeJson: Record<string, unknown>;
  dataJson: Record<string, unknown>;
  manifestJson: Record<string, unknown>;
}

export interface PublishNewSiteInput {
  ownerUserId: string;
  templateId: string;
  subdomain: string;
  payload: PublishedSiteRevisionPayload;
}

export interface RepublishSiteInput {
  ownerUserId: string;
  siteId: string;
  templateId: string;
  payload: PublishedSiteRevisionPayload;
}

export interface PublishedSiteDetailRecord {
  site: PublishedSite;
  activeRevision: PublishedSiteRevision | null;
}

export interface PublishedSiteRepository {
  publishNewSite(input: PublishNewSiteInput): Promise<PublishedSiteDetailRecord>;
  republishSite(input: RepublishSiteInput): Promise<PublishedSiteDetailRecord>;
  activateRevision(input: {
    ownerUserId: string;
    siteId: string;
    revisionId: string;
  }): Promise<PublishedSiteDetailRecord>;
  findForOwner(ownerUserId: string): Promise<PublishedSite[]>;
  findOwnedSite(ownerUserId: string, siteId: string): Promise<PublishedSite | null>;
  findBySubdomain(subdomain: string): Promise<PublishedSite | null>;
  findActiveBySubdomain(subdomain: string): Promise<PublishedSite | null>;
  findRevision(siteId: string, revisionId: string): Promise<PublishedSiteRevision | null>;
  findRevisionsForSite(siteId: string): Promise<PublishedSiteRevision[]>;
}
