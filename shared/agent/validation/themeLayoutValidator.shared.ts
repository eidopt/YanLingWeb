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

export function hasDisallowedLatinText(value: string): boolean {
  const normalized = value
    .replace(
      /\b(AI|API|URL|URI|ID|VIP|H5|SaaS|CRM|ERP|IoT|OK|PPSU|SPF|DNA|SLA|SKU|QDII|ETF|MOBA|FPS|MMORPG|Python|JavaScript|Java|React|Node|Word|Excel|PPT)\b/gi,
      '',
    )
    .replace(/Wi-?Fi/gi, '');
  if (hasCjkText(normalized)) {
    return (normalized.match(/[A-Za-z]{3,}/g) ?? []).length >= 3;
  }
  return /[A-Za-z]{3,}/.test(normalized);
}

export function isValidGeneratedImageUrl(value: string): boolean {
  return isAllowedTemplateImageSrc(value);
}
