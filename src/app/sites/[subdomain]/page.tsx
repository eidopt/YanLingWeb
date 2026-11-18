import { type PublicSiteConfig, PublishedSitePageContent } from './PublishedSitePageContent';
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
    name: '页面画布',
    kind: 'layout',
    description: '页面根容器',
    props: [
      { name: 'title', type: 'string' },
      { name: 'statusTime', type: 'string' },
      { name: 'headerActionLabel', type: 'string' },
    ],
  },
  {
    alias: 'core.stack',
    name: '纵向容器',
    kind: 'layout',
    description: '纵向排列容器',
    props: [
      { name: 'gap', type: 'string' },
      { name: 'alignItems', type: 'string' },
    ],
  },
  {
    alias: 'core.panel',
    name: '面板容器',
    kind: 'layout',
    description: '卡片风格容器',
    props: [
      { name: 'tone', type: 'string' },
      { name: 'gap', type: 'string' },
    ],
  },
  {
    alias: 'core.text',
    name: '文本',
    kind: 'component',
    description: '文本节点',
    props: [
      { name: 'text', type: 'string' },
      { name: 'variant', type: 'string' },
    ],
  },
  {
    alias: 'core.button',
    name: '按钮',
    kind: 'component',
    description: '操作按钮',
    props: [
      { name: 'label', type: 'string' },
      { name: 'variant', type: 'string' },
    ],
  },
  {
    alias: 'core.tag',
    name: '标签',
    kind: 'component',
    description: '状态标签',
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
  const layout = node(
    'preview-screen',
    'core.screen',
    {
      title: '静态预览',
      statusTime: '9:41',
      headerActionLabel: '预览',
    },
    [
      node('preview-stack', 'core.stack', { gap: '16' }, [
        node('preview-hero', 'core.panel', { tone: 'promo', gap: '12' }, [
          node('preview-tag', 'core.tag', {
            label: '仅前端预览',
            tone: 'info',
          }),
          node('preview-title', 'core.text', {
            text: '言灵静态预览',
            variant: 'heading',
          }),
          node('preview-body', 'core.text', {
            text: `当前在未连接后端数据时预览 ${subdomain}，连接后端后即可展示真实已发布站点。`,
            variant: 'body',
          }),
          node('preview-button', 'core.button', {
            label: '预览就绪',
            variant: 'primary',
          }),
        ]),
        node('preview-note', 'core.panel', { tone: 'soft', gap: '8' }, [
          node('preview-note-title', 'core.text', {
            text: '静态导出兜底页',
            variant: 'title',
          }),
          node('preview-note-body', 'core.text', {
            text: '当前页面为本地静态构建占位，当后端服务暂不可用时用于保障前端构建通过。',
            variant: 'caption',
          }),
        ]),
      ]),
    ],
  );

  return {
    layoutDocument: {
      version: 1,
      themeId: 'static-preview',
      themeName: '静态预览',
      pageName: '预览',
      description: '静态导出期间使用的纯前端预览页面。',
      components: PREVIEW_COMPONENTS,
      defaultPageId: 'preview',
      pages: [{ id: 'preview', name: '预览', layout }],
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

  const response = await fetch(`${BACKEND_URL}/api/public/sites/${encodeURIComponent(subdomain)}`, {
    cache: 'no-store',
  }).catch(() => null);

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
