import { spawn } from 'child_process';
import fs from 'fs/promises';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import os from 'os';
import path from 'path';
import { generateScaffoldFiles } from 'services/ExportService';
import type { ExportBuildPayload } from 'types/export.types';

const OUTPUT_DIR = path.join(os.homedir(), 'Documents', 'ai-app-exports');
const SRC_DIR = path.join(process.cwd(), 'src');

export async function POST(req: NextRequest) {
  const payload = await req.json() as ExportBuildPayload;
  const { projectName, layoutJson, themeId } = payload;
  const projectDir = path.join(OUTPUT_DIR, projectName);

  const files = generateScaffoldFiles(layoutJson, themeId, projectName);
  for (const file of files) {
    const filePath = path.join(projectDir, file.relativePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const fileContent = file.content.replace(/__SRC_DIR__/g, SRC_DIR.replace(/\\/g, '/'));
    await fs.writeFile(filePath, fileContent, 'utf-8');
  }

  const distDir = await runViteBuild(projectDir);
  return NextResponse.json({ distDir });
}

function runViteBuild(projectDir: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const viteScript = path.join(process.cwd(), 'node_modules', 'vite', 'bin', 'vite.js');
    const proc = spawn(process.execPath, [viteScript, 'build'], {
      cwd: projectDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- stderr may be null depending on spawn stdio config
    proc.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(path.join(projectDir, 'dist'));
      } else {
        reject(new Error(stderr.trim() || `Process exited with code ${code}`));
      }
    });

    proc.on('error', reject);
  });
}
