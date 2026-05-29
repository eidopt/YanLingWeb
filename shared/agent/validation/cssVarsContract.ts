/**
 * cssVars 主题色契约校验器
 * ========================
 * 渲染器（core.* 组件）只认模板自己声明的主题色，不会回退到平台 `--app-*` token
 * （见 src/styles/render-contract.css）。因此每个生成模板的 cssVars 必须显式且完整
 * 输出契约必填键，否则渲染会落到中性默认、丢失模板个性。
 *
 * 本校验器在生成流水线中强制该契约：
 *  - 缺失必填键 → error
 *  - 缺失推荐键 → warning
 *  - 必填键的值不是合法 CSS 颜色 → error
 */
import { RECOMMENDED_THEME_CONTRACT_KEYS, REQUIRED_THEME_CONTRACT_KEYS } from '../prompts/templates/designPrinciples';
import type { ValidationIssue } from '../types';

interface CssVarsCarrier {
  cssVars?: Record<string, string> | null;
  style?: { cssVars?: Record<string, string> | null } | null;
}

/** 合法 CSS 颜色的宽松判定：#hex / rgb()/rgba() / hsl()/hsla() / var() / 常见颜色关键字。 */
const COLOR_PATTERN =
  /^(#([0-9a-f]{3,8})|rgba?\([^)]*\)|hsla?\([^)]*\)|var\(--[\w-]+(,[^)]*)?\)|transparent|currentcolor|[a-z]+)$/i;

function isColorValue(value: unknown): boolean {
  return typeof value === 'string' && COLOR_PATTERN.test(value.trim());
}

function collectCssVars(doc: CssVarsCarrier): Record<string, string | undefined> {
  const merged: Record<string, string | undefined> = {};
  const top = doc.cssVars;
  const styled = doc.style?.cssVars;
  if (styled && typeof styled === 'object') {
    Object.assign(merged, styled);
  }
  // 顶层 cssVars 优先于 style.cssVars（与保存逻辑一致：顶层镜像进 style）。
  if (top && typeof top === 'object') {
    Object.assign(merged, top);
  }
  return merged;
}

/**
 * 校验模板 cssVars 是否满足主题色契约。
 * @returns ValidationIssue 数组（空数组表示通过）。
 */
export function validateCssVarsContract(doc: CssVarsCarrier): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const cssVars = collectCssVars(doc);

  for (const key of REQUIRED_THEME_CONTRACT_KEYS) {
    const raw = cssVars[key];
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (value === '') {
      issues.push({
        severity: 'error',
        path: `cssVars.${key}`,
        code: 'theme-contract/missing-required',
        message: `缺少必填主题色契约键 ${key}：渲染器不会回退到平台 token，必须显式声明。`,
      });
      continue;
    }
    if (!isColorValue(value)) {
      issues.push({
        severity: 'error',
        path: `cssVars.${key}`,
        code: 'theme-contract/invalid-color',
        message: `主题色契约键 ${key} 的值「${value}」不是合法 CSS 颜色。`,
      });
    }
  }

  for (const key of RECOMMENDED_THEME_CONTRACT_KEYS) {
    const raw = cssVars[key];
    if (typeof raw !== 'string' || raw.trim() === '') {
      issues.push({
        severity: 'warning',
        path: `cssVars.${key}`,
        code: 'theme-contract/missing-recommended',
        message: `建议补全推荐主题色契约键 ${key}，以获得完整视觉（缺失将落到中性默认）。`,
      });
    }
  }

  return issues;
}

/** 便捷判定：是否满足必填契约（无 error）。 */
export function isCssVarsContractSatisfied(doc: CssVarsCarrier): boolean {
  return validateCssVarsContract(doc).every((i) => i.severity !== 'error');
}
