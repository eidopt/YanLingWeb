/**
 * 从 public/template-assets/generated 收集 mock 模板引用的 PNG，写入 mock/assets/。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MOCK_DIR = path.join(ROOT, 'mock');
const ASSETS_DIR = path.join(MOCK_DIR, 'assets');
const PUBLIC_GENERATED = path.join(ROOT, 'public/template-assets/generated');
const ASSET_PATH_PATTERN = /\/template-assets\/generated\/([^"'\s]+\.(?:png|avif))/g;

function collectReferencedAssetPaths() {
  const paths = new Set();
  if (!fs.existsSync(MOCK_DIR)) {
    return paths;
  }

  for (const entry of fs.readdirSync(MOCK_DIR, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.json') || entry.name.endsWith('.validation.log')) {
      continue;
    }
    const content = fs.readFileSync(path.join(MOCK_DIR, entry.name), 'utf8');
    for (const match of content.matchAll(ASSET_PATH_PATTERN)) {
      paths.add(match[1]);
    }
  }

  return paths;
}

function main() {
  const references = collectReferencedAssetPaths();
  if (!references.size) {
    console.log('No PNG references found in mock/*.json');
    return;
  }

  let copied = 0;
  let missing = 0;

  for (const relativePath of [...references].sort()) {
    const source = path.join(PUBLIC_GENERATED, relativePath);
    const target = path.join(ASSETS_DIR, relativePath);
    if (!fs.existsSync(source)) {
      console.warn(`missing source asset: ${relativePath}`);
      missing += 1;
      continue;
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
    copied += 1;
  }

  console.log(`Bundled ${copied} PNG(s) into mock/assets (${missing} missing).`);
  if (missing) {
    process.exitCode = 1;
  }
}

main();