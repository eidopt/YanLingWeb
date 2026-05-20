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
import type { Request, Response } from 'express';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  AiService,
  type SaveEditorAiConversationInput,
  type StreamRequest,
} from './ai.service';
import type { TemplateToolInput } from './tools/generate-template.tool';

interface AuthenticatedRequest extends Request {
  user: { sub: string; username: string; };
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

  @Get('editor-conversations/:templateId')
  @ApiOperation({ summary: 'Get persisted editor AI conversation for one template' })
  getEditorConversation(
    @Param('templateId') templateId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.aiService.getEditorConversation(req.user.sub, templateId);
  }

  @Put('editor-conversations/:templateId')
  @ApiOperation({ summary: 'Persist editor AI conversation for one template' })
  saveEditorConversation(
    @Param('templateId') templateId: string,
    @Body() body: SaveEditorAiConversationInput,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.aiService.saveEditorConversation(
      req.user.sub,
      templateId,
      body,
    );
  }

  @Post('stream')
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

    const subscription = this.aiService.stream(req.user.sub, body, cacheOptions).subscribe({
      next: (event) => {
        res.write(`data: ${event.data}\n\n`);
        this.flushResponse(res);
      },
      error: (err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        res.write(`data: ${JSON.stringify({ type: 'error', message })}\n\n`);
        this.flushResponse(res);
        res.end();
      },
      complete: () => {
        res.end();
      },
    });

    req.on('close', () => {
      subscription.unsubscribe();
    });
  }

  @Post('editor')
  @ApiOperation({ summary: 'Run the editor AI copilot against backend LLM streaming' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { model: { type: 'string' }, messages: { type: 'array' } },
    },
  })
  editorStream(
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

    res.setHeader('content-type', 'text/event-stream; charset=utf-8');
    res.setHeader('cache-control', 'no-cache, no-transform');
    res.setHeader('connection', 'keep-alive');
    res.setHeader('x-accel-buffering', 'no');
    res.flushHeaders();

    const subscription = this.aiService.streamEditor(req.user.sub, body).subscribe({
      next: (event) => {
        res.write(`data: ${event.data}\n\n`);
        this.flushResponse(res);
      },
      error: (err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        res.write(`data: ${JSON.stringify({ type: 'error', data: message })}\n\n`);
        this.flushResponse(res);
        res.end();
      },
      complete: () => {
        res.end();
      },
    });

    req.on('close', () => {
      subscription.unsubscribe();
    });
  }

  @Post('templates')
  @ApiOperation({ summary: 'Save a generated template to the database' })
  async saveTemplate(
    @Body() body: TemplateToolInput,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.aiService.saveTemplate(req.user.sub, body);
  }

  private flushResponse(res: Response): void {
    const maybeFlush = res as Response & { flush?: () => void; };
    maybeFlush.flush?.();
  }
}
