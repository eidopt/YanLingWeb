/**
 * 将 SQLite 中的公共模板导出到 mock/ 目录（可提交到 Git）。
 *
 * 用法：
 *   node scripts/exportMockTemplates.mjs [dbPath] [outputDir]
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB_PATH = path.resolve(ROOT, process.argv[2] ?? 'backend/data/app.dev.db');
const OUTPUT_DIR = path.resolve(ROOT, process.argv[3] ?? 'mock');
const CONFIGS_DIR = path.join(OUTPUT_DIR, 'configs');
const LABELS_PATH = path.join(ROOT, 'backend/data/template-category-labels.json');

function sqliteQuery(sql) {
  const output = execFileSync('sqlite3', ['-json', DB_PATH, sql], { encoding: 'utf8' }).trim();
  if (!output) {
    return [];
  }
  return JSON.parse(output);
}

function parseJsonColumn(value, fallback) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  if (typeof value === 'object') {
    return value;
  }
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

function readLabels() {
  try {
    return JSON.parse(fs.readFileSync(LABELS_PATH, 'utf8'));
  } catch {
    return { categories: {}, displayCategories: {}, platformCategories: {}, functionalCategories: {} };
  }
}

function buildCategoryLabels(row, labels) {
  const category = String(row.category ?? '').trim();
  const displayCategory = String(row.displayCategory ?? '').trim();
  const platformCategories = parseJsonColumn(row.platformCategories, []);
  const functionalCategories = parseJsonColumn(row.functionalCategories, []);

  const result = {};
  const categoryLabel = labels.categories?.[category] ?? row.name;
  if (categoryLabel) {
    result.categoryLabel = categoryLabel;
    result.categoryLabels = { [category]: categoryLabel };
  }

  const displayCategoryLabel =
    labels.displayCategories?.[displayCategory] ?? labels.categories?.[displayCategory] ?? row.name;
  if (displayCategoryLabel) {
    result.displayCategoryLabel = displayCategoryLabel;
    result.displayCategoryLabels = { [displayCategory]: displayCategoryLabel };
  }

  if (Array.isArray(platformCategories) && platformCategories.length) {
    const platformCategoryLabels = {};
    for (const key of platformCategories) {
      if (typeof key === 'string') {
        platformCategoryLabels[key] = labels.platformCategories?.[key] ?? key;
      }
    }
    result.platformCategoryLabels = platformCategoryLabels;
  }

  if (Array.isArray(functionalCategories) && functionalCategories.length) {
    const functionalCategoryLabels = {};
    for (const key of functionalCategories) {
      if (typeof key === 'string') {
        functionalCategoryLabels[key] = labels.functionalCategories?.[key] ?? key;
      }
    }
    result.functionalCategoryLabels = functionalCategoryLabels;
  }

  return result;
}

function extractVisualAssets(layoutDocument) {
  if (!layoutDocument || typeof layoutDocument !== 'object') {
    return [];
  }
  const assets = layoutDocument.visualAssets;
  return Array.isArray(assets) ? assets : [];
}

function main() {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`Database not found: ${DB_PATH}`);
    process.exit(1);
  }

  const labels = readLabels();
  const rows = sqliteQuery(`
    SELECT *
    FROM templates
  WHERE ownerUserId IS NULL
    AND isPublic = 1
    AND templateId NOT LIKE '%-copy-%'
  ORDER BY templateId ASC
  `);

  if (!rows.length) {
    console.error('No public templates found to export.');
    process.exit(1);
  }

  fs.mkdirSync(CONFIGS_DIR, { recursive: true });

  let exported = 0;
  for (const row of rows) {
    const templateId = row.templateId;
    const layoutDocument = parseJsonColumn(row.layoutDocument, {});
    const visualAssets = extractVisualAssets(layoutDocument);
    const payload = {
      templateId,
      name: row.name,
      tagline: row.tagline ?? '',
      description: row.description ?? '',
      accent: row.accent ?? '#000000',
      category: row.category,
      displayCategory: row.displayCategory ?? row.category,
      ...buildCategoryLabels(row, labels),
      platformCategories: parseJsonColumn(row.platformCategories, []),
      functionalCategories: parseJsonColumn(row.functionalCategories, []),
      traits: parseJsonColumn(row.traits, []),
      tags: parseJsonColumn(row.tags, undefined),
      cssVars: parseJsonColumn(row.cssVars, {}),
      cssAnimations: parseJsonColumn(row.cssAnimations, undefined),
      componentTemplates: parseJsonColumn(row.componentTemplates, {}),
      ...(visualAssets.length ? { visualAssets } : {}),
      layoutDocument,
    };

    const outFile = path.join(OUTPUT_DIR, `${templateId}.json`);
    fs.writeFileSync(outFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

    const profiles = sqliteQuery(
      `SELECT profile FROM template_profile_generated WHERE templateId = ${sqliteQuote(templateId)} LIMIT 1`,
    );
    if (profiles[0]?.profile) {
      const profile = parseJsonColumn(profiles[0].profile, null);
      if (profile) {
        fs.writeFileSync(
          path.join(CONFIGS_DIR, `${templateId}.generated.json`),
          `${JSON.stringify(profile, null, 2)}\n`,
          'utf8',
        );
      }
    }

    const assets = sqliteQuery(
      `SELECT manifest FROM template_asset_manifests WHERE templateId = ${sqliteQuote(templateId)} LIMIT 1`,
    );
    if (assets[0]?.manifest) {
      const manifest = parseJsonColumn(assets[0].manifest, null);
      if (manifest) {
        fs.writeFileSync(
          path.join(CONFIGS_DIR, `${templateId}.assets.json`),
          `${JSON.stringify(manifest, null, 2)}\n`,
          'utf8',
        );
      }
    }

    exported += 1;
    console.log(`exported ${templateId}`);
  }

  console.log(`\nWrote ${exported} template(s) to ${OUTPUT_DIR}`);
}

function sqliteQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

main();