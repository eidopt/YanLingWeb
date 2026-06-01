import { BadRequestException } from '@nestjs/common';
import type { ThemeLayoutDocument } from '@shared/agent/contracts/agent';
import {
  renderSmokeThemeLayoutDocument,
  validateThemeLayoutDocument,
} from '@shared/agent/contracts/validation';
import { isThemeLayoutDocument } from '@shared/theme-layout/documentBoundary';
import { migrateThemeLayoutDocument } from '@shared/theme-layout/migrations';
import { withThemeLayoutStyleManifest } from '@shared/theme-layout/styleManifest';

export interface TemplateLayoutValidationInput {
  layoutDocument: unknown;
  componentTemplates?: Record<string, unknown>;
  cssVars?: Record<string, string>;
  requireGeneratedTemplateQuality?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * 「成品模板」质量校验门槛 —— 导入（requireGeneratedTemplateQuality）和生成流水线
 * （schema-gen / verifier）共用这一套，保证两端不再漂移。
 * 未知 prop 视为 error、强制图片 URL 合法、文案本地化、可见文本为简体中文。
 */
export const GENERATED_TEMPLATE_QUALITY_VALIDATION = {
  failOnUnknownProps: true,
  requireValidImageUrls: true,
  requireLocalizedPropLabels: true,
  requireChineseVisibleText: true,
} as const;

export interface GeneratedLayoutCheckIssue {
  code: string;
  path: string;
  message: string;
}

export interface GeneratedLayoutCheckResult {
  valid: boolean;
  errors: GeneratedLayoutCheckIssue[];
}

/**
 * 生成流水线侧的成品模板校验：和导入端 prepareTemplateLayoutForPersistence
 * （requireGeneratedTemplateQuality=true）完全同一套门槛 —— 严格 schema 校验
 * + render smoke。让 schema-gen / verifier 在生成时就拦下导入会拒绝的文档，
 * 避免「生成成功却导入失败」。
 *
 * 入参 document 必须已经过 migrateThemeLayoutDocument。不抛异常，返回 error 列表
 * 供上层（runStructuredStage）回喂给 LLM 重试。
 */
export function validateGeneratedTemplateLayout(
  document: ThemeLayoutDocument,
  componentTemplates?: Record<string, unknown>,
): GeneratedLayoutCheckResult {
  const validation = validateThemeLayoutDocument(document, {
    componentTemplates,
    ...GENERATED_TEMPLATE_QUALITY_VALIDATION,
  });
  const errors: GeneratedLayoutCheckIssue[] = validation.errors.map((e) => ({
    code: e.code,
    path: e.path,
    message: e.message,
  }));
  // schema 校验通过后才跑 render smoke（和导入端顺序一致）。
  if (validation.valid) {
    const smoke = renderSmokeThemeLayoutDocument(document);
    if (!smoke.passed) {
      smoke.errors.forEach((message, index) =>
        errors.push({
          code: 'render_smoke_failed',
          path: `renderSmoke.errors[${index}]`,
          message,
        }),
      );
    }
  }
  return { valid: errors.length === 0, errors };
}

function toValidationErrorResponse(validation: ReturnType<typeof validateThemeLayoutDocument>) {
  return {
    message: 'Template layoutDocument failed schema validation',
    code: 'template_layout_invalid',
    errors: validation.errors,
    warnings: validation.warnings,
  };
}

export function assertValidTemplateLayout({
  layoutDocument,
  componentTemplates,
  requireGeneratedTemplateQuality,
}: TemplateLayoutValidationInput): void {
  prepareTemplateLayoutForPersistence({
    layoutDocument,
    componentTemplates,
    requireGeneratedTemplateQuality,
  });
}

export function prepareTemplateLayoutForPersistence({
  layoutDocument,
  componentTemplates,
  cssVars,
  requireGeneratedTemplateQuality,
}: TemplateLayoutValidationInput): ThemeLayoutDocument {
  if (!isRecord(layoutDocument)) {
    throw new BadRequestException({
      message: 'Template layoutDocument failed schema validation',
      code: 'template_layout_invalid',
      errors: [
        {
          path: 'layoutDocument',
          code: 'invalid_document',
          message: 'layoutDocument must be an object',
          severity: 'error',
        },
      ],
      warnings: [],
    });
  }

  const migrated = withThemeLayoutStyleManifest(
    migrateThemeLayoutDocument(layoutDocument),
    cssVars,
  );
  if (!isThemeLayoutDocument(migrated)) {
    throw new BadRequestException({
      message: 'Template layoutDocument failed schema validation',
      code: 'template_layout_invalid',
      errors: [
        {
          path: 'layoutDocument',
          code: 'invalid_document',
          message: 'layoutDocument must match ThemeLayoutDocument structure',
          severity: 'error',
        },
      ],
      warnings: [],
    });
  }

  const validation = validateThemeLayoutDocument(migrated, {
    componentTemplates,
    ...(requireGeneratedTemplateQuality
      ? GENERATED_TEMPLATE_QUALITY_VALIDATION
      : { failOnUnknownProps: true }),
  });

  if (!validation.valid) {
    throw new BadRequestException(toValidationErrorResponse(validation));
  }

  const smoke = renderSmokeThemeLayoutDocument(migrated);
  if (!smoke.passed) {
    throw new BadRequestException({
      message: 'Template layoutDocument failed render smoke validation',
      code: 'template_layout_smoke_failed',
      errors: smoke.errors.map((message, index) => ({
        path: `renderSmoke.errors[${index}]`,
        code: 'render_smoke_failed',
        message,
        severity: 'error',
      })),
      warnings: [],
    });
  }

  return migrated;
}
