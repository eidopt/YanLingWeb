import { spawn } from 'child_process';
import fs from 'fs/promises';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import path from 'path';
import { collectTemplateAssetPaths, generateScaffoldFiles } from 'services/ExportService';
import type { ExportBuildPayload } from 'types/export.types';

const OUTPUT_DIR = path.join(process.cwd(), 'output', 'react-source-exports');

export async function POST(req: NextRequest) {
  const payload = (await req.json()) as ExportBuildPayload;
  const { projectName, layoutJson, themeId, runtimeCssVars, runtimeCssAnimations } = payload;
  const projectDir = path.join(OUTPUT_DIR, projectName);

  const files = generateScaffoldFiles(layoutJson, themeId, projectName, runtimeCssVars, runtimeCssAnimations);
  for (const file of files) {
    const filePath = path.join(projectDir, file.relativePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, file.content, 'utf-8');
  }

  // 把模板引用的 /template-assets/* 本地图片拷进导出项目的 public/，
  // Vite 会原样打包到 dist/，让独立项目里的 /template-assets/... 绝对 URL 照常解析。
  const assetResult = await copyTemplateAssets(layoutJson, projectDir);

  const distDir = await runViteBuild(projectDir);
  return NextResponse.json({ distDir, assets: assetResult });
}

async function copyTemplateAssets(
  layoutJson: string,
  projectDir: string,
): Promise<{ copied: number; missing: string[] }> {
  const sourcePublic = path.join(process.cwd(), 'public');
  const missing: string[] = [];
  let copied = 0;
  for (const assetUrl of collectTemplateAssetPaths(layoutJson)) {
    const relative = assetUrl.replace(/^\/+/, '');
    const srcPath = path.join(sourcePublic, relative);
    const destPath = path.join(projectDir, 'public', relative);
    try {
      await fs.mkdir(path.dirname(destPath), { recursive: true });
      await fs.copyFile(srcPath, destPath);
      copied += 1;
    } catch {
      // 源图缺失（如还没 materialize）就跳过，不阻断构建，记录下来回报。
      missing.push(assetUrl);
    }
  }
  return { copied, missing };
}

function runViteBuild(projectDir: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const viteScript = path.join(process.cwd(), 'node_modules', 'vite', 'bin', 'vite.js');
    const proc = spawn(process.execPath, [viteScript, 'build'], {
      cwd: projectDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

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
