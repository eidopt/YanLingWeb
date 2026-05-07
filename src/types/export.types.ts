export type ExportStatus = 'idle' | 'saving' | 'building' | 'done' | 'error';

export interface ExportState {
  status: ExportStatus;
  /** Absolute path to the output directory — Electron only */
  outputPath?: string;
  error?: string;
}

/** One file entry to be written to disk by the Electron main process */
export interface ExportFileEntry {
  /** Path relative to the project output directory, e.g. "src/App.tsx" */
  relativePath: string;
  content: string;
}

/** Payload sent to the Electron IPC handler */
export interface ExportBuildPayload {
  /** Slug-safe project name used as the output directory name */
  projectName: string;
  /** Serialized ThemeLayoutDocument JSON (merged from all canvases) */
  layoutJson: string;
  /** The active theme id, used to pick the correct runtime import */
  themeId: string;
}
