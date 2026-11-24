import { lastValueFrom, of } from 'rxjs';

import { ApiResponseInterceptor } from './apiResponse.interceptor';

function createContext(path = '/api/templates') {
  const response = {
    headersSent: false,
    getHeader: jest.fn<unknown, [string]>(),
  };
  const request = {
    originalUrl: path,
    url: path,
  };

  return {
    context: {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    },
    response,
  };
}

describe('ApiResponseInterceptor', () => {
  const interceptor = new ApiResponseInterceptor();

  it('wraps object payloads inside data without repeating them at the root', async () => {
    const { context } = createContext('/api/users/me');
    const result = await lastValueFrom(
      interceptor.intercept(context as never, {
        handle: () => of({ id: 'user-1', username: 'demo' }),
      }),
    );

    expect(result).toMatchObject({
      success: true,
      path: '/api/users/me',
      data: {
        id: 'user-1',
        username: 'demo',
      },
    });
    expect(result).not.toHaveProperty('id');
    expect(result).toHaveProperty('timestamp', expect.any(String));
  });

  it('wraps arrays with count metadata', async () => {
    const { context } = createContext('/api/templates');
    const result = await lastValueFrom(
      interceptor.intercept(context as never, { handle: () => of([{ id: 'a' }, { id: 'b' }]) }),
    );

    expect(result).toMatchObject({
      success: true,
      data: [{ id: 'a' }, { id: 'b' }],
      meta: { count: 2 },
    });
  });

  it('promotes paginated payloads into pagination metadata', async () => {
    const { context } = createContext('/api/exports');
    const result = await lastValueFrom(
      interceptor.intercept(context as never, {
        handle: () => of({ data: [{ id: 'export-1' }], total: 5 }),
      }),
    );

    expect(result).toMatchObject({
      success: true,
      data: [{ id: 'export-1' }],
      meta: {
        pagination: {
          total: 5,
          count: 1,
        },
      },
    });
    expect(result).not.toHaveProperty('total');
  });

  it('bypasses event streams and already wrapped payloads', async () => {
    const stream = createContext('/api/proxy/ai/editor');
    stream.response.getHeader.mockReturnValue('text/event-stream; charset=utf-8');

    await expect(
      lastValueFrom(
        interceptor.intercept(stream.context as never, { handle: () => of(undefined) }),
      ),
    ).resolves.toBeUndefined();

    const wrapped = {
      success: true,
      data: { ok: true },
      timestamp: '2026-05-29T00:00:00.000Z',
      path: '/api/custom',
    };
    const regular = createContext('/api/custom');
    await expect(
      lastValueFrom(interceptor.intercept(regular.context as never, { handle: () => of(wrapped) })),
    ).resolves.toBe(wrapped);
  });
});
