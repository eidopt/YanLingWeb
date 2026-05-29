/**
 * Catch-all proxy: /api/proxy/* → http://localhost:4000/api/*
 *
 * Usage from the frontend:
 *   fetch('/api/proxy/users/login', { method: 'POST', body: JSON.stringify(dto) })
 *   → proxied to → http://localhost:4000/api/users/login
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:4000';

async function proxy(req: NextRequest, segments: string[]): Promise<NextResponse> {
  const targetPath = segments.join('/');
  const search = req.nextUrl.search;
  const url = `${BACKEND_URL}/api/${targetPath}${search}`;

  const headers = new Headers();
  const contentType = req.headers.get('content-type');
  if (contentType) {
    headers.set('content-type', contentType);
  }
  const authorization = req.headers.get('authorization');
  if (authorization) {
    headers.set('authorization', authorization);
  }
  const conversationId = req.headers.get('x-conversation-id');
  if (conversationId) {
    headers.set('x-conversation-id', conversationId);
  }
  const previousResponseId = req.headers.get('x-previous-response-id');
  if (previousResponseId) {
    headers.set('x-previous-response-id', previousResponseId);
  }

  const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : req.body;

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method: req.method,
      headers,
      body,
      // @ts-expect-error -- Node 18+ fetch supports duplex for streaming bodies
      duplex: 'half',
    });
  } catch {
    return NextResponse.json({ message: `Backend service is unavailable at ${BACKEND_URL}` }, { status: 502 });
  }

  const responseHeaders = {
    'content-type': upstream.headers.get('content-type') ?? 'application/json',
  };

  if (responseHeaders['content-type'].includes('text/event-stream')) {
    const upstreamConversationId = upstream.headers.get('x-conversation-id');
    const upstreamResponseId = upstream.headers.get('x-response-id');
    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: {
        ...responseHeaders,
        'cache-control': upstream.headers.get('cache-control') ?? 'no-cache, no-transform',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
        ...(upstreamConversationId ? { 'x-conversation-id': upstreamConversationId } : {}),
        ...(upstreamResponseId ? { 'x-response-id': upstreamResponseId } : {}),
      },
    });
  }

  const data = await upstream.arrayBuffer();
  return new NextResponse(data, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

interface RouteContext {
  params: Promise<{ path: string[] }>;
}

export async function GET(req: NextRequest, ctx: RouteContext) {
  const { path } = await ctx.params;
  return proxy(req, path);
}
export async function POST(req: NextRequest, ctx: RouteContext) {
  const { path } = await ctx.params;
  return proxy(req, path);
}
export async function PUT(req: NextRequest, ctx: RouteContext) {
  const { path } = await ctx.params;
  return proxy(req, path);
}
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const { path } = await ctx.params;
  return proxy(req, path);
}
export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const { path } = await ctx.params;
  return proxy(req, path);
}
