'use client';

import { exportDialogContent as content } from './ExportDialog.content';
import styles from './ExportDialog.module.css';
import { cx } from 'base/classname';
import { useState } from 'react';
import {
  buildExportPayload,
  downloadFile,
  serializeCanvases,
} from 'services/ExportService';
import type { ExportState } from 'types/export.types';
import type { BuilderCanvas } from 'ui/editor/types';
import type { LayoutBuilderTheme } from 'ui/editor/types';

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
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.dialog}
        onClick={(e) => e.stopPropagation()}
      >

        {/* Header */}
        <div className={styles.header}>
          <h2 className={styles.title}>{content.title}</h2>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label={content.close}
          >
            ✕
          </button>
        </div>

        {/* Project name */}
        <div className={styles.fieldRow}>
          <label
            className={styles.fieldLabel}
            htmlFor="export-project-name"
          >
            {content.projectNameLabel}
          </label>
          <input
            id="export-project-name"
            type="text"
            className={styles.fieldInput}
            value={projectName}
            placeholder={content.projectNamePlaceholder}
            onChange={(e) => setProjectName(e.target.value)}
          />
        </div>

        {/* Option: Save JSON */}
        <div className={styles.optionCard}>
          <div className={styles.optionHeader}>
            <h3 className={styles.optionTitle}>
              {content.saveJson.title}
            </h3>
          </div>
          <p className={styles.optionDescription}>
            {content.saveJson.description}
          </p>
          <div className={styles.optionFooter}>
            <button
              type="button"
              className={styles.actionButton}
              disabled={jsonState.status === 'saving'}
              onClick={handleSaveJson}
            >
              {isElectron
                ? content.saveJson.buttonElectron
                : content.saveJson.button}
            </button>
            {jsonState.status === 'done' && (
              <span
                className={cx(styles.statusMessage, styles.success)}
              >
                {content.saveJson.successMessage}
                {jsonState.outputPath
                  ? ` → ${jsonState.outputPath}`
                  : ''}
              </span>
            )}
            {jsonState.status === 'error' && (
              <span
                className={cx(styles.statusMessage, styles.error)}
              >
                {jsonState.error}
              </span>
            )}
          </div>
        </div>

        {/* Option: Build project */}
        <div className={styles.optionCard}>
          <div className={styles.optionHeader}>
            <h3 className={styles.optionTitle}>
              {content.buildProject.title}
            </h3>
            <span className={styles.badge}>
              {content.buildProject.badge}
            </span>
          </div>
          <p className={styles.optionDescription}>
            {content.buildProject.description}
          </p>
          <div className={styles.optionFooter}>
            {isElectron ? (
              <>
                <button
                  type="button"
                  className={styles.actionButton}
                  disabled={buildState.status === 'building'}
                  onClick={handleBuildProject}
                >
                  {buildState.status === 'building'
                    ? content.buildProject.building
                    : content.buildProject.button}
                </button>
                {buildState.status === 'done' && (
                  <>
                    <span
                      className={cx(styles.statusMessage, styles.success)}
                    >
                      {content.buildProject.successMessage(
                        buildState.outputPath ?? '',
                      )}
                    </span>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={handleOpenFolder}
                    >
                      {content.buildProject.openFolder}
                    </button>
                  </>
                )}
                {buildState.status === 'error' && (
                  <span
                    className={cx(styles.statusMessage, styles.error)}
                  >
                    {buildState.error}
                  </span>
                )}
              </>
            ) : (
              <p className={styles.unsupportedNote}>
                {content.buildProject.webUnsupported}
              </p>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
