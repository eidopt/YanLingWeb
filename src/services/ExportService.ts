import { renderSmokeThemeLayoutDocument, validateThemeLayoutDocument } from '@shared/agent/contracts/validation';
import { migrateThemeLayoutDocument } from '@shared/theme-layout/migrations';
import { withThemeLayoutStyleManifest } from '@shared/theme-layout/styleManifest';
import { compileDocumentToReactProject } from 'exporters/react-source';
import type { ExportBuildPayload } from 'types/export.types';
import type { BuilderCanvas } from 'ui/editor/types';
import type { ThemeLayoutDocumentSource } from 'ui/layout/types';

/**
 * Merges all canvases (pages) of the current editor session into a
 * single multi-page ThemeLayoutDocument and returns it as a JSON string.
 */
export function serializeCanvases(
  canvases: BuilderCanvas[],
  projectName: string,
  runtimeCssVars?: Record<string, string>,
  runtimeCssAnimations?: Record<string, string>,
): string {
  if (canvases.length === 0) {
    throw new Error('No canvases to export.');
  }
  const first = canvases[0];

  const pages = canvases.map((canvas) => ({
    id: canvas.document.defaultPageId,
    name: canvas.name || (canvas.document.pageName ?? '') || canvas.document.defaultPageId,
    layout: canvas.document.layout,
  }));

  const merged: ThemeLayoutDocumentSource = withThemeLayoutStyleManifest(
    {
      ...first.document,
      pageName: projectName,
      pages,
      defaultPageId: pages[0].id,
      layout: pages[0].layout,
      cssAnimations: runtimeCssAnimations ?? first.document.cssAnimations,
    },
    runtimeCssVars,
  );

  return JSON.stringify(merged, null, 2);
}

export function buildExportPayload(
  canvases: BuilderCanvas[],
  themeId: string,
  projectName: string,
  runtimeCssVars?: Record<string, string>,
  runtimeCssAnimations?: Record<string, string>,
): ExportBuildPayload {
  return {
    projectName: slugify(projectName),
    layoutJson: serializeCanvases(canvases, projectName, runtimeCssVars, runtimeCssAnimations),
    themeId,
    runtimeCssVars,
    runtimeCssAnimations,
  };
}

/** Triggers a file download in the browser (web build, no Electron). */
export function downloadFile(filename: string, content: string, mimeType = 'application/json') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function prepareSourceExportDocument(layoutJson: string): ThemeLayoutDocumentSource {
  const migrated = migrateThemeLayoutDocument(JSON.parse(layoutJson));
  const validation = validateThemeLayoutDocument(migrated, {
    componentTemplates: migrated.componentTemplates,
    failOnUnknownProps: true,
  });
  if (!validation.valid) {
    throw new Error(
      `Layout validation failed before source export: ${validation.errors
        .map((error) => `${error.path}: ${error.message}`)
        .join('; ')}`,
    );
  }

  const smoke = renderSmokeThemeLayoutDocument(migrated);
  if (!smoke.passed) {
    throw new Error(`Render smoke failed before source export: ${smoke.errors.join('; ')}`);
  }

  return migrated;
}

export function generateScaffoldFiles(
  layoutJson: string,
  _themeId: string,
  projectName: string,
  runtimeCssVars?: Record<string, string>,
  runtimeCssAnimations?: Record<string, string>,
): { relativePath: string; content: string }[] {
  const document = prepareSourceExportDocument(layoutJson);
  return compileDocumentToReactProject(document, {
    projectName,
    runtimeCssVars,
    runtimeCssAnimations,
  });
}

/**
 * 收集 layoutJson 中所有引用了 `/template-assets/...` 的本地图片路径（去重）。
 * 遍历整个文档的字符串值，覆盖 core.image.src、avatar.src、carousel.images、
 * visualAssets[].url 等任意位置。导出时据此把这些图拷进打包项目的 public/，
 * 让相对 URL 在用户下载的独立项目里照常解析（否则图全裂）。
 * 纯函数、无 fs，便于测试；实际拷贝由 build-project 路由完成。
 */
export function collectTemplateAssetPaths(layoutJson: string): string[] {
  const found = new Set<string>();
  const visit = (value: unknown): void => {
    if (typeof value === 'string') {
      if (value.startsWith('/template-assets/')) {
        found.add(value);
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value && typeof value === 'object') {
      Object.values(value).forEach(visit);
    }
  };
  try {
    visit(JSON.parse(layoutJson));
  } catch {
    // layoutJson 解析失败时返回空列表，交给后续 scaffold 校验报错。
  }
  return [...found];
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[\u4e00-\u9fa5\s]+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'export'
  );
}
