'use client';

import { exportDialogContent as content } from './ExportDialog.content';
import styles from './ExportDialog.module.css';
import { useState } from 'react';
import {
  buildExportPayload,
  downloadFile,
  serializeCanvases,
} from 'services/ExportService';
import type { ExportState } from 'types/export.types';
import type { BuilderCanvas } from 'ui/editor/types';
import type { LayoutBuilderTheme } from 'ui/editor/types';
import {
  Box,
  Button,
  Heading,
  Inline,
  Input,
  Label,
  Stack,
  Text,
} from 'ui/system';

interface ExportDialogProps {
  canvases: BuilderCanvas[];
  activeTheme: LayoutBuilderTheme;
  defaultProjectName: string;
  onClose: () => void;
}

const isElectron = (
  typeof window !== 'undefined' &&
  window.electronBridge?.platform === 'electron'
);

export function ExportDialog({
  canvases,
  activeTheme,
  defaultProjectName,
  onClose,
}: ExportDialogProps) {
  const [projectName, setProjectName] = useState(
    defaultProjectName.trim() || 'my-design',
  );
  const [jsonState, setJsonState] = useState<ExportState>(
    { status: 'idle' },
  );
  const [buildState, setBuildState] = useState<ExportState>(
    { status: 'idle' },
  );

  // ── Save layout JSON ──────────────────────────────────────────────────

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
      const layoutJson = serializeCanvases(canvases, projectName);
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

  // ── Build & export project (Electron only) ────────────────────────────

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
    );
    if (!payload) {
      setBuildState({
        status: 'error',
        error: content.errors.unknownTheme,
      });
      return;
    }

    setBuildState({ status: 'building' });

    try {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- only reachable in Electron context where bridge is guaranteed
      const outputPath = await window.electronBridge!.exportBuildProject(
        payload,
      );
      setBuildState({ status: 'done', outputPath });
    } catch (err) {
      setBuildState({
        status: 'error',
        error: content.errors.buildFailed(String(err)),
      });
    }
  }

  async function handleOpenFolder() {
    const path = buildState.outputPath;
    if (path) {
      await window.electronBridge?.exportOpenFolder(path);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────

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

        {/* Header */}
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
            ✕
          </Button>
        </Inline>

        {/* Project name */}
        <Stack className={styles.fieldRow} gap="u0-75">
          <Label
            className={styles.fieldLabel}
            htmlFor="export-project-name"
          >
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

        {/* Option: Save JSON */}
        <Stack className={styles.optionCard} gap="u1-5">
          <Inline className={styles.optionHeader} gap="sm">
            <Heading as="h3" size="xs" variant="primary" weight="medium">
              {content.saveJson.title}
            </Heading>
          </Inline>
          <Text size="xs" variant="muted">
            {content.saveJson.description}
          </Text>
          <Inline className={styles.optionFooter} gap="u1-5">
            <Button
              type="button"
              disabled={jsonState.status === 'saving'}
              onClick={handleSaveJson}
              size="sm"
              variant="primary"
            >
              {isElectron
                ? content.saveJson.buttonElectron
                : content.saveJson.button}
            </Button>
            {jsonState.status === 'done' && (
              <Box as="span" className={styles.statusMessage}>
                <Text as="span" size="xs" variant="success">
                  {content.saveJson.successMessage}
                  {jsonState.outputPath
                    ? ` → ${jsonState.outputPath}`
                    : ''}
                </Text>
              </Box>
            )}
            {jsonState.status === 'error' && (
              <Box as="span" className={styles.statusMessage}>
                <Text as="span" size="xs" variant="danger">{jsonState.error}</Text>
              </Box>
            )}
          </Inline>
        </Stack>

        {/* Option: Build project */}
        <Stack className={styles.optionCard} gap="u1-5">
          <Inline className={styles.optionHeader} gap="sm">
            <Heading as="h3" size="xs" variant="primary" weight="medium">
              {content.buildProject.title}
            </Heading>
            <Box as="span" className={styles.badge}>
              <Text as="span" size="xs" variant="accent" weight="bold">
                {content.buildProject.badge}
              </Text>
            </Box>
          </Inline>
          <Text size="xs" variant="muted">
            {content.buildProject.description}
          </Text>
          <Inline className={styles.optionFooter} gap="u1-5">
            {isElectron ? (
              <>
                <Button
                  type="button"
                  disabled={buildState.status === 'building'}
                  onClick={handleBuildProject}
                  size="sm"
                  variant="primary"
                >
                  {buildState.status === 'building'
                    ? content.buildProject.building
                    : content.buildProject.button}
                </Button>
                {buildState.status === 'done' && (
                  <>
                    <Box as="span" className={styles.statusMessage}>
                      <Text as="span" size="xs" variant="success">
                        {content.buildProject.successMessage(
                          buildState.outputPath ?? '',
                        )}
                      </Text>
                    </Box>
                    <Button
                      type="button"
                      onClick={handleOpenFolder}
                      size="sm"
                      variant="outline"
                    >
                      {content.buildProject.openFolder}
                    </Button>
                  </>
                )}
                {buildState.status === 'error' && (
                  <Box as="span" className={styles.statusMessage}>
                    <Text as="span" size="xs" variant="danger">{buildState.error}</Text>
                  </Box>
                )}
              </>
            ) : (
              <Text as="em" size="xs" variant="faint">
                {content.buildProject.webUnsupported}
              </Text>
            )}
          </Inline>
        </Stack>

      </Stack>
    </Inline>
  );
}
