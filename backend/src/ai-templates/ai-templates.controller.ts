import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AiTemplatesService } from './ai-templates.service';
import type { PipelineExternalResult, TemplateSeed } from './orchestrator/pipeline.types';

interface GenerateRequestBody extends TemplateSeed {
  materializeImages?: boolean;
}

@ApiTags('ai-templates')
@ApiSecurity('bearer')
@UseGuards(JwtAuthGuard)
@Controller('ai-templates')
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
  async generate(@Body() body: GenerateRequestBody): Promise<PipelineExternalResult> {
    const { materializeImages, ...seed } = body;
    return this.service.generate(seed, { materializeImages });
  }
}
