/**
 * Generate templates-index.json from templates_json/*.json
 * Output: public/templates-index.json
 */
import { readdirSync, writeFileSync, readFileSync } from 'fs';
import { resolve, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const TEMPLATES_DIR = resolve(ROOT, 'templates_json');
const OUTPUT = resolve(ROOT, 'templates_json', 'preview', 'public', 'templates-index.json');

const CATEGORY_ORDER = [
  'commerce', 'booking', 'content', 'dashboard', 'edu', 'education', 'finance',
  'food', 'health', 'marketing', 'profile', 'service', 'shop', 'social',
  'utility',
];

const VARIANT_KEYWORDS = ['优雅', '冷色', '商务', '复古', '暖色', '暗色', '活力', '清新', '科技', '简约'];
const PLATFORM_KEYWORDS = ['mobile-app', 'web', 'mini-program'];
const CATEGORY_LABELS = {
  commerce: '电商零售',
  booking: '预约服务',
  content: '内容社区',
  dashboard: '数据看板',
  edu: '教育学习',
  education: '教育学习',
  finance: '金融财务',
  food: '餐饮美食',
  health: '健康医疗',
  marketing: '营销推广',
  profile: '个人中心',
  service: '生活服务',
  shop: '电商购物',
  social: '社交互动',
  utility: '工具效率',
  uncategorized: '未分类',
};

/**
 * @param {string} stem
 */
function parseFilename(stem) {
  let category = '';
  let subcategory = '';
  let variant = '';
  let platform = '';
  let rest = stem;

  // Extract platform
  for (const p of PLATFORM_KEYWORDS) {
    if (rest.endsWith(`-${p}`)) {
      platform = p;
      rest = rest.slice(0, -(p.length + 1));
      break;
    }
  }

  // Extract variant
  for (const v of VARIANT_KEYWORDS) {
    if (rest.endsWith(`-${v}`)) {
      variant = v;
      rest = rest.slice(0, -(v.length + 1));
      break;
    }
  }

  // First segment is category, rest is subcategory
  const parts = rest.split('-');
  if (parts.length >= 1) {
    category = parts[0];
    subcategory = parts.slice(1).join('-');
  }

  return { category, subcategory, variant, platform };
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

const files = readdirSync(TEMPLATES_DIR)
  .filter(f => f.endsWith('.json') && f !== 'import-skip-list.json')
  .sort();

const entries = files.map((file) => {
  const stem = basename(file, '.json');
  const parsed = parseFilename(stem);
  let themeName = stem;
  let categoryLabel = CATEGORY_LABELS[parsed.category] ?? parsed.category;
  let platformCategories = parsed.platform ? [parsed.platform] : [];

  // Try to read themeName from the JSON for user-friendly display
  try {
    const content = readFileSync(resolve(TEMPLATES_DIR, file), 'utf8');
    const doc = JSON.parse(content);
    themeName = nonEmptyString(doc.name)
      ?? nonEmptyString(doc.themeName)
      ?? nonEmptyString(doc.layoutDocument?.themeName)
      ?? themeName;
    categoryLabel = nonEmptyString(doc.displayCategoryLabel)
      ?? nonEmptyString(doc.categoryLabel)
      ?? categoryLabel;
    if (Array.isArray(doc.platformCategories)) {
      platformCategories = doc.platformCategories
        .filter((value) => typeof value === 'string' && value.trim())
        .map((value) => value.trim());
    }
  } catch {
    // ignore parse errors
  }

  return {
    id: stem,
    file,
    category: parsed.category || 'uncategorized',
    subcategory: parsed.subcategory || '',
    variant: parsed.variant || '',
    platform: parsed.platform || '',
    platformCategories,
    categoryLabel,
    themeName,
  };
});

const grouped = {};
for (const entry of entries) {
  if (!grouped[entry.category]) {
    grouped[entry.category] = [];
  }
  grouped[entry.category].push(entry);
}

const result = {
  total: entries.length,
  all: entries,
  categories: CATEGORY_ORDER.filter(c => grouped[c]).map(c => ({
    name: c,
    label: grouped[c][0]?.categoryLabel ?? CATEGORY_LABELS[c] ?? c,
    count: grouped[c].length,
    items: grouped[c],
  })),
  // Also include any categories not in the predefined order
  extraCategories: Object.keys(grouped)
    .filter(c => !CATEGORY_ORDER.includes(c))
    .map(c => ({
      name: c,
      label: grouped[c][0]?.categoryLabel ?? CATEGORY_LABELS[c] ?? c,
      count: grouped[c].length,
      items: grouped[c],
    })),
};

writeFileSync(OUTPUT, JSON.stringify(result, null, 2), 'utf8');
console.log(`Generated index: ${result.total} templates in ${result.categories.length + result.extraCategories.length} categories → ${OUTPUT}`);
