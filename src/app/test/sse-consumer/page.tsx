'use client';

import type { SseEventEnvelope, SseEventType } from '@shared/agent/contracts/sseEvents';
import { BackendProxyProvider } from 'ai/core/providers/backendProxy.provider';
import type { ProviderStreamEvent } from 'ai/core/providers/types';
import { useEffect } from 'react';

declare global {
  interface Window {
    __sseReceived: SseEventEnvelope<SseEventType, unknown>[];
    __sseFinished: ProviderStreamEvent[];
    __startSseTest: () => void;
  }
}

export default function SseConsumerPage() {
  useEffect(() => {
    window.__sseReceived = [];
    window.__sseFinished = [];

    const provider = new BackendProxyProvider(
      () => 'test-token-bypass',
      undefined,
      undefined,
      (envelope) => {
        window.__sseReceived.push(envelope);
      },
    );

    window.__startSseTest = () => {
      // 触发一次 stream (实际 E2E 用 page.route 拦截返 mock SSE)
      void (async () => {
        const events: ProviderStreamEvent[] = [];
        for await (const ev of provider.stream({
          model: 'm',
          messages: [{ role: 'user', content: 'test' }],
        })) {
          events.push(ev);
        }
        window.__sseFinished = events;
      })();
    };
  }, []);

  return (
    <div>
      <h1>SSE Consumer Test Page</h1>
      <p>Open console and run window.__startSseTest() to start.</p>
    </div>
  );
}
