import {
  type PublicSiteConfig,
  PublishedSitePageContent,
} from './PublishedSitePageContent';
import { notFound } from 'next/navigation';

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:4000';

interface PageProps {
  params: Promise<{ subdomain: string }>;
}

export const dynamic = 'force-dynamic';

async function loadPublicSite(subdomain: string): Promise<PublicSiteConfig> {
  const response = await fetch(
    `${BACKEND_URL}/api/public/sites/${encodeURIComponent(subdomain)}`,
    { cache: 'no-store' },
  );

  if (response.status === 404) {
    notFound();
  }
  if (!response.ok) {
    throw new Error(`Public site resolver returned ${response.status}`);
  }

  return response.json() as Promise<PublicSiteConfig>;
}

export default async function PublishedSitePage({ params }: PageProps) {
  const { subdomain } = await params;
  const config = await loadPublicSite(subdomain);
  return <PublishedSitePageContent config={config} />;
}
