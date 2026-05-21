import {
  renderSmokeThemeLayoutDocument,
  validateThemeLayoutDocument,
} from '@shared/agent/validation/themeLayoutValidator';
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
): string {
  const first = canvases[0];
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive guard; array may be empty at runtime
  if (!first) {throw new Error('No canvases to export.');}

  const pages = canvases.map((canvas) => ({
    id: canvas.document.defaultPageId,
    /* eslint-disable @typescript-eslint/prefer-nullish-coalescing -- empty string should fall through */
    name: (
      canvas.name ||
      canvas.document.pageName ||
      canvas.document.defaultPageId
    ),
    /* eslint-enable @typescript-eslint/prefer-nullish-coalescing */
    layout: canvas.document.layout,
  }));

  const merged: ThemeLayoutDocumentSource = withThemeLayoutStyleManifest({
    ...first.document,
    pageName: projectName,
    pages,
    defaultPageId: pages[0].id,
    layout: pages[0].layout,
  }, runtimeCssVars);

  return JSON.stringify(merged, null, 2);
}

export function buildExportPayload(
  canvases: BuilderCanvas[],
  themeId: string,
  projectName: string,
  runtimeCssVars?: Record<string, string>,
): ExportBuildPayload {
  return {
    projectName: slugify(projectName),
    layoutJson: serializeCanvases(canvases, projectName, runtimeCssVars),
    themeId,
    runtimeCssVars,
  };
}

/** Triggers a file download in the browser (web build, no Electron). */
export function downloadFile(
  filename: string,
  content: string,
  mimeType = 'application/json',
) {
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
    throw new Error(
      `Render smoke failed before source export: ${smoke.errors.join('; ')}`,
    );
  }

  return migrated;
}

export function generateScaffoldFiles(
  layoutJson: string,
  _themeId: string,
  projectName: string,
  runtimeCssVars?: Record<string, string>,
): { relativePath: string; content: string }[] {
  const document = prepareSourceExportDocument(layoutJson);
  return compileDocumentToReactProject(document, {
    projectName,
    runtimeCssVars,
  });
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
