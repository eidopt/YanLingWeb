import { isAllowedTemplateImageSrc } from '../../theme-layout/visualAssets';
import type { ValidationIssue } from '../types';

export interface ThemeLayoutValidatorOptions {
  failOnUnknownProps?: boolean;
  componentTemplates?: Record<string, unknown>;
  requireValidImageUrls?: boolean;
  requireLocalizedPropLabels?: boolean;
  requireChineseVisibleText?: boolean;
  /**
   * 当为 true 时，强制 cssVars 主题色契约（必填键缺失/非法颜色 → error，
   * 推荐键缺失 → warning）。仅在模板生成的最终校验启用；编辑器流程不启用，
   * 避免误伤历史文档。见 ./cssVarsContract.ts。
   */
  requireThemeContract?: boolean;
}

const DATA_SELECTOR_PATTERN = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/;

export function issue(
  severity: ValidationIssue['severity'],
  path: string,
  code: string,
  message: string,
): ValidationIssue {
  return { severity, path, code, message };
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function isJsonSerializable(value: unknown): boolean {
  try {
    JSON.stringify(value);
    return true;
  } catch {
    return false;
  }
}

export function isSafePublicJsonEndpoint(value: string): boolean {
  if (value.startsWith('/')) {
    return !value.startsWith('//');
  }
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function validateDataSelector(value: unknown, path: string, errors: ValidationIssue[]): void {
  if (value === undefined) {
    return;
  }
  if (typeof value !== 'string' || !DATA_SELECTOR_PATTERN.test(value)) {
    errors.push(issue('error', path, 'invalid_data_selector', 'Data selector must be a dotted property path'));
  }
}

export function hasCjkText(value: string): boolean {
  return /[㐀-鿿]/.test(value);
}

const ALLOWED_LATIN_UI_TERMS = new RegExp(
  [
    '\\b(',
    [
      'AI',
      'API',
      'URL',
      'URI',
      'ID',
      'VIP',
      'H5',
      'SaaS',
      'CRM',
      'ERP',
      'IoT',
      'OK',
      'PPSU',
      'SPF',
      'DNA',
      'SLA',
      'SKU',
      'QDII',
      'ETF',
      'MOBA',
      'FPS',
      'MMORPG',
      'Python',
      'JavaScript',
      'TypeScript',
      'Java',
      'React',
      'Node',
      'HTML',
      'CSS',
      'SQL',
      'Git',
      'CLI',
      'SDK',
      'Word',
      'Excel',
      'PPT',
      'PDF',
      'EPUB',
      'DOC',
      'DOCX',
      'XLS',
      'XLSX',
      'CSV',
      'JSON',
      'XML',
      'YAML',
      'ZIP',
      'RAR',
      'DMG',
      'EXE',
      'APK',
      'IPA',
      'MP3',
      'MP4',
      'MOV',
      'PNG',
      'JPG',
      'JPEG',
      'SVG',
      'WebP',
      'AVIF',
      'GIF',
      'macOS',
      'Windows',
      'iOS',
      'Android',
      'Linux',
      'HarmonyOS',
      'Web',
      'App',
      'APP',
      'UI',
      'UX',
      'FAQ',
      'RSS',
      'OCR',
      'CPU',
      'GPU',
      'RAM',
      'SSD',
      'USB',
      'HDMI',
      'QR',
      'CDN',
      'DNS',
      'SSL',
      'HTTP',
      'HTTPS',
      'Pro',
      'Max',
      'Mini',
      'Plus',
      'Ultra',
      'Lite',
      'Air',
      'SOE',
      'Latte',
      'Espresso',
      'Americano',
      'Cappuccino',
      'Mocha',
      'Cold',
      'Brew',
      'Oat',
      'Dirty',
      'Cafe',
      'Coffee',
      'Tea',
      'Bar',
      'Bakery',
      'Menu',
      'SPA',
      'Gym',
      'Yoga',
      'Pilates',
      'Fit',
      'HIIT',
      'SVIP',
      'MVP',
      'KOL',
      'KOC',
      'O2O',
      'B2B',
      'B2C',
      'DTC',
      'KPI',
      'OKR',
      'ROI',
      'GMV',
      'DAU',
      'MAU',
      'NFT',
      '3D',
      '4K',
      '8K',
      '5G',
      'ml',
      'mL',
      'kcal',
      'cal',
      'kg',
      'km',
      'cm',
      'mm',
      'min',
      'hr',
      'fps',
      'Hz',
      'GHz',
      'MHz',
      'GB',
      'MB',
      'TB',
      'mAh',
    ].join('|'),
    ')\\b',
  ].join(''),
  'gi',
);

export function hasDisallowedLatinText(value: string): boolean {
  const normalized = value.replace(ALLOWED_LATIN_UI_TERMS, '').replace(/Wi-?Fi/gi, '');
  if (hasCjkText(normalized)) {
    return (normalized.match(/[A-Za-z]{3,}/g) ?? []).length >= 3;
  }
  return /[A-Za-z]{3,}/.test(normalized);
}

export function isValidGeneratedImageUrl(value: string): boolean {
  return isAllowedTemplateImageSrc(value);
}
