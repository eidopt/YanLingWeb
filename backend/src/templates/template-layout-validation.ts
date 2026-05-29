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
    failOnUnknownProps: true,
    ...(requireGeneratedTemplateQuality
      ? {
          requireValidImageUrls: true,
          requireLocalizedPropLabels: true,
          requireChineseVisibleText: true,
        }
      : {}),
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
