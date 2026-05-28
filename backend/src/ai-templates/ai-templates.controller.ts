import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AiTemplatesService } from './ai-templates.service';
import type { PipelineResult, TemplateSeed } from './orchestrator/pipeline.types';

@ApiTags('ai-templates')
@ApiSecurity('bearer')
@UseGuards(JwtAuthGuard)
@Controller('ai-templates')
export class AiTemplatesController {
  constructor(private readonly service: AiTemplatesService) {}

  @Post('generate')
  @ApiOperation({ summary: '走 4-stage 流水线生成一个新模板（含 designer / critic / schema / verifier）' })
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
      },
    },
  })
  async generate(@Body() body: TemplateSeed): Promise<PipelineResult> {
    return this.service.generate(body);
  }
}
