#!/usr/bin/env node
/**
 * 模板主题色迁移脚本
 *
 * 背景：模板广场中 10 个 AI 生成的模板使用 Tailwind 500 级亮色做主色，
 * 白字按钮 / 价格文字对比度仅约 2.2~4.0:1（WCAG AA 要求 4.5:1），
 * 且 cssVars 结构完全一致（仅换色相），表面 / 圆角 / 文字色雷同，
 * 还存在 `--color-primary-light`（400 级亮色）被映射为面板背景的问题。
 *
 * 本脚本对每个公共模板：
 *   1. 主色加深到 700 级（白字 / 白底文字对比度 ≥ 5:1）
 *   2. `--color-primary-light` 改为 50/100 级浅 tint（修复面板背景）
 *   3. 补齐渲染器契约变量（--color-bg / --color-card / --text-base / --accent）
 *   4. 通过表面色温、圆角、文字色相的差异化消除同质化
 *   5. 布局 JSON 中硬编码的旧主色族 hex 做精确替换（占位符防链式冲突）
 *   6. 同步 template_profile_generated 的 styleProfile.colors
 *
 * 用法：
 *   node scripts/update-template-themes.mjs [--dry-run]
 *
 * 注意：需要 Node 22 运行（better-sqlite3 原生模块按 NODE_MODULE_VERSION 127 编译）。
 * 用户私有副本（ownerUserId 非空）不在本脚本处理范围内。
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRequire = createRequire(path.join(__dirname, '../backend/package.json'));
const Database = backendRequire('better-sqlite3');

const DB_PATH = path.join(__dirname, '../backend/data/app.dev.db');
const BACKUP_DIR = path.join(__dirname, '../backend/data/theme-migration-backup');
const DRY_RUN = process.argv.includes('--dry-run');

/**
 * 每个模板的新主题。
 * - accent/primaryDark/primaryLight/bg/textPrimary/textSecondary/border/textBase/radius 写入 cssVars
 * - colorMap：布局 JSON 中旧 hex → 新 hex 的精确替换表（仅主题色族，语义色不动）
 */
const THEMES = {
  'booking-reservation': {
    label: '预约预订 · 紫罗兰',
    accent: '#6d28d9',
    primaryDark: '#5b21b6',
    primaryLight: '#ede9fe',
    bg: '#f7f5fc',
    textPrimary: '#221c35',
    textSecondary: '#5f5a75',
    border: '#e4def2',
    radius: '0.9rem',
    colorMap: {
      '#8b5cf6': '#6d28d9',
      '#6d5dfc': '#6d28d9',
      '#a855f7': '#7e22ce',
      '#7c3aed': '#5b21b6',
      '#a78bfa': '#c4b5fd',
      '#f3f0ff': '#ede9fe',
      '#f6f7fb': '#f7f5fc',
      '#f8fafc': '#f7f5fc',
      '#1e293b': '#221c35',
      '#64748b': '#5f5a75',
      '#e2e8f0': '#e4def2',
    },
  },
  'content-reader': {
    label: '内容阅读 · 天蓝',
    accent: '#0369a1',
    primaryDark: '#075985',
    primaryLight: '#e0f2fe',
    bg: '#f5f8fa',
    textPrimary: '#16222e',
    textSecondary: '#55626e',
    border: '#dde5ec',
    radius: '0.5rem',
    colorMap: {
      '#0ea5e9': '#0369a1',
      '#0284c7': '#075985',
      '#38bdf8': '#7dd3fc',
      '#f1f5f9': '#e8eef3',
      '#f6f7fb': '#f5f8fa',
      '#f8fafc': '#f5f8fa',
      '#64748b': '#55626e',
      '#e2e8f0': '#dde5ec',
    },
  },
  'education-learning': {
    label: '教育学习 · 正蓝',
    accent: '#1d4ed8',
    primaryDark: '#1e40af',
    primaryLight: '#dbeafe',
    bg: '#f6f8fc',
    textPrimary: '#1b2440',
    textSecondary: '#5a6379',
    border: '#dfe4f0',
    radius: '0.8rem',
    colorMap: {
      '#14b8a6': '#1d4ed8',
      '#0d9488': '#1e40af',
      '#2dd4bf': '#93c5fd',
      '#eef8f4': '#eef4fd',
      '#f1f5f9': '#eef2f8',
      '#f6f7fb': '#f6f8fc',
      '#f8fafc': '#f6f8fc',
      '#1e293b': '#1b2440',
      '#64748b': '#5a6379',
      '#e2e8f0': '#dfe4f0',
    },
  },
  'event-promotion': {
    label: '活动推广 · 品红',
    accent: '#be185d',
    primaryDark: '#9d174d',
    primaryLight: '#fce7f3',
    bg: '#fdf5f8',
    textPrimary: '#2e1a26',
    textSecondary: '#6b5a64',
    border: '#f0dde6',
    radius: '1.2rem',
    colorMap: {
      '#f97316': '#be185d',
      '#ff6b35': '#be185d',
      '#ea580c': '#9d174d',
      '#9a3412': '#831843',
      '#fb923c': '#f9a8d4',
      '#fff7ed': '#fdf2f8',
      '#f1f5f9': '#f9eef3',
      '#f6f7fb': '#fdf5f8',
      '#f8fafc': '#fdf5f8',
      '#1e293b': '#2e1a26',
      '#64748b': '#6b5a64',
      '#e2e8f0': '#f0dde6',
    },
  },
  'food-ordering': {
    label: '餐饮点单 · 琥珀棕',
    accent: '#b45309',
    primaryDark: '#92400e',
    primaryLight: '#fef3c7',
    bg: '#fdf9f0',
    textPrimary: '#2b2013',
    textSecondary: '#6b5f51',
    border: '#ece2d3',
    radius: '1rem',
    colorMap: {
      '#ef4444': '#b45309',
      '#dc2626': '#92400e',
      '#f87171': '#fcd34d',
      '#f97316': '#d97706',
      '#ea580c': '#92400e',
      '#fff7ed': '#fef3c7',
      '#f6f7fb': '#fdf9f0',
      '#f8fafc': '#fdf9f0',
      '#1e293b': '#2b2013',
      '#64748b': '#6b5f51',
      '#e2e8f0': '#ece2d3',
    },
  },
  'health-wellness': {
    label: '健康管理 · 深绿',
    accent: '#15803d',
    primaryDark: '#166534',
    primaryLight: '#dcfce7',
    bg: '#f4faf6',
    textPrimary: '#172a20',
    textSecondary: '#54655c',
    border: '#dce8e0',
    radius: '1.1rem',
    colorMap: {
      '#22c55e': '#15803d',
      '#10b981': '#15803d',
      '#0f766e': '#15803d',
      '#14b8a6': '#15803d',
      '#16a34a': '#166534',
      '#047857': '#166534',
      '#4ade80': '#86efac',
      '#f6f7fb': '#f4faf6',
      '#f8fafc': '#f4faf6',
      '#1e293b': '#172a20',
      '#64748b': '#54655c',
      '#e2e8f0': '#dce8e0',
    },
  },
  'news-feed': {
    label: '新闻资讯 · 深红',
    accent: '#b91c1c',
    primaryDark: '#991b1b',
    primaryLight: '#fee2e2',
    bg: '#faf7f5',
    textPrimary: '#241a16',
    textSecondary: '#655a55',
    border: '#e9dfdb',
    radius: '0.4rem',
    colorMap: {
      '#dc2626': '#b91c1c',
      '#b91c1c': '#991b1b',
      '#ef4444': '#f87171',
      '#f6f7fb': '#faf7f5',
      '#f8fafc': '#faf7f5',
      '#1e293b': '#241a16',
      '#64748b': '#655a55',
      '#e2e8f0': '#e9dfdb',
    },
  },
  'profile-center': {
    label: '个人中心 · 靛蓝',
    accent: '#4338ca',
    primaryDark: '#3730a3',
    primaryLight: '#e0e7ff',
    bg: '#f6f6fb',
    textPrimary: '#1e1e33',
    textSecondary: '#5c5c73',
    border: '#e0e0ee',
    radius: '0.9rem',
    colorMap: {
      '#6366f1': '#4338ca',
      '#7c3aed': '#4338ca',
      '#4f46e5': '#3730a3',
      '#818cf8': '#a5b4fc',
      '#f7f2ff': '#eef2ff',
      '#faf5ff': '#eef2ff',
      '#f6f7fb': '#f6f6fb',
      '#f8fafc': '#f6f6fb',
      '#1e293b': '#1e1e33',
      '#64748b': '#5c5c73',
      '#e2e8f0': '#e0e0ee',
    },
  },
  'social-feed': {
    label: '社交动态 · 紫粉',
    accent: '#a21caf',
    primaryDark: '#86198f',
    primaryLight: '#fae8ff',
    bg: '#fbf5fc',
    textPrimary: '#2a1a2e',
    textSecondary: '#6a5a6e',
    border: '#eedeee',
    radius: '1.2rem',
    colorMap: {
      '#f43f5e': '#a21caf',
      '#ec4899': '#a21caf',
      '#8b5cf6': '#a21caf',
      '#e11d48': '#86198f',
      '#fb7185': '#f0abfc',
      '#f1f5f9': '#f4e9f6',
      '#f6f7fb': '#fbf5fc',
      '#f8fafc': '#fbf5fc',
      '#1e293b': '#2a1a2e',
      '#64748b': '#6a5a6e',
      '#e2e8f0': '#eedeee',
    },
  },
  'utility-tools': {
    label: '工具应用 · 板岩灰',
    accent: '#334155',
    primaryDark: '#1e293b',
    primaryLight: '#e2e8f0',
    bg: '#f5f7f9',
    textPrimary: '#0f172a',
    textSecondary: '#525f70',
    border: '#dfe4ea',
    radius: '0.6rem',
    colorMap: {
      '#64748b': '#475569',
      '#475569': '#334155',
      '#94a3b8': '#cbd5e1',
      '#eef2f7': '#e9edf2',
      '#f6f7fb': '#f5f7f9',
      '#f8fafc': '#f5f7f9',
      '#e2e8f0': '#dfe4ea',
    },
  },
};

function buildCssVars(theme) {
  return {
    '--color-primary': theme.accent,
    '--color-primary-dark': theme.primaryDark,
    '--color-primary-light': theme.primaryLight,
    '--color-text-primary': theme.textPrimary,
    '--color-text-secondary': theme.textSecondary,
    '--color-border': theme.border,
    '--color-background': theme.bg,
    '--color-surface': '#ffffff',
    '--color-bg': theme.bg,
    '--color-card': '#ffffff',
    '--text-base': theme.textPrimary,
    '--radius-base': theme.radius,
    '--accent': theme.accent,
  };
}

/**
 * 对 JSON 字符串做精确 hex 替换。先用占位符替换所有源色，
 * 再统一换成目标色，避免 A→B、B→C 的链式覆盖。
 */
function remapColors(jsonText, colorMap) {
  const entries = Object.entries(colorMap);
  let out = jsonText;
  entries.forEach(([from], i) => {
    out = out.replace(new RegExp(`${escapeRegExp(from)}(?![0-9a-fA-F])`, 'gi'), `__THEME_COLOR_${i}__`);
  });
  entries.forEach(([, to], i) => {
    out = out.replaceAll(`__THEME_COLOR_${i}__`, to);
  });
  return out;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function main() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  const selectStmt = db.prepare(
    `SELECT templateId, accent, cssVars, componentTemplates, layoutDocument
     FROM templates WHERE templateId = ? AND ownerUserId IS NULL AND isPublic = 1`,
  );
  const updateStmt = db.prepare(
    `UPDATE templates
     SET accent = @accent, cssVars = @cssVars, componentTemplates = @componentTemplates,
         layoutDocument = @layoutDocument, updatedAt = datetime('now')
     WHERE templateId = @templateId`,
  );
  const profileSelect = db.prepare(
    `SELECT id, profile FROM template_profile_generated WHERE templateId = ?`,
  );
  const profileUpdate = db.prepare(
    `UPDATE template_profile_generated SET profile = @profile, updatedAt = datetime('now') WHERE id = @id`,
  );

  const backup = {};
  const summary = [];

  for (const templateId of Object.keys(THEMES)) {
    const row = selectStmt.get(templateId);
    if (row) {
      backup[templateId] = row;
    }
  }

  if (!DRY_RUN) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const backupFile = path.join(
      BACKUP_DIR,
      `templates-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
    );
    fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2));
    console.log(`迁移前备份已写入 ${backupFile}\n`);
  }

  const run = db.transaction(() => {
    for (const [templateId, theme] of Object.entries(THEMES)) {
      const row = backup[templateId];
      if (!row) {
        summary.push(`SKIP ${templateId}（不存在或非公共模板）`);
        continue;
      }

      const cssVars = buildCssVars(theme);
      const componentTemplates = remapColors(row.componentTemplates, theme.colorMap);
      const layoutDoc = JSON.parse(remapColors(row.layoutDocument, theme.colorMap));
      layoutDoc.cssVars = { ...cssVars };
      if (layoutDoc.style && typeof layoutDoc.style === 'object') {
        layoutDoc.style.cssVars = { ...cssVars };
      }

      if (!DRY_RUN) {
        updateStmt.run({
          templateId,
          accent: theme.accent,
          cssVars: JSON.stringify(cssVars),
          componentTemplates,
          layoutDocument: JSON.stringify(layoutDoc),
        });
      }

      const profile = profileSelect.get(templateId);
      if (profile) {
        const profileJson = remapColors(profile.profile, theme.colorMap);
        if (!DRY_RUN && profileJson !== profile.profile) {
          profileUpdate.run({ id: profile.id, profile: profileJson });
        }
      }

      summary.push(`OK   ${templateId} → ${theme.label}（accent ${row.accent} → ${theme.accent}）`);
    }
  });

  if (DRY_RUN) {
    console.log('[dry-run] 不写入数据库，仅预览变更：\n');
  }
  run();

  console.log(summary.join('\n'));
  console.log(DRY_RUN ? '\n[dry-run] 完成。' : '\n迁移完成。');
}

main();
