/**
 * 将 mock/assets 镜像同步到 public/template-assets/generated，并删除目标侧多余文件。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(ROOT, 'mock/assets');
const TARGET = path.join(ROOT, 'public/template-assets/generated');

function isBundledImage(fileName) {
  const lower = fileName.toLowerCase();
  return lower.endsWith('.png') || lower.endsWith('.avif') || lower.endsWith('.webp');
}

function collectImageRelativePaths(directory, prefix = '') {
  const paths = new Set();
  if (!fs.existsSync(directory)) {
    return paths;
  }
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      for (const nested of collectImageRelativePaths(fullPath, relative)) {
        paths.add(nested);
      }
      continue;
    }
    if (isBundledImage(entry.name)) {
      paths.add(relative.split(path.sep).join('/'));
    }
  }
  return paths;
}

function copyDirectory(sourceDir, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(sourcePath, targetPath);
      continue;
    }
    if (isBundledImage(entry.name)) {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

function pruneExtraTargetImages(targetDir, allowedRelativePaths, prefix = '') {
  if (!fs.existsSync(targetDir)) {
    return 0;
  }

  let removed = 0;
  for (const entry of fs.readdirSync(targetDir, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const relativePosix = relative.split(path.sep).join('/');
    const fullPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      removed += pruneExtraTargetImages(fullPath, allowedRelativePaths, relative);
      try {
        const remaining = fs.readdirSync(fullPath);
        if (remaining.length === 0) {
          fs.rmdirSync(fullPath);
        }
      } catch {
        // 目录非空或竞态时忽略。
      }
      continue;
    }

    if (isBundledImage(entry.name) && !allowedRelativePaths.has(relativePosix)) {
      fs.unlinkSync(fullPath);
      removed += 1;
    }
  }

  return removed;
}

function countImages(directory) {
  let total = 0;
  if (!fs.existsSync(directory)) {
    return total;
  }
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      total += countImages(fullPath);
    } else if (isBundledImage(entry.name)) {
      total += 1;
    }
  }
  return total;
}

function main() {
  if (!fs.existsSync(SOURCE)) {
    console.warn('[mock:sync-assets] mock/assets not found — skip (run pnpm mock:bundle-assets after export).');
    return;
  }

  const allowed = collectImageRelativePaths(SOURCE);
  copyDirectory(SOURCE, TARGET);
  const removed = pruneExtraTargetImages(TARGET, allowed);
  const count = countImages(SOURCE);
  console.log(
    `[mock:sync-assets] synced ${count} image(s) to public/template-assets/generated/ (removed ${removed} stale file(s)).`,
  );
}

main();