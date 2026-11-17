import { Body, Controller, HttpException, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { SseEventPayloadByType, SseEventType } from '@shared/agent/contracts/sseEvents';
import type { Response } from 'express';

import { serializeSseEvent } from '../ai/sse/sseEnvelope';
import { AuthenticatedRequest } from '../auth/authenticatedRequest.interface';
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

function startSseHeartbeat(res: Response): () => void {
  const timer = setInterval(() => {
    res.write(':heartbeat\n\n');
  }, 5_000);
  timer.unref();
  return () => clearInterval(timer);
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
  async generate(
    @Body() body: GenerateRequestBody,
  ): Promise<PipelineExternalResult | Record<string, unknown>> {
    const { materializeImages, ...seed } = body;
    try {
      return await this.service.generate(seed, { materializeImages });
    } catch (err: unknown) {
      // 如果流水线全部 attempt 失败但最后一次 Schema 产生了文档，返回它
      const pipelineErr = err as PipelineFailure;
      if (pipelineErr.lastSchema) {
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

  @Post('generate/stream')
  @Throttle({ default: { limit: 3, ttl: 600000 } })
  @ApiOperation({
    summary: '流式跑 4-stage 流水线生成并落库新模板，通过 SSE 推送阶段进度与保存结果',
  })
  generateStream(
    @Body() body: GenerateRequestBody,
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ): void {
    const { materializeImages, ...seed } = body;

    res.setHeader('content-type', 'text/event-stream; charset=utf-8');
    res.setHeader('cache-control', 'no-cache, no-transform');
    res.setHeader('connection', 'keep-alive');
    res.setHeader('x-accel-buffering', 'no');
    res.flushHeaders();

    let closed = false;
    const stopHeartbeat = startSseHeartbeat(res);
    req.on('close', () => {
      closed = true;
      stopHeartbeat();
    });

    const writeEnvelope = <T extends SseEventType>(
      type: T,
      payload: SseEventPayloadByType[T],
    ): void => {
      if (closed) {
        return;
      }
      res.write(`data: ${serializeSseEvent(type, payload)}\n\n`);
      this.flushResponse(res);
    };

    void this.service
      .generateAndSave(req.user.sub, seed, {
        materializeImages,
        onStageEvent: (phase, payload) => {
          if (phase === 'start') {
            writeEnvelope('pipeline_stage_start', {
              stage: payload.stage,
              attempt: payload.attempt,
            });
            return;
          }
          writeEnvelope('pipeline_stage_end', {
            stage: payload.stage,
            attempt: payload.attempt,
            durationMs: payload.durationMs ?? 0,
            status: payload.status ?? 'ok',
            ...(payload.error ? { error: payload.error } : {}),
          });
        },
      })
      .then((saved) => {
        writeEnvelope('template_saved', {
          templateId: saved.templateId,
          action: saved.action,
          name: saved.brief.name,
        });
        writeEnvelope('done', {});
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        writeEnvelope('error', { message });
        writeEnvelope('done', {});
      })
      .finally(() => {
        stopHeartbeat();
        if (!closed) {
          res.end();
        }
      });
  }

  private flushResponse(res: Response): void {
    const maybeFlush = res as Response & { flush?: () => void };
    maybeFlush.flush?.();
  }
}
