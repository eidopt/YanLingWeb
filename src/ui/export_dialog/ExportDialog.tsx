'use client';

import { exportDialogContent as content } from './ExportDialog.content';
import styles from './ExportDialog.module.css';
import { useAppServices } from 'hooks/useAppServices';
import { useMemo, useState } from 'react';
import {
  buildExportPayload,
  downloadFile,
  serializeCanvases,
} from 'services/ExportService';
import type { ExportState } from 'types/export.types';
import {
  Box,
  Button,
  Heading,
  Inline,
  Input,
  Label,
  Stack,
  Text,
} from 'ui/base';
import type {
  BuilderCanvas,
  LayoutBuilderTheme,
} from 'ui/editor/types';

interface ExportDialogProps {
  canvases: BuilderCanvas[];
  activeTheme: LayoutBuilderTheme;
  defaultProjectName: string;
  onClose: () => void;
}

interface PublishResponse {
  site?: {
    subdomain?: string;
  };
}

const isElectron = (
  typeof window !== 'undefined' &&
  window.electronBridge?.platform === 'electron'
);

function toSubdomain(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 63)
    .replace(/-+$/g, '') || `site-${Date.now().toString(36)}`;
}

export function ExportDialog({
  canvases,
  activeTheme,
  defaultProjectName,
  onClose,
}: ExportDialogProps) {
  const { authService } = useAppServices();
  const initialProjectName = defaultProjectName.trim() || 'my-design';
  const [projectName, setProjectName] = useState(initialProjectName);
  const [subdomain, setSubdomain] = useState(() =>
    toSubdomain(initialProjectName),
  );
  const [publishState, setPublishState] = useState<ExportState>(
    { status: 'idle' },
  );
  const [jsonState, setJsonState] = useState<ExportState>(
    { status: 'idle' },
  );
  const [buildState, setBuildState] = useState<ExportState>(
    { status: 'idle' },
  );
  const publicPath = useMemo(
    () => publishState.outputPath ?? '',
    [publishState.outputPath],
  );

  async function handlePublishOnline() {
    const token = authService.getToken();
    if (!token) {
      setPublishState({
        status: 'error',
        error: content.errors.missingToken,
      });
      return;
    }

    setPublishState({ status: 'publishing' });
    try {
      const response = await fetch('/api/proxy/sites', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          templateId: activeTheme.id,
          subdomain: toSubdomain(subdomain),
        }),
      });
      const data = await response.json().catch(() => ({})) as
        PublishResponse & { message?: string };
      if (!response.ok) {
        throw new Error(data.message ?? `HTTP ${response.status}`);
      }
      const publishedSubdomain = data.site?.subdomain ?? toSubdomain(subdomain);
      setPublishState({
        status: 'done',
        outputPath: `/sites/${publishedSubdomain}`,
      });
    } catch (err) {
      setPublishState({
        status: 'error',
        error: content.errors.publishFailed(
          err instanceof Error ? err.message : String(err),
        ),
      });
    }
  }

  async function handleSaveJson() {
    if (!canvases.length) {
      setJsonState({
        status: 'error',
        error: content.errors.noCanvases,
      });
      return;
    }

    setJsonState({ status: 'saving' });

    try {
      const layoutJson = serializeCanvases(
        canvases,
        projectName,
        activeTheme.runtime.cssVars,
      );
      const filename = `${projectName}-layout.json`;

      if (isElectron && window.electronBridge?.exportSaveJson) {
        const outputPath = await window.electronBridge.exportSaveJson(
          filename,
          layoutJson,
        );
        setJsonState({ status: 'done', outputPath });
      } else {
        downloadFile(filename, layoutJson);
        setJsonState({ status: 'done' });
      }
    } catch (err) {
      setJsonState({ status: 'error', error: String(err) });
    }
  }

  async function handleBuildProject() {
    if (!canvases.length) {
      setBuildState({
        status: 'error',
        error: content.errors.noCanvases,
      });
      return;
    }

    const payload = buildExportPayload(
      canvases,
      activeTheme.id,
      projectName,
      activeTheme.runtime.cssVars,
    );

    setBuildState({ status: 'building' });

    try {
      if (isElectron && window.electronBridge?.exportBuildProject) {
        const outputPath = await window.electronBridge.exportBuildProject(
          payload,
        );
        setBuildState({ status: 'done', outputPath });
        return;
      }

      const response = await fetch('/api/export/build-project', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({})) as {
        distDir?: string;
        message?: string;
      };
      if (!response.ok) {
        throw new Error(data.message ?? `HTTP ${response.status}`);
      }
      setBuildState({ status: 'done', outputPath: data.distDir });
    } catch (err) {
      setBuildState({
        status: 'error',
        error: content.errors.buildFailed(
          err instanceof Error ? err.message : String(err),
        ),
      });
    }
  }

  async function handleOpenFolder() {
    const path = buildState.outputPath;
    if (path) {
      await window.electronBridge?.exportOpenFolder(path);
    }
  }

  return (
    <Inline
      className={styles.overlay}
      justify="center"
      onClick={onClose}
      wrap={false}
    >
      <Stack
        className={styles.dialog}
        gap="u2-5"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <Inline className={styles.header} justify="space-between">
          <Heading
            id="export-dialog-title"
            size="xs"
            variant="primary"
            weight="medium"
          >
            {content.title}
          </Heading>
          <Button
            type="button"
            onClick={onClose}
            aria-label={content.close}
            size="icon-sm"
            variant="icon"
          >
            x
          </Button>
        </Inline>

        <Stack className={styles.fieldRow} gap="u0-75">
          <Label className={styles.fieldLabel} htmlFor="export-project-name">
            {content.projectNameLabel}
          </Label>
          <Input
            id="export-project-name"
            type="text"
            size="sm"
            variant="filled"
            value={projectName}
            placeholder={content.projectNamePlaceholder}
            onChange={(e) => setProjectName(e.target.value)}
          />
        </Stack>

        <Stack className={styles.fieldRow} gap="u0-75">
          <Label className={styles.fieldLabel} htmlFor="export-subdomain">
            {content.subdomainLabel}
          </Label>
          <Input
            id="export-subdomain"
            type="text"
            size="sm"
            variant="filled"
            value={subdomain}
            placeholder={content.subdomainPlaceholder}
            onChange={(e) => setSubdomain(e.target.value)}
          />
        </Stack>

        <Stack className={styles.optionCard} gap="u1-5">
          <Heading as="h3" size="xs" variant="primary" weight="medium">
            {content.publishOnline.title}
          </Heading>
          <Text size="xs" variant="muted">
            {content.publishOnline.description}
          </Text>
          <Inline className={styles.optionFooter} gap="u1-5">
            <Button
              type="button"
              disabled={publishState.status === 'publishing'}
              onClick={handlePublishOnline}
              size="sm"
              variant="primary"
            >
              {publishState.status === 'publishing'
                ? content.publishOnline.publishing
                : content.publishOnline.button}
            </Button>
            {publishState.status === 'done' && publicPath && (
              <Box as="span" className={styles.statusMessage}>
                <Text as="span" size="xs" variant="success">
                  {content.publishOnline.successMessage(publicPath)}
                </Text>
              </Box>
            )}
            {publishState.status === 'error' && (
              <Box as="span" className={styles.statusMessage}>
                <Text as="span" size="xs" variant="danger">
                  {publishState.error}
                </Text>
              </Box>
            )}
          </Inline>
        </Stack>

        <Stack className={styles.optionCard} gap="u1-5">
          <Inline className={styles.optionHeader} gap="sm">
            <Heading as="h3" size="xs" variant="primary" weight="medium">
              {content.sourceExport.title}
            </Heading>
            <Box as="span" className={styles.badge}>
              <Text as="span" size="xs" variant="accent" weight="bold">
                {content.sourceExport.badge}
              </Text>
            </Box>
          </Inline>
          <Text size="xs" variant="muted">
            {content.sourceExport.description}
          </Text>
          <Inline className={styles.optionFooter} gap="u1-5">
            <Button
              type="button"
              disabled={buildState.status === 'building'}
              onClick={handleBuildProject}
              size="sm"
              variant="primary"
            >
              {buildState.status === 'building'
                ? content.sourceExport.building
                : content.sourceExport.button}
            </Button>
            {buildState.status === 'done' && (
              <>
                <Box as="span" className={styles.statusMessage}>
                  <Text as="span" size="xs" variant="success">
                    {content.sourceExport.successMessage(
                      buildState.outputPath ?? '',
                    )}
                  </Text>
                </Box>
                {isElectron && (
                  <Button
                    type="button"
                    onClick={handleOpenFolder}
                    size="sm"
                    variant="outline"
                  >
                    {content.sourceExport.openFolder}
                  </Button>
                )}
              </>
            )}
            {buildState.status === 'error' && (
              <Box as="span" className={styles.statusMessage}>
                <Text as="span" size="xs" variant="danger">
                  {buildState.error}
                </Text>
              </Box>
            )}
          </Inline>
        </Stack>

        <Stack className={styles.optionCard} gap="u1-5">
          <Heading as="h3" size="xs" variant="primary" weight="medium">
            {content.saveJson.title}
          </Heading>
          <Text size="xs" variant="muted">
            {content.saveJson.description}
          </Text>
          <Inline className={styles.optionFooter} gap="u1-5">
            <Button
              type="button"
              disabled={jsonState.status === 'saving'}
              onClick={handleSaveJson}
              size="sm"
              variant="outline"
            >
              {isElectron
                ? content.saveJson.buttonElectron
                : content.saveJson.button}
            </Button>
            {jsonState.status === 'done' && (
              <Box as="span" className={styles.statusMessage}>
                <Text as="span" size="xs" variant="success">
                  {content.saveJson.successMessage}
                  {jsonState.outputPath ? ` -> ${jsonState.outputPath}` : ''}
                </Text>
              </Box>
            )}
            {jsonState.status === 'error' && (
              <Box as="span" className={styles.statusMessage}>
                <Text as="span" size="xs" variant="danger">
                  {jsonState.error}
                </Text>
              </Box>
            )}
          </Inline>
        </Stack>
      </Stack>
    </Inline>
  );
}
