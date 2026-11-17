import { type AiGenerateEvent, TemplateAiService } from './templateAi.service';
import { SSE_EVENT_SCHEMA_VERSION, type SseEventType } from '@shared/agent/contracts/sseEvents';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { HttpClient, HttpStreamEvent } from 'services/http/HttpClient';

function sseLine(type: SseEventType, payload: unknown): HttpStreamEvent {
  return {
    data: JSON.stringify({
      schema: SSE_EVENT_SCHEMA_VERSION,
      type,
      ts: '2026-11-18T00:00:00.000Z',
      payload,
    }),
  };
}

function createMockHttpClient(
  handler: (path: string, init?: RequestInit) => { status: number; events: AsyncIterable<HttpStreamEvent> },
): HttpClient {
  return {
    json: () => Promise.reject(new Error('unexpected json call')),
    stream: (path, options) => {
      const res = handler(path, options);
      return Promise.resolve({
        response: new Response(null, { status: res.status }),
        events: res.events,
      });
    },
  };
}

void describe('TemplateAiService', () => {
  void it('streams pipeline_stage, template_saved, and done from backend aiTemplates endpoint', async () => {
    const events: AiGenerateEvent[] = [];
    let requestedPath = '';
    let requestedBody = '';

    const http = createMockHttpClient((path, init) => {
      requestedPath = path;
      requestedBody = typeof init?.body === 'string' ? init.body : '';
      async function* stream() {
        await Promise.resolve();
        yield sseLine('pipeline_stage_start', { stage: 'designer', attempt: 1 });
        yield sseLine('pipeline_stage_end', {
          stage: 'designer',
          attempt: 1,
          durationMs: 120,
          status: 'ok',
        });
        yield sseLine('template_saved', {
          templateId: 'tpl-clinic',
          action: 'created',
          name: '口腔预约助手',
        });
        yield sseLine('done', {});
      }
      return { status: 200, events: stream() };
    });

    const service = new TemplateAiService(() => 'token-123', undefined, http);
    await service.generate({
      prompt: '口腔预约助手',
      onEvent: (event) => events.push(event),
    });

    assert.equal(requestedPath, '/api/proxy/aiTemplates/generate/stream');
    assert.deepEqual(JSON.parse(requestedBody), { prompt: '口腔预约助手' });
    assert.deepEqual(
      events.map((e) => e.type),
      ['pipeline_stage', 'pipeline_stage', 'template_saved', 'done'],
    );
    assert.deepEqual(JSON.parse(events[0].data), {
      phase: 'start',
      stage: 'designer',
      attempt: 1,
    });
    assert.deepEqual(JSON.parse(events[1].data), {
      phase: 'end',
      stage: 'designer',
      attempt: 1,
      durationMs: 120,
      status: 'ok',
    });
    assert.deepEqual(JSON.parse(events[2].data), {
      templateId: 'tpl-clinic',
      action: 'created',
      name: '口腔预约助手',
    });
  });

  void it('drops events from a stale generate() call when a newer call starts', async () => {
    const eventsFirst: AiGenerateEvent[] = [];
    const eventsSecond: AiGenerateEvent[] = [];
    let releaseFirst: (() => void) | undefined;

    let callIndex = 0;
    const http = createMockHttpClient(() => {
      callIndex += 1;
      if (callIndex === 1) {
        async function* firstStream() {
          await new Promise<void>((resolve) => {
            releaseFirst = resolve;
          });
          yield sseLine('pipeline_stage_start', { stage: 'designer', attempt: 1 });
          yield sseLine('done', {});
        }
        return { status: 200, events: firstStream() };
      }
      async function* secondStream() {
        await Promise.resolve();
        yield sseLine('pipeline_stage_start', { stage: 'critic', attempt: 1 });
        yield sseLine('done', {});
      }
      return { status: 200, events: secondStream() };
    });

    const service = new TemplateAiService(() => 'token-123', undefined, http);
    const firstPromise = service.generate({
      prompt: 'first',
      onEvent: (e) => eventsFirst.push(e),
    });
    const secondPromise = service.generate({
      prompt: 'second',
      onEvent: (e) => eventsSecond.push(e),
    });

    await secondPromise;
    releaseFirst?.();
    await firstPromise;

    assert.equal(eventsFirst.length, 0);
    assert.deepEqual(
      eventsSecond.map((e) => e.type),
      ['pipeline_stage', 'done'],
    );
  });

  void it('invokes onAuthExpired and emits error on 401', async () => {
    let authExpiredCalled = false;
    const events: AiGenerateEvent[] = [];

    const http = createMockHttpClient(() => {
      async function* empty() {
        // empty
      }
      return { status: 401, events: empty() };
    });

    const service = new TemplateAiService(
      () => 'expired-token',
      () => {
        authExpiredCalled = true;
      },
      http,
    );
    await service.generate({
      prompt: 'test',
      onEvent: (e) => events.push(e),
    });

    assert.equal(authExpiredCalled, true);
    assert.deepEqual(
      events.map((e) => e.type),
      ['error', 'done'],
    );
  });
});
