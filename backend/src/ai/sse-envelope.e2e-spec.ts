import type { ThemeLayoutDocument } from '@shared/agent/contracts/agent';
import { Subject } from 'rxjs';

import type { AuthenticatedRequest } from '../auth/authenticatedRequest.interface';
import { AiController } from './ai.controller';
import type {
  AiService,
  EditorAgentStreamRequest,
  StreamRequest,
  StreamSseEvent,
} from './ai.service';
import { serializeSseEvent } from './sse/sseEnvelope';
import type { TemplateToolInput } from './tools/generateTemplate.tool';

interface MockAiService {
  getConfig: jest.Mock;
  getCacheStats: jest.Mock;
  getEditorConversation: jest.Mock;
  saveEditorConversation: jest.Mock;
  checkRateLimit: jest.Mock;
  hasConfiguredApiKey: jest.Mock;
  stream: jest.Mock;
  streamEditor: jest.Mock;
  saveTemplate: jest.Mock;
}

interface MockResponse {
  setHeader: jest.Mock;
  flushHeaders: jest.Mock;
  write: jest.Mock;
  end: jest.Mock;
  flush: jest.Mock;
}

function createService(): MockAiService {
  return {
    getConfig: jest.fn(),
    getCacheStats: jest.fn(),
    getEditorConversation: jest.fn(),
    saveEditorConversation: jest.fn(),
    checkRateLimit: jest.fn(),
    hasConfiguredApiKey: jest.fn(() => true),
    stream: jest.fn(),
    streamEditor: jest.fn(),
    saveTemplate: jest.fn<Promise<unknown>, [string, TemplateToolInput]>(),
  };
}

function createRequest(): AuthenticatedRequest {
  return {
    user: { sub: 'user-1', username: 'alice' },
    headers: {},
    on: jest.fn(),
  } as unknown as AuthenticatedRequest;
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

describe('SSE envelope E2E (T20/T21)', () => {
  it('controller forwards envelope-wrapped events to SSE wire format (T20)', () => {
    const service = createService();
    const controller = new AiController(service as unknown as AiService);

    const eventSubject = new Subject<StreamSseEvent>();
    service.stream.mockReturnValue(eventSubject.asObservable());

    const req = createRequest();
    const res = createResponse();
    const body: StreamRequest = {
      model: 'm',
      messages: [{ role: 'user', content: 'test' }],
    };

    await controller.streamProxy(
      body,
      req,
      res as unknown as Parameters<AiController['streamProxy']>[2],
    );

    expect(service.stream).toHaveBeenCalledTimes(1);
    const args = service.stream.mock.calls[0] as unknown[];
    expect(args[0]).toBe('user-1');
    expect(args[1]).toEqual(body);

    eventSubject.next({
      data: serializeSseEvent('tool_start', {
        name: 'foo',
        ts: '2026-06-09T00:00:00.000Z',
      }),
    });
    eventSubject.next({
      data: serializeSseEvent('text_delta', { text: 'hi' }),
    });
    eventSubject.next({
      data: serializeSseEvent('clarification', {
        question: 'which?',
        options: [{ label: 'A', value: 'a' }],
      }),
    });
    eventSubject.next({
      data: serializeSseEvent('done', { stopReason: 'end_turn' }),
    });
    eventSubject.complete();

    const writeCalls = res.write.mock.calls.map((c: unknown[]) => c[0] as string);
    const dataLines = writeCalls.filter((s: string) => s.startsWith('data: '));
    expect(dataLines.length).toBeGreaterThanOrEqual(4);

    const envelopes = dataLines.map(
      (line: string) => JSON.parse(line.replace(/^data: /, '').trim()) as Record<string, unknown>,
    );

    expect(envelopes[0]).toMatchObject({
      schema: 'sse.v1',
      type: 'tool_start',
      payload: { name: 'foo' },
    });
    expect(envelopes[1]).toMatchObject({
      schema: 'sse.v1',
      type: 'text_delta',
      payload: { text: 'hi' },
    });
    expect(envelopes[2]).toMatchObject({
      schema: 'sse.v1',
      type: 'clarification',
      payload: { question: 'which?' },
    });
    expect(envelopes[3]).toMatchObject({
      schema: 'sse.v1',
      type: 'done',
      payload: { stopReason: 'end_turn' },
    });

    for (const env of envelopes) {
      expect(env.schema).toBe('sse.v1');
      expect(typeof env.ts).toBe('string');
    }

    expect(res.end).toHaveBeenCalled();
  });

  it('editor controller forwards pipeline_stage envelopes (T20 derived)', () => {
    const service = createService();
    const controller = new AiController(service as unknown as AiService);

    const eventSubject = new Subject<StreamSseEvent>();
    service.streamEditor.mockReturnValue(eventSubject.asObservable());

    const req = createRequest();
    const res = createResponse();
    const body: EditorAgentStreamRequest = {
      prompt: 'edit',
      document: {} as ThemeLayoutDocument,
    };

    const resArg = res as unknown as Parameters<AiController['editorStream']>[2];
    await controller.editorStream(body, req, resArg);

    expect(service.streamEditor).toHaveBeenCalledTimes(1);

    eventSubject.next({
      data: serializeSseEvent('pipeline_stage_start', {
        stage: 'designer',
        attempt: 1,
      }),
    });
    eventSubject.next({
      data: serializeSseEvent('pipeline_stage_end', {
        stage: 'designer',
        attempt: 1,
        durationMs: 100,
        status: 'ok',
      }),
    });
    eventSubject.next({
      data: serializeSseEvent('done', { stopReason: 'end_turn' }),
    });
    eventSubject.complete();

    const writeCalls = res.write.mock.calls.map((c: unknown[]) => c[0] as string);
    const dataLines = writeCalls.filter((s: string) => s.startsWith('data: '));
    const envelopes = dataLines.map(
      (line: string) => JSON.parse(line.replace(/^data: /, '').trim()) as Record<string, unknown>,
    );

    expect(envelopes[0]).toMatchObject({
      type: 'pipeline_stage_start',
      payload: { stage: 'designer' },
    });
    expect(envelopes[1]).toMatchObject({
      type: 'pipeline_stage_end',
      payload: { stage: 'designer' },
    });
    expect(envelopes[2]).toMatchObject({
      type: 'done',
      payload: { stopReason: 'end_turn' },
    });
    expect(res.end).toHaveBeenCalled();
  });
});
