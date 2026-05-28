import { applyVisualAssetsToLayoutDocument } from '@shared/theme-layout/visualAssets';
import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import type { ThemeLayoutDocument, ThemeLayoutDocumentSource } from 'ui/layout/types';
import { normalizeThemeLayoutDocument } from 'ui/layout/types';
import {
  DynamicThemeRenderer,
  type DynamicThemeScreenPreset,
  useDynamicThemeRendererController,
} from 'ui/renderer';
import type { ComponentTemplateMap } from 'ui/renderer/templateTypes';
import type { ThemeRuntime } from 'ui/renderer/types';

const TEMPLATES_API = '/templates_json';

export const PREVIEW_VIEWPORT = {
  mobile: { width: 375, height: 667 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1200, height: 800 },
} as const satisfies Record<DynamicThemeScreenPreset, { width: number; height: number }>;

interface TemplateJson {
  templateId?: string;
  name?: string;
  themeName?: string;
  cssVars?: Record<string, string>;
  cssAnimations?: Record<string, string> | null;
  visualAssets?: unknown[];
  componentTemplates?: Record<string, unknown>;
  layoutDocument?: ThemeLayoutDocumentSource;
}

interface PreviewTemplate {
  layoutDocument: ThemeLayoutDocument;
  runtime: ThemeRuntime;
}

interface Props {
  file: string;
  device: DynamicThemeScreenPreset;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asStringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => (
      typeof entry[1] === 'string'
    )),
  );
}

function toPreviewTemplate(raw: unknown): PreviewTemplate {
  if (!isRecord(raw)) {
    throw new Error('模板 JSON 必须是对象');
  }

  const template = raw as TemplateJson;
  const layoutDocumentSource = isRecord(template.layoutDocument)
    ? template.layoutDocument as unknown as ThemeLayoutDocumentSource
    : raw as unknown as ThemeLayoutDocumentSource;
  const layoutDocumentRecord = layoutDocumentSource as ThemeLayoutDocumentSource & {
    componentTemplates?: Record<string, unknown>;
  };

  if (!isRecord(layoutDocumentSource)) {
    throw new Error('模板缺少 layoutDocument');
  }

  const themeId = template.templateId
    ?? template.layoutDocument?.themeId
    ?? layoutDocumentSource.themeId
    ?? 'template-preview';

  const layoutDocumentWithAssets = applyVisualAssetsToLayoutDocument(
    layoutDocumentSource as unknown as Record<string, unknown>,
    template.visualAssets,
  ) as unknown as ThemeLayoutDocumentSource;

  return {
    layoutDocument: normalizeThemeLayoutDocument(layoutDocumentWithAssets),
    runtime: {
      id: themeId,
      cssVars: {
        ...asStringRecord(template.layoutDocument?.style?.cssVars),
        ...asStringRecord(template.layoutDocument?.cssVars),
        ...asStringRecord(template.cssVars),
      },
      componentTemplates: (
        template.componentTemplates
        ?? layoutDocumentRecord.componentTemplates
        ?? {}
      ) as ComponentTemplateMap,
      ...(template.cssAnimations || template.layoutDocument?.cssAnimations
        ? {
            cssAnimations: {
              ...asStringRecord(template.layoutDocument?.cssAnimations),
              ...asStringRecord(template.cssAnimations),
            },
          }
        : {}),
    },
  };
}

function TemplatePreviewRenderer({
  template,
  device,
}: {
  template: PreviewTemplate;
  device: DynamicThemeScreenPreset;
}) {
  const controller = useDynamicThemeRendererController({
    layoutDocument: template.layoutDocument,
    runtime: template.runtime,
    screenPreset: device,
  });

  return (
    <div
      style={template.runtime.cssVars}
      data-template-preview-renderer="true"
    >
      <DynamicThemeRenderer controller={controller} />
    </div>
  );
}

export function TemplatePreview({ file, device }: Props) {
  const [template, setTemplate] = useState<PreviewTemplate | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setTemplate(null);
    setError(null);

    fetch(`${TEMPLATES_API}/${encodeURIComponent(file)}`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.json() as Promise<unknown>;
      })
      .then((raw) => {
        if (!cancelled) {
          setTemplate(toPreviewTemplate(raw));
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [file]);

  const viewport = PREVIEW_VIEWPORT[device];
  const style = useMemo<CSSProperties>(() => ({
    width: viewport.width,
    height: viewport.height,
    overflow: 'auto',
    background: '#fff',
  }), [viewport.height, viewport.width]);

  if (error) {
    return (
      <div style={{ padding: 20, color: '#c2410c', fontSize: 13 }}>
        加载失败: {error}
      </div>
    );
  }

  if (!template) {
    return (
      <div style={{ padding: 20, color: '#64748b', fontSize: 13 }}>
        加载中...
      </div>
    );
  }

  return (
    <div style={style}>
      <TemplatePreviewRenderer template={template} device={device} />
    </div>
  );
}
