import { Body, Catch, Controller, HttpException, Post, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { JwtAuthGuard } from '../auth/jwtAuth.guard';
import { AiTemplatesService } from './aiTemplates.service';
import type {
  PipelineExternalResult,
  PipelineFailure,
  TemplateSeed,
} from './orchestrator/pipeline.types';

interface GenerateRequestBody extends TemplateSeed {
  materializeImages?: boolean;
}

@ApiTags('aiTemplates')
@ApiSecurity('bearer')
@UseGuards(JwtAuthGuard)
@Controller('aiTemplates')
export class AiTemplatesController {
  constructor(private readonly service: AiTemplatesService) {}

  @Post('generate')
  @Throttle({ default: { limit: 3, ttl: 600000 } })
  @ApiOperation({
    summary: '走 4-stage 流水线生成一个新模板（含 designer / critic / schema / verifier）',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['prompt'],
      properties: {
        prompt: { type: 'string', description: '业务关键词或一句话需求' },
        platform: { type: 'string', enum: ['mini-program', 'mobile-app', 'web'] },
        displayCategory: { type: 'string' },
        forceArchetype: {
          type: 'string',
          enum: ['fresh', 'immersive', 'editorial', 'vibrant', 'dark-pro'],
        },
        forceHeroMode: { type: 'string' },
        materializeImages: {
          type: 'boolean',
          description:
            '是否立即调 OpenAI Images API 生成 ai-image visualAssets 的真实图片' +
            '（按张计费，~$0.04/张）。默认 false。',
        },
      },
    },
  })
  async generate(@Body() body: GenerateRequestBody): Promise<PipelineExternalResult | Record<string, unknown>> {
    const { materializeImages, ...seed } = body;
    try {
      return await this.service.generate(seed, { materializeImages });
    } catch (err: unknown) {
      // 如果流水线全部 attempt 失败但最后一次 Schema 产生了文档，返回它
      const pipelineErr = err as PipelineFailure;
      if (pipelineErr?.lastSchema) {
        return {
          templateId: pipelineErr.lastSchema.templateId,
          document: pipelineErr.lastSchema.document,
          brief: pipelineErr.lastSchema.brief,
          totalDurationMs: pipelineErr.lastSchema.totalDurationMs,
          _note: '流水线未完全通过 Verifier，最后生成的文档仅供参考',
        };
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new HttpException(message, 500);
    }
  }
}
