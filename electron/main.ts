import { generateScaffoldFiles } from '../src/services/ExportService';
import type { ExportBuildPayload } from '../src/types/export.types';
import { spawn } from 'child_process';
import { app, BrowserWindow, ipcMain, shell } from 'electron';
import fs from 'fs/promises';
import net from 'net';
import path from 'path';

const isDev = !app.isPackaged;

// ── Directory paths ──────────────────────────────────────────────────────────
// PROJECT_ROOT: the ai-app source root, used to locate node_modules and src/.
const PROJECT_ROOT = isDev ? path.join(__dirname, '..') : app.getAppPath();

const OUTPUT_DIR = isDev ? path.join(PROJECT_ROOT, 'output') : path.join(app.getPath('documents'), 'ai-app-exports');

const SRC_DIR = path.join(PROJECT_ROOT, 'src');

// ── Port helpers ──────────────────────────────────────────────────────────────

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port, '127.0.0.1');
  });
}

async function findFreePort(preferred: number): Promise<number> {
  for (let port = preferred; port < preferred + 100; port++) {
    if (await isPortFree(port)) {
      return port;
    }
  }
  throw new Error('No free port found');
}

function waitForPort(port: number, timeout = 30_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeout;
    const check = () => {
      const socket = net.createConnection({ port, host: '127.0.0.1' });
      socket.once('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() > deadline) {
          reject(new Error(`Port ${port} did not open in ${timeout}ms`));
        } else {
          setTimeout(check, 300);
        }
      });
    };
    check();
  });
}

// ── Next.js server (production only) ─────────────────────────────────────────

let nextServerProcess: ReturnType<typeof spawn> | null = null;

async function startNextServer(): Promise<number> {
  const port = await findFreePort(3000);
  // Standalone server is packed into resources/server/ by electron-builder
  const serverDir = path.join(process.resourcesPath, 'server');
  const serverScript = path.join(serverDir, 'server.js');

  nextServerProcess = spawn(process.execPath, [serverScript], {
    cwd: serverDir,
    env: {
      ...process.env,
      PORT: String(port),
      HOSTNAME: '127.0.0.1',
      NODE_ENV: 'production',
    },
    stdio: 'ignore',
  });

  await waitForPort(port);
  return port;
}

// ── Window ────────────────────────────────────────────────────────────────────

async function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    titleBarStyle: 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev) {
    void win.loadURL('http://localhost:3000');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    const port = await startNextServer();
    void win.loadURL(`http://localhost:${port}`);
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });
}

void app.whenReady().then(async () => {
  registerExportHandlers();
  await createWindow();
});

app.on('window-all-closed', () => {
  nextServerProcess?.kill();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  nextServerProcess?.kill();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow();
  }
});

// ── Export IPC handlers ──────────────────────────────────────────────────────

function registerExportHandlers() {
  // Ensure the output directory exists on startup
  void fs.mkdir(OUTPUT_DIR, { recursive: true }).catch((_err: unknown) => {
    /* noop: directory may already exist */
  });

  /**
   * export:saveJson
   * Writes the layout.json to output/<filename>.
   * Returns the absolute path of the saved file.
   */
  ipcMain.handle('export:saveJson', async (_event, filename: string, content: string) => {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    const filePath = path.join(OUTPUT_DIR, filename);
    await fs.writeFile(filePath, content, 'utf-8');
    return filePath;
  });

  /**
   * export:buildProject
   * Full one-click build pipeline:
   *   1. Write scaffold files to output/<projectName>/
   *   2. Replace the __SRC_DIR__ placeholder in vite.config.ts
   *   3. Run `vite build` inside the scaffold directory
   *   4. Return the absolute path to the dist/ output
   */
  ipcMain.handle('export:buildProject', async (_event, payload: ExportBuildPayload) => {
    const { projectName, layoutJson, themeId, runtimeCssVars, runtimeCssAnimations } = payload;
    const projectDir = path.join(OUTPUT_DIR, projectName);

    // 1. Generate and write scaffold files
    const files = generateScaffoldFiles(layoutJson, themeId, projectName, runtimeCssVars, runtimeCssAnimations);
    for (const file of files) {
      const filePath = path.join(projectDir, file.relativePath);
      await fs.mkdir(path.dirname(filePath), { recursive: true });

      // Replace __SRC_DIR__ placeholder with the real absolute path
      const fileContent = file.content.replace(/__SRC_DIR__/g, SRC_DIR.replace(/\\/g, '/'));
      await fs.writeFile(filePath, fileContent, 'utf-8');
    }

    // 2. Run vite build inside the scaffold directory.
    // We use `ELECTRON_RUN_AS_NODE=1` + the Electron binary to invoke the
    // vite CLI script — this avoids depending on a system-level `node`.
    const viteScript = path.join(PROJECT_ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
    await runScript(viteScript, ['build'], projectDir);

    const distDir = path.join(projectDir, 'dist');
    return distDir;
  });

  /**
   * export:openFolder
   * Opens a directory in Finder / Explorer.
   */
  ipcMain.handle('export:openFolder', async (_event, folderPath: string) => {
    await shell.openPath(folderPath);
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Runs a Node.js script using the Electron binary in Node mode.
 * `ELECTRON_RUN_AS_NODE=1` makes Electron behave like a plain Node.js
 * process, so we don't need a separate system Node installation.
 */
function runScript(scriptPath: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [scriptPath, ...args], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        FORCE_COLOR: '0',
      },
    });

    let stderr = '';
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr.trim() || `Process exited with code ${code}`));
      }
    });

    proc.on('error', reject);
  });
}
