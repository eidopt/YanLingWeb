import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  NotFoundException,
  Optional,
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
import { UserQuotaService } from '../users/services/userQuota.service';
import {
  AiService,
  type EditorAgentStreamRequest,
  type SaveEditorAiConversationInput,
  type StreamRequest,
} from './ai.service';
import {
  AiChatRequestDto,
  SaveEditorConversationDto,
  SaveGeneratedTemplateDto,
} from './dto/aiRequest.dto';
import { PendingClarificationStore } from './pendingClarification.store';
import { EditorEditOutbox } from './services/editorEditOutbox.service';

/** Start a 5-second SSE heartbeat. Returns a cleanup function to stop it. */
function trackUnusedChatQuota(charged: boolean, release: () => Promise<void> | undefined) {
  let recordedUsage = false;
  let settled = false;
  return {
    note(data: string) {
      if (data.includes('"usage_summary"')) {
        recordedUsage = true;
      }
    },
    finish() {
      if (settled) {
        return;
      }
      settled = true;
      if (charged && !recordedUsage) {
        void release();
      }
    },
  };
}

function startSseHeartbeat(res: Response): () => void {
  const timer = setInterval(() => {
    res.write(':heartbeat\n\n');
  }, 5_000);
  timer.unref();
  return () => clearInterval(timer);
}

@ApiTags('ai')
@ApiSecurity('bearer')
@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,
    @Optional() private readonly userQuota?: UserQuotaService,
    @Optional() private readonly editorEditOutbox?: EditorEditOutbox,
    @Optional() private readonly clarifications?: PendingClarificationStore,
  ) {}

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
    @Body() body: SaveEditorConversationDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.aiService.saveEditorConversation(
      req.user.sub,
      templateId,
      body as SaveEditorAiConversationInput,
    );
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
  async streamProxy(
    @Body() body: AiChatRequestDto,
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ): Promise<void> {
    try {
      this.aiService.checkRateLimit(req.user.sub);
    } catch (err) {
      throw new HttpException(
        err instanceof Error ? err.message : 'Rate limit exceeded',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (this.userQuota && this.aiService.hasConfiguredApiKey()) {
      await this.userQuota.consumeFreeChatQuota(req.user.sub);
    }

    const cacheOptions = {
      conversationId: req.headers['x-conversation-id'] as string | undefined,
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
    const quotaRefund = trackUnusedChatQuota(
      Boolean(this.userQuota && this.aiService.hasConfiguredApiKey()),
      () => this.userQuota?.releaseFreeChatQuota(req.user.sub),
    );

    const subscription = this.aiService
      .stream(req.user.sub, body as StreamRequest, cacheOptions)
      .subscribe({
        next: (event) => {
          quotaRefund.note(event.data);
          res.write(`data: ${event.data}\n\n`);
          this.flushResponse(res);
        },
        error: (err: unknown) => {
          stopHeartbeat();
          quotaRefund.finish();
          const message = err instanceof Error ? err.message : String(err);
          res.write(`data: ${JSON.stringify({ type: 'error', message })}\n\n`);
          this.flushResponse(res);
          res.end();
        },
        complete: () => {
          stopHeartbeat();
          quotaRefund.finish();
          res.end();
        },
      });

    req.on('close', () => {
      stopHeartbeat();
      quotaRefund.finish();
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
  async editorStream(
    @Body() body: AiChatRequestDto,
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ): Promise<void> {
    try {
      this.aiService.checkRateLimit(req.user.sub);
    } catch (err) {
      throw new HttpException(
        err instanceof Error ? err.message : 'Rate limit exceeded',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const conversationHeader = req.headers['x-conversation-id'];
    const conversationId = typeof conversationHeader === 'string' ? conversationHeader : undefined;
    const clarificationChoice = body.clarificationChoice;
    const countExempt =
      this.clarifications?.consume(req.user.sub, conversationId, clarificationChoice) ?? false;
    if (this.userQuota && this.aiService.hasConfiguredApiKey()) {
      await this.userQuota.consumeFreeChatQuota(req.user.sub, { countExempt });
    }

    res.setHeader('content-type', 'text/event-stream; charset=utf-8');
    res.setHeader('cache-control', 'no-cache, no-transform');
    res.setHeader('connection', 'keep-alive');
    res.setHeader('x-accel-buffering', 'no');
    const cacheOptions = {
      conversationId: req.headers['x-conversation-id'] as string | undefined,
    };
    if (cacheOptions.conversationId) {
      res.setHeader('x-conversation-id', cacheOptions.conversationId);
    }
    res.flushHeaders();

    const stopHeartbeat = startSseHeartbeat(res);
    const quotaRefund = trackUnusedChatQuota(
      Boolean(this.userQuota && this.aiService.hasConfiguredApiKey() && !countExempt),
      () => this.userQuota?.releaseFreeChatQuota(req.user.sub),
    );

    const subscription = this.aiService
      .streamEditor(req.user.sub, body as StreamRequest | EditorAgentStreamRequest, cacheOptions)
      .subscribe({
        next: (event) => {
          quotaRefund.note(event.data);
          res.write(`data: ${event.data}\n\n`);
          this.flushResponse(res);
        },
        error: (err: unknown) => {
          stopHeartbeat();
          quotaRefund.finish();
          const message = err instanceof Error ? err.message : String(err);
          res.write(`data: ${JSON.stringify({ type: 'error', data: message })}\n\n`);
          this.flushResponse(res);
          res.end();
        },
        complete: () => {
          stopHeartbeat();
          quotaRefund.finish();
          res.end();
        },
      });

    req.on('close', () => {
      stopHeartbeat();
      quotaRefund.finish();
      subscription.unsubscribe();
    });
  }

  @Get('editor-edits/:editId')
  @ApiOperation({ summary: 'Fetch a large editor edit that was referenced by SSE' })
  async takeEditorEdit(@Param('editId') editId: string, @Req() req: AuthenticatedRequest) {
    const body = this.editorEditOutbox
      ? await this.editorEditOutbox.take(req.user.sub, editId)
      : null;
    if (body === null) {
      throw new NotFoundException('编辑结果不存在或已读取');
    }
    return { body };
  }

  @Post('templates')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Save a generated template to the database' })
  async saveTemplate(@Body() body: SaveGeneratedTemplateDto, @Req() req: AuthenticatedRequest) {
    return this.aiService.saveTemplate(req.user.sub, body);
  }

  private flushResponse(res: Response): void {
    const maybeFlush = res as Response & { flush?: () => void };
    maybeFlush.flush?.();
  }
}
