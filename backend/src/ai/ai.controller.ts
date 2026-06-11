import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Put,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';

import { AuthenticatedRequest } from '../auth/authenticatedRequest.interface';
import { JwtAuthGuard } from '../auth/jwtAuth.guard';
import {
  AiService,
  type EditorAgentStreamRequest,
  type SaveEditorAiConversationInput,
  type StreamRequest,
} from './ai.service';
import { serializeSseEvent } from './sse/sseEnvelope';
import type { TemplateToolInput } from './tools/generateTemplate.tool';

/** Start a 5-second SSE heartbeat. Returns a cleanup function to stop it. */
function startSseHeartbeat(res: Response): () => void {
  const timer = setInterval(() => {
    res.write(':heartbeat\n\n');
  }, 5_000);
  return () => clearInterval(timer);
}

@ApiTags('ai')
@ApiSecurity('bearer')
@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Get('config')
  @ApiOperation({ summary: 'Get AI provider configuration (provider name + model)' })
  getConfig() {
    return this.aiService.getConfig();
  }

  @Get('cache-stats')
  @ApiOperation({ summary: 'Get recent AI cache hit statistics' })
  getCacheStats(@Req() req: AuthenticatedRequest) {
    return this.aiService.getCacheStats(req.user.sub);
  }

  @Get('editor-conversations/:templateId')
  @ApiOperation({ summary: 'Get persisted editor AI conversation for one template' })
  getEditorConversation(@Param('templateId') templateId: string, @Req() req: AuthenticatedRequest) {
    return this.aiService.getEditorConversation(req.user.sub, templateId);
  }

  @Put('editor-conversations/:templateId')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Persist editor AI conversation for one template' })
  saveEditorConversation(
    @Param('templateId') templateId: string,
    @Body() body: SaveEditorAiConversationInput,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.aiService.saveEditorConversation(req.user.sub, templateId, body);
  }

  @Post('stream')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Proxy a streaming LLM request (rate-limited per user)' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { model: { type: 'string' }, messages: { type: 'array' } },
    },
  })
  streamProxy(
    @Body() body: StreamRequest,
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ): void {
    try {
      this.aiService.checkRateLimit(req.user.sub);
    } catch (err) {
      throw new HttpException(
        err instanceof Error ? err.message : 'Rate limit exceeded',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const cacheOptions = {
      conversationId: req.headers['x-conversation-id'] as string | undefined,
      previousResponseId: req.headers['x-previous-response-id'] as string | undefined,
    };

    res.setHeader('content-type', 'text/event-stream; charset=utf-8');
    res.setHeader('cache-control', 'no-cache, no-transform');
    res.setHeader('connection', 'keep-alive');
    res.setHeader('x-accel-buffering', 'no');
    if (cacheOptions.conversationId) {
      res.setHeader('x-conversation-id', cacheOptions.conversationId);
    }
    res.flushHeaders();

    const stopHeartbeat = startSseHeartbeat(res);

    const subscription = this.aiService
      .stream(req.user.sub, body, cacheOptions, (phase, payload) => {
        // 注入 pipeline stage 事件, 包 envelope 后写入 SSE
        const type = phase === 'start' ? 'pipeline_stage_start' : 'pipeline_stage_end';
        const data = serializeSseEvent(type, payload as never);
        res.write(`data: ${data}\n\n`);
        this.flushResponse(res);
      })
      .subscribe({
        next: (event) => {
          res.write(`data: ${event.data}\n\n`);
          this.flushResponse(res);
        },
        error: (err: unknown) => {
          stopHeartbeat();
          const message = err instanceof Error ? err.message : String(err);
          res.write(`data: ${JSON.stringify({ type: 'error', message })}\n\n`);
          this.flushResponse(res);
          res.end();
        },
        complete: () => {
          stopHeartbeat();
          res.end();
        },
      });

    req.on('close', () => {
      stopHeartbeat();
      subscription.unsubscribe();
    });
  }

  @Post('editor')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Run the editor AI copilot against backend LLM streaming' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { model: { type: 'string' }, messages: { type: 'array' } },
    },
  })
  editorStream(
    @Body() body: StreamRequest | EditorAgentStreamRequest,
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ): void {
    try {
      this.aiService.checkRateLimit(req.user.sub);
    } catch (err) {
      throw new HttpException(
        err instanceof Error ? err.message : 'Rate limit exceeded',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    res.setHeader('content-type', 'text/event-stream; charset=utf-8');
    res.setHeader('cache-control', 'no-cache, no-transform');
    res.setHeader('connection', 'keep-alive');
    res.setHeader('x-accel-buffering', 'no');
    const cacheOptions = {
      conversationId: req.headers['x-conversation-id'] as string | undefined,
      previousResponseId: req.headers['x-previous-response-id'] as string | undefined,
    };
    if (cacheOptions.conversationId) {
      res.setHeader('x-conversation-id', cacheOptions.conversationId);
    }
    res.flushHeaders();

    const stopHeartbeat = startSseHeartbeat(res);

    const subscription = this.aiService.streamEditor(req.user.sub, body, cacheOptions).subscribe({
      next: (event) => {
        res.write(`data: ${event.data}\n\n`);
        this.flushResponse(res);
      },
      error: (err: unknown) => {
        stopHeartbeat();
        const message = err instanceof Error ? err.message : String(err);
        res.write(`data: ${JSON.stringify({ type: 'error', data: message })}\n\n`);
        this.flushResponse(res);
        res.end();
      },
      complete: () => {
        stopHeartbeat();
        res.end();
      },
    });

    req.on('close', () => {
      stopHeartbeat();
      subscription.unsubscribe();
    });
  }

  @Post('templates')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Save a generated template to the database' })
  async saveTemplate(@Body() body: TemplateToolInput, @Req() req: AuthenticatedRequest) {
    return this.aiService.saveTemplate(req.user.sub, body);
  }

  private flushResponse(res: Response): void {
    const maybeFlush = res as Response & { flush?: () => void };
    maybeFlush.flush?.();
  }
}
