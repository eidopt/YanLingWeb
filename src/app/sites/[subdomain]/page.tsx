import {
  type PublicSiteConfig,
  PublishedSitePageContent,
} from './PublishedSitePageContent';
import { notFound } from 'next/navigation';
import type { ThemeComponentDescriptor, ThemeLayoutNode } from 'ui/layout/types';

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:4000';

interface PageProps {
  params: Promise<{ subdomain: string }>;
}

export const dynamic = 'force-static';

export function generateStaticParams() {
  return [{ subdomain: '_placeholder' }];
}

const PREVIEW_COMPONENTS: ThemeComponentDescriptor[] = [
  {
    alias: 'core.screen',
    name: 'Screen',
    kind: 'layout',
    description: 'Page root',
    props: [
      { name: 'title', type: 'string' },
      { name: 'statusTime', type: 'string' },
      { name: 'headerActionLabel', type: 'string' },
    ],
  },
  {
    alias: 'core.stack',
    name: 'Stack',
    kind: 'layout',
    description: 'Vertical container',
    props: [
      { name: 'gap', type: 'string' },
      { name: 'alignItems', type: 'string' },
    ],
  },
  {
    alias: 'core.panel',
    name: 'Panel',
    kind: 'layout',
    description: 'Card-like container',
    props: [
      { name: 'tone', type: 'string' },
      { name: 'gap', type: 'string' },
    ],
  },
  {
    alias: 'core.text',
    name: 'Text',
    kind: 'component',
    description: 'Text node',
    props: [
      { name: 'text', type: 'string' },
      { name: 'variant', type: 'string' },
    ],
  },
  {
    alias: 'core.button',
    name: 'Button',
    kind: 'component',
    description: 'Action button',
    props: [
      { name: 'label', type: 'string' },
      { name: 'variant', type: 'string' },
    ],
  },
  {
    alias: 'core.tag',
    name: 'Tag',
    kind: 'component',
    description: 'Status badge',
    props: [
      { name: 'label', type: 'string' },
      { name: 'tone', type: 'string' },
    ],
  },
];

function node(
  id: string,
  alias: string,
  props: Record<string, unknown> = {},
  children: ThemeLayoutNode[] = [],
): ThemeLayoutNode {
  return {
    id,
    alias,
    layout: { mode: 'flow', width: '100%' },
    props,
    children,
  };
}

function createStaticPreviewConfig(subdomain: string): PublicSiteConfig {
  const layout = node('preview-screen', 'core.screen', {
    title: 'Static preview',
    statusTime: '9:41',
    headerActionLabel: 'Preview',
  }, [
    node('preview-stack', 'core.stack', { gap: '16' }, [
      node('preview-hero', 'core.panel', { tone: 'promo', gap: '12' }, [
        node('preview-tag', 'core.tag', {
          label: 'Frontend only',
          tone: 'info',
        }),
        node('preview-title', 'core.text', {
          text: 'YanLingWeb static preview',
          variant: 'heading',
        }),
        node('preview-body', 'core.text', {
          text: `Rendering ${subdomain} without backend data. Connect the backend to preview a published site.`,
          variant: 'body',
        }),
        node('preview-button', 'core.button', {
          label: 'Preview ready',
          variant: 'primary',
        }),
      ]),
      node('preview-note', 'core.panel', { tone: 'soft', gap: '8' }, [
        node('preview-note-title', 'core.text', {
          text: 'Static export fallback',
          variant: 'title',
        }),
        node('preview-note-body', 'core.text', {
          text: 'This page is generated locally so frontend static builds can complete when the API is unavailable.',
          variant: 'caption',
        }),
      ]),
    ]),
  ]);

  return {
    layoutDocument: {
      version: 1,
      themeId: 'static-preview',
      themeName: 'Static preview',
      pageName: 'Preview',
      description: 'Frontend-only preview used during static export.',
      components: PREVIEW_COMPONENTS,
      defaultPageId: 'preview',
      pages: [{ id: 'preview', name: 'Preview', layout }],
      layout,
      cssVars: {
        '--app-color-accent': '#2563eb',
        '--app-surface': '#ffffff',
        '--app-surface-muted': '#eef2ff',
        '--app-text-base': '#111827',
      },
    },
    runtime: {
      id: 'static-preview',
      cssVars: {
        '--app-color-accent': '#2563eb',
        '--app-surface': '#ffffff',
        '--app-surface-muted': '#eef2ff',
        '--app-text-base': '#111827',
      },
      componentTemplates: {},
    },
  };
}

async function loadPublicSite(subdomain: string): Promise<PublicSiteConfig> {
  if (subdomain === '_placeholder') {
    return createStaticPreviewConfig(subdomain);
  }

  const response = await fetch(
    `${BACKEND_URL}/api/public/sites/${encodeURIComponent(subdomain)}`,
    { cache: 'no-store' },
  ).catch(() => null);

  if (!response) {
    return createStaticPreviewConfig(subdomain);
  }

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
