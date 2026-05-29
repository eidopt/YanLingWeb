import { applyVisualAssetsToLayoutDocument } from '@shared/theme-layout/visualAssets';
import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import type { ThemeLayoutDocument, ThemeLayoutDocumentSource } from 'ui/layout/types';
import { normalizeThemeLayoutDocument } from 'ui/layout/types';
import { DynamicThemeRenderer, type DynamicThemeScreenPreset, useDynamicThemeRendererController } from 'ui/renderer';
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

interface TemplatePreviewState {
  file: string;
  template: PreviewTemplate | null;
  error: string | null;
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
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
}

function isThemeLayoutDocumentSource(value: unknown): value is ThemeLayoutDocumentSource {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.version === 'number' &&
    typeof value.themeId === 'string' &&
    typeof value.themeName === 'string' &&
    typeof value.description === 'string' &&
    Array.isArray(value.components) &&
    (Array.isArray(value.pages) || isRecord(value.layout))
  );
}

function toPreviewTemplate(raw: unknown): PreviewTemplate {
  if (!isRecord(raw)) {
    throw new Error('Template JSON must be an object.');
  }

  const template = raw as TemplateJson;
  const layoutDocumentSource = isRecord(template.layoutDocument) ? template.layoutDocument : raw;
  if (!isThemeLayoutDocumentSource(layoutDocumentSource)) {
    throw new Error('Template layoutDocument is incomplete.');
  }

  const layoutDocumentWithAssetsRecord = applyVisualAssetsToLayoutDocument(layoutDocumentSource, template.visualAssets);
  if (!isThemeLayoutDocumentSource(layoutDocumentWithAssetsRecord)) {
    throw new Error('Template layoutDocument became invalid after applying visualAssets.');
  }

  const layoutDocumentRecord = layoutDocumentSource as ThemeLayoutDocumentSource & {
    componentTemplates?: Record<string, unknown>;
  };
  const themeId = template.templateId ?? template.layoutDocument?.themeId ?? layoutDocumentSource.themeId;

  return {
    layoutDocument: normalizeThemeLayoutDocument(layoutDocumentWithAssetsRecord),
    runtime: {
      id: themeId,
      cssVars: {
        ...asStringRecord(template.layoutDocument?.style?.cssVars),
        ...asStringRecord(template.layoutDocument?.cssVars),
        ...asStringRecord(template.cssVars),
      },
      componentTemplates: (template.componentTemplates ??
        layoutDocumentRecord.componentTemplates ??
        {}) as ComponentTemplateMap,
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
    <div style={template.runtime.cssVars} data-template-preview-renderer="true">
      <DynamicThemeRenderer controller={controller} />
    </div>
  );
}

export function TemplatePreview({ file, device }: Props) {
  const [state, setState] = useState<TemplatePreviewState>({
    file,
    template: null,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    fetch(`${TEMPLATES_API}/${encodeURIComponent(file)}`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.json() as Promise<unknown>;
      })
      .then((raw) => {
        if (!cancelled) {
          setState({
            file,
            template: toPreviewTemplate(raw),
            error: null,
          });
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setState({
            file,
            template: null,
            error: reason instanceof Error ? reason.message : String(reason),
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [file]);

  const viewport = PREVIEW_VIEWPORT[device];
  const style = useMemo<CSSProperties>(
    () => ({
      width: viewport.width,
      height: viewport.height,
      overflow: 'auto',
      background: '#fff',
    }),
    [viewport.height, viewport.width],
  );
  const template = state.file === file ? state.template : null;
  const error = state.file === file ? state.error : null;

  if (error) {
    return <div style={{ padding: 20, color: '#c2410c', fontSize: 13 }}>Load failed: {error}</div>;
  }

  if (!template) {
    return <div style={{ padding: 20, color: '#64748b', fontSize: 13 }}>Loading...</div>;
  }

  return (
    <div style={style}>
      <TemplatePreviewRenderer template={template} device={device} />
    </div>
  );
}
