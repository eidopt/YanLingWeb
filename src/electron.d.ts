import type { ExportBuildPayload } from './types/export.types';

export interface ElectronBridge {
  platform: 'electron';
  exportSaveJson: (filename: string, content: string) => Promise<string>;
  exportBuildProject: (payload: ExportBuildPayload) => Promise<string>;
  exportOpenFolder: (folderPath: string) => Promise<void>;
}

declare global {
  interface Window {
    electronBridge?: ElectronBridge;
  }
}
