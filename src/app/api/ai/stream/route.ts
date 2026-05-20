/**
 * SSE proxy: POST /api/ai/stream → http://localhost:4000/api/ai/stream
 *
 * Next.js buffers normal proxy responses, which breaks SSE.
 * This route streams the backend response chunk-by-chunk using ReadableStream.
 */
import type { NextRequest } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:4000';

export async function POST(req: NextRequest) {
  const authorization = req.headers.get('authorization');
  const conversationId = req.headers.get('x-conversation-id');
  const previousResponseId = req.headers.get('x-previous-response-id');
  const body = await req.text();

  const upstream = await fetch(`${BACKEND_URL}/api/ai/stream`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(authorization ? { authorization } : {}),
      ...(conversationId ? { 'x-conversation-id': conversationId } : {}),
      ...(previousResponseId
        ? { 'x-previous-response-id': previousResponseId }
        : {}),
    },
    body,
    // @ts-expect-error — Node 18+ supports duplex for streaming
    duplex: 'half',
  });

  if (!upstream.ok) {
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { 'content-type': 'application/json' },
    });
  }

  // Stream the SSE response through without buffering
  const stream = new ReadableStream({
    async start(controller) {
      // body is always present on a non-null Response from fetch
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const reader = upstream.body!.getReader();

      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) { break; }
          controller.enqueue(value);
        }
      } finally {
        reader.releaseLock();
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  });
}
