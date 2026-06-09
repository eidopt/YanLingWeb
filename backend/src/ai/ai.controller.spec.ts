import { HttpException, HttpStatus } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';

import type { AuthenticatedRequest } from '../auth/authenticatedRequest.interface';
import { AiController } from './ai.controller';
import type {
  AiCacheStatsDto,
  AiConfigDto,
  AiService,
  EditorAgentStreamRequest,
  EditorAiConversationDto,
  SaveEditorAiConversationInput,
  StreamRequest,
  StreamSseEvent,
} from './ai.service';
import type { TemplateToolInput } from './tools/generateTemplate.tool';

interface MockAiService {
  getConfig: jest.Mock<AiConfigDto, []>;
  getCacheStats: jest.Mock<Promise<AiCacheStatsDto>, [string]>;
  getEditorConversation: jest.Mock<Promise<EditorAiConversationDto>, [string, string]>;
  saveEditorConversation: jest.Mock<
    Promise<EditorAiConversationDto>,
    [string, string, SaveEditorAiConversationInput]
  >;
  checkRateLimit: jest.Mock<void, [string]>;
  stream: jest.Mock<Observable<StreamSseEvent>, [string, StreamRequest, unknown]>;
  streamEditor: jest.Mock<
    Observable<StreamSseEvent>,
    [string, StreamRequest | EditorAgentStreamRequest, unknown]
  >;
  saveTemplate: jest.Mock<Promise<unknown>, [string, TemplateToolInput]>;
}

interface MockResponse {
  setHeader: jest.Mock;
  flushHeaders: jest.Mock;
  write: jest.Mock;
  end: jest.Mock;
  flush: jest.Mock;
}

type ResponseArg = Parameters<AiController['streamProxy']>[2];

interface StreamHarnessRequest extends AuthenticatedRequest {
  on: jest.Mock;
  closeHandlers: ((...args: unknown[]) => void)[];
}

interface Harness {
  controller: AiController;
  service: MockAiService;
}

function createService(): MockAiService {
  return {
    getConfig: jest.fn<AiConfigDto, []>(),
    getCacheStats: jest.fn<Promise<AiCacheStatsDto>, [string]>(),
    getEditorConversation: jest.fn<Promise<EditorAiConversationDto>, [string, string]>(),
    saveEditorConversation: jest.fn<
      Promise<EditorAiConversationDto>,
      [string, string, SaveEditorAiConversationInput]
    >(),
    checkRateLimit: jest.fn<void, [string]>(),
    stream: jest.fn<Observable<StreamSseEvent>, [string, StreamRequest, unknown]>(),
    streamEditor: jest.fn<
      Observable<StreamSseEvent>,
      [string, StreamRequest | EditorAgentStreamRequest, unknown]
    >(),
    saveTemplate: jest.fn<Promise<unknown>, [string, TemplateToolInput]>(),
  };
}

function createHarness(): Harness {
  const service = createService();
  const controller = new AiController(service as unknown as AiService);
  return { controller, service };
}

function createRequest(
  userId = 'user-1',
  headers: Record<string, string> = {},
): AuthenticatedRequest {
  return {
    user: { sub: userId, username: 'alice' },
    headers,
    on: jest.fn(),
  } as unknown as AuthenticatedRequest;
}

function createStreamRequest(
  headers: Record<string, string> = {},
  userId = 'user-1',
): StreamHarnessRequest {
  const closeHandlers: ((...args: unknown[]) => void)[] = [];
  const on = jest.fn((event: string, handler: (...args: unknown[]) => void) => {
    if (event === 'close') {
      closeHandlers.push(handler);
    }
  });
  return {
    user: { sub: userId, username: 'alice' },
    headers,
    on,
    closeHandlers,
  } as unknown as StreamHarnessRequest;
}

function createResponse(): MockResponse {
  return {
    setHeader: jest.fn(),
    flushHeaders: jest.fn(),
    write: jest.fn(),
    end: jest.fn(),
    flush: jest.fn(),
  };
}

function asResponse(res: MockResponse): ResponseArg {
  return res as unknown as ResponseArg;
}

describe('AiController', () => {
  describe('getConfig', () => {
    it('returns the AI provider configuration from the service', () => {
      const { controller, service } = createHarness();
      const config: AiConfigDto = {
        provider: 'openai',
        model: 'gpt-pro',
        models: { pro: 'gpt-pro', lite: 'gpt-lite' },
        semanticTargets: [],
      };
      service.getConfig.mockReturnValue(config);

      expect(controller.getConfig()).toBe(config);
      expect(service.getConfig).toHaveBeenCalledWith();
    });
  });

  describe('getCacheStats', () => {
    it('returns cache stats for the authenticated user', async () => {
      const { controller, service } = createHarness();
      const stats = { totalRequests: 3 } as unknown as AiCacheStatsDto;
      service.getCacheStats.mockResolvedValue(stats);

      await expect(controller.getCacheStats(createRequest('user-7'))).resolves.toBe(stats);
      expect(service.getCacheStats).toHaveBeenCalledWith('user-7');
    });
  });

  describe('getEditorConversation', () => {
    it('loads the persisted editor conversation for a template', async () => {
      const { controller, service } = createHarness();
      const dto: EditorAiConversationDto = {
        templateId: 'tpl-1',
        messages: [],
        updatedAt: null,
      };
      service.getEditorConversation.mockResolvedValue(dto);

      await expect(
        controller.getEditorConversation('tpl-1', createRequest('user-2')),
      ).resolves.toBe(dto);
      expect(service.getEditorConversation).toHaveBeenCalledWith('user-2', 'tpl-1');
    });
  });

  describe('saveEditorConversation', () => {
    it('persists the editor conversation for a template', async () => {
      const { controller, service } = createHarness();
      const body: SaveEditorAiConversationInput = { messages: [{ role: 'user' }] };
      const dto: EditorAiConversationDto = {
        templateId: 'tpl-5',
        messages: [],
        updatedAt: '2026-05-29T00:00:00.000Z',
      };
      service.saveEditorConversation.mockResolvedValue(dto);

      await expect(
        controller.saveEditorConversation('tpl-5', body, createRequest('user-3')),
      ).resolves.toBe(dto);
      expect(service.saveEditorConversation).toHaveBeenCalledWith('user-3', 'tpl-5', body);
    });
  });

  describe('saveTemplate', () => {
    it('forwards the generated template to the service for the authenticated user', async () => {
      const { controller, service } = createHarness();
      const body = { themeId: 'theme-1' } as unknown as TemplateToolInput;
      const result = { templateId: 'theme-1', action: 'created' };
      service.saveTemplate.mockResolvedValue(result);

      await expect(controller.saveTemplate(body, createRequest('user-4'))).resolves.toBe(result);
      expect(service.saveTemplate).toHaveBeenCalledWith('user-4', body);
    });
  });

  describe('streamProxy', () => {
    it('throws TOO_MANY_REQUESTS when the rate limit guard rejects', () => {
      const { controller, service } = createHarness();
      service.checkRateLimit.mockImplementation(() => {
        throw new Error('Rate limit exceeded: too many requests');
      });
      const req = createStreamRequest();
      const res = createResponse();
      const body = { model: 'm', messages: [] } as unknown as StreamRequest;

      try {
        controller.streamProxy(body, req, asResponse(res));
        throw new Error('expected streamProxy to throw');
      } catch (err) {
        expect(err).toBeInstanceOf(HttpException);
        expect((err as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
        expect((err as HttpException).message).toBe('Rate limit exceeded: too many requests');
      }

      expect(service.checkRateLimit).toHaveBeenCalledWith('user-1');
      expect(service.stream).not.toHaveBeenCalled();
    });

    it('sets SSE headers and subscribes to the stream with cache options from headers', () => {
      const { controller, service } = createHarness();
      const subject = new Subject<StreamSseEvent>();
      service.stream.mockReturnValue(subject.asObservable());
      const req = createStreamRequest({
        'x-conversation-id': 'conv-9',
        'x-previous-response-id': 'resp-9',
      });
      const res = createResponse();
      const body = { model: 'm', messages: [] } as unknown as StreamRequest;

      controller.streamProxy(body, req, asResponse(res));

      expect(service.checkRateLimit).toHaveBeenCalledWith('user-1');
      expect(service.stream).toHaveBeenCalledWith('user-1', body, {
        conversationId: 'conv-9',
        previousResponseId: 'resp-9',
      });
      expect(res.setHeader).toHaveBeenCalledWith(
        'content-type',
        'text/event-stream; charset=utf-8',
      );
      expect(res.setHeader).toHaveBeenCalledWith('x-conversation-id', 'conv-9');
      expect(res.flushHeaders).toHaveBeenCalled();

      subject.next({
        data: JSON.stringify({
          schema: 'sse.v1',
          type: 'text_delta',
          ts: '2026-06-09T00:00:00.000Z',
          payload: { text: 'hi' },
        }),
      });
      expect(res.write).toHaveBeenCalledWith(expect.stringContaining('"type":"text_delta"'));
      expect(res.flush).toHaveBeenCalled();

      subject.complete();
      expect(res.end).toHaveBeenCalled();
    });

    it('does not set the conversation-id header when absent', () => {
      const { controller, service } = createHarness();
      const subject = new Subject<StreamSseEvent>();
      service.stream.mockReturnValue(subject.asObservable());
      const req = createStreamRequest();
      const res = createResponse();
      const body = { messages: [] } as unknown as StreamRequest;

      controller.streamProxy(body, req, asResponse(res));

      expect(service.stream).toHaveBeenCalledWith('user-1', body, {
        conversationId: undefined,
        previousResponseId: undefined,
      });
      expect(res.setHeader).not.toHaveBeenCalledWith('x-conversation-id', expect.anything());
    });

    it('writes an error event and ends the response when the stream errors', () => {
      const { controller, service } = createHarness();
      const subject = new Subject<StreamSseEvent>();
      service.stream.mockReturnValue(subject.asObservable());
      const req = createStreamRequest();
      const res = createResponse();
      const body = { messages: [] } as unknown as StreamRequest;

      controller.streamProxy(body, req, asResponse(res));
      subject.error(new Error('boom'));

      expect(res.write).toHaveBeenCalledWith('data: {"type":"error","message":"boom"}\n\n');
      expect(res.end).toHaveBeenCalled();
    });

    it('unsubscribes from the stream when the request closes', () => {
      const { controller, service } = createHarness();
      const subject = new Subject<StreamSseEvent>();
      service.stream.mockReturnValue(subject.asObservable());
      const req = createStreamRequest();
      const res = createResponse();
      const body = { messages: [] } as unknown as StreamRequest;

      controller.streamProxy(body, req, asResponse(res));
      expect(req.closeHandlers).toHaveLength(1);

      req.closeHandlers[0]();
      subject.next({ data: 'late' });
      expect(res.write).not.toHaveBeenCalled();
    });
  });

  describe('editorStream', () => {
    it('throws TOO_MANY_REQUESTS when the rate limit guard rejects', () => {
      const { controller, service } = createHarness();
      service.checkRateLimit.mockImplementation(() => {
        throw new Error('slow down');
      });
      const req = createStreamRequest();
      const res = createResponse();
      const body = { messages: [] } as unknown as StreamRequest;

      try {
        controller.editorStream(body, req, asResponse(res));
        throw new Error('expected editorStream to throw');
      } catch (err) {
        expect(err).toBeInstanceOf(HttpException);
        expect((err as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
        expect((err as HttpException).message).toBe('slow down');
      }

      expect(service.streamEditor).not.toHaveBeenCalled();
    });

    it('sets SSE headers and subscribes to the editor stream with cache options', () => {
      const { controller, service } = createHarness();
      const subject = new Subject<StreamSseEvent>();
      service.streamEditor.mockReturnValue(subject.asObservable());
      const req = createStreamRequest(
        { 'x-conversation-id': 'conv-2', 'x-previous-response-id': 'resp-2' },
        'user-8',
      );
      const res = createResponse();
      const body = { prompt: 'hi', document: {} } as unknown as EditorAgentStreamRequest;

      controller.editorStream(body, req, asResponse(res));

      expect(service.checkRateLimit).toHaveBeenCalledWith('user-8');
      expect(service.streamEditor).toHaveBeenCalledWith('user-8', body, {
        conversationId: 'conv-2',
        previousResponseId: 'resp-2',
      });
      expect(res.setHeader).toHaveBeenCalledWith('x-conversation-id', 'conv-2');
      expect(res.flushHeaders).toHaveBeenCalled();

      subject.next({
        data: JSON.stringify({
          schema: 'sse.v1',
          type: 'text_delta',
          ts: '2026-06-09T00:00:00.000Z',
          payload: { text: 'hi' },
        }),
      });
      expect(res.write).toHaveBeenCalledWith(expect.stringContaining('"type":"text_delta"'));

      subject.complete();
      expect(res.end).toHaveBeenCalled();
    });

    it('writes an error event with a data field and ends the response on stream error', () => {
      const { controller, service } = createHarness();
      const subject = new Subject<StreamSseEvent>();
      service.streamEditor.mockReturnValue(subject.asObservable());
      const req = createStreamRequest();
      const res = createResponse();
      const body = { prompt: 'x', document: {} } as unknown as EditorAgentStreamRequest;

      controller.editorStream(body, req, asResponse(res));
      subject.error('kaboom');

      expect(res.write).toHaveBeenCalledWith('data: {"type":"error","data":"kaboom"}\n\n');
      expect(res.end).toHaveBeenCalled();
    });

    it('unsubscribes from the editor stream when the request closes', () => {
      const { controller, service } = createHarness();
      const subject = new Subject<StreamSseEvent>();
      service.streamEditor.mockReturnValue(subject.asObservable());
      const req = createStreamRequest();
      const res = createResponse();
      const body = { prompt: 'x', document: {} } as unknown as EditorAgentStreamRequest;

      controller.editorStream(body, req, asResponse(res));
      expect(req.closeHandlers).toHaveLength(1);

      req.closeHandlers[0]();
      subject.next({ data: 'late' });
      expect(res.write).not.toHaveBeenCalled();
    });
  });
});
