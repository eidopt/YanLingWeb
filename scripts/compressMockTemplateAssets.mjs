/**
 * 将 mock/assets 下的 PNG 转为 AVIF（体积更小），并改写 mock/*.json 中的引用路径。
 *
 * 用法：pnpm mock:compress-assets
 * 环境变量：MOCK_AVIF_QUALITY（默认 52）、MOCK_AVIF_EFFORT（默认 4）
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MOCK_DIR = path.join(ROOT, 'mock');
const ASSETS_DIR = path.join(MOCK_DIR, 'assets');

const QUALITY = Number(process.env.MOCK_AVIF_QUALITY ?? 52);
const EFFORT = Number(process.env.MOCK_AVIF_EFFORT ?? 4);

async function loadSharp() {
  const mod = await import('sharp');
  return mod.default;
}

function collectPngFiles(directory) {
  const files = [];
  if (!fs.existsSync(directory)) {
    return files;
  }
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectPngFiles(fullPath));
    } else if (entry.name.toLowerCase().endsWith('.png')) {
      files.push(fullPath);
    }
  }
  return files;
}

function rewriteMockJsonPaths(replacements) {
  if (!replacements.length || !fs.existsSync(MOCK_DIR)) {
    return 0;
  }

  let updatedFiles = 0;
  for (const entry of fs.readdirSync(MOCK_DIR, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.json') || entry.name.includes('.validation.')) {
      continue;
    }
    const filePath = path.join(MOCK_DIR, entry.name);
    let content = fs.readFileSync(filePath, 'utf8');
    let changed = false;

    for (const { from, to } of replacements) {
      if (content.includes(from)) {
        content = content.split(from).join(to);
        changed = true;
      }
    }

    if (changed) {
      fs.writeFileSync(filePath, content, 'utf8');
      updatedFiles += 1;
    }
  }

  return updatedFiles;
}

async function convertOne(sharp, pngPath) {
  const avifPath = pngPath.replace(/\.png$/i, '.avif');
  await sharp(pngPath).avif({ quality: QUALITY, effort: EFFORT }).toFile(avifPath);

  const pngSize = fs.statSync(pngPath).size;
  const avifSize = fs.statSync(avifPath).size;

  if (avifSize >= pngSize) {
    fs.unlinkSync(avifPath);
    return { kept: 'png', pngPath, saved: 0 };
  }

  fs.unlinkSync(pngPath);
  const relativeFrom = path
    .relative(ASSETS_DIR, pngPath)
    .split(path.sep)
    .join('/');
  const relativeTo = relativeFrom.replace(/\.png$/i, '.avif');
  const from = `/template-assets/generated/${relativeFrom}`;
  const to = `/template-assets/generated/${relativeTo}`;

  return { kept: 'avif', from, to, saved: pngSize - avifSize };
}

async function main() {
  const pngFiles = collectPngFiles(ASSETS_DIR);
  if (!pngFiles.length) {
    console.log('[mock:compress-assets] No PNG files under mock/assets — nothing to do.');
    return;
  }

  let sharp;
  try {
    sharp = await loadSharp();
  } catch (error) {
    console.error(
      '[mock:compress-assets] sharp is required. Run: pnpm add -D sharp',
      error instanceof Error ? error.message : error,
    );
    process.exitCode = 1;
    return;
  }

  const replacements = [];
  let converted = 0;
  let keptPng = 0;
  let bytesSaved = 0;

  for (const pngPath of pngFiles.sort()) {
    const result = await convertOne(sharp, pngPath);
    if (result.kept === 'avif') {
      converted += 1;
      bytesSaved += result.saved;
      replacements.push({ from: result.from, to: result.to });
      console.log(`  avif ${path.relative(ROOT, pngPath).replace(/\.png$/i, '.avif')} (−${formatBytes(result.saved)})`);
    } else {
      keptPng += 1;
      console.log(`  keep png (avif not smaller): ${path.relative(ROOT, pngPath)}`);
    }
  }

  const updatedJson = rewriteMockJsonPaths(replacements);

  console.log(
    `[mock:compress-assets] converted ${converted} file(s), kept ${keptPng} PNG(s), saved ${formatBytes(bytesSaved)}, updated ${updatedJson} mock JSON file(s).`,
  );

  if (converted) {
    const sync = spawnSync(process.execPath, [path.join(ROOT, 'scripts/syncMockTemplateAssets.mjs')], {
      stdio: 'inherit',
      cwd: ROOT,
    });
    if (sync.status !== 0) {
      process.exitCode = sync.status ?? 1;
    }
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KiB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

main().catch((error) => {
  console.error('[mock:compress-assets] failed:', error);
  process.exitCode = 1;
});