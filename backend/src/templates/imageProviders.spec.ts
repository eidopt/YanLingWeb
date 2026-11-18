import { generateImageBytes } from './imageGeneration';
import {
  type ImageProviderAdapter,
  registerImageProviderAdapter,
  resolveImageEndpointUrl,
  resolveImageProviderAdapter,
} from './imageProviders';

function mockJsonFetch(
  payload: unknown,
  options: { ok?: boolean; status?: number } = {},
): jest.Mock<Promise<Response>, [string | URL | Request, RequestInit?]> {
  const fn = jest
    .fn<Promise<Response>, [string | URL | Request, RequestInit?]>()
    .mockResolvedValue({
      ok: options.ok ?? true,
      status: options.status ?? 200,
      text: () => Promise.resolve(JSON.stringify(payload)),
    } as Response);
  globalThis.fetch = fn;
  return fn;
}

describe('imageProviders', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe('resolveImageEndpointUrl', () => {
    it('keeps complete generation endpoint URLs verbatim without double path', () => {
      expect(
        resolveImageEndpointUrl(
          'https://api.minimax.cn/v1/images/generations',
          '/images/generations',
        ),
      ).toBe('https://api.minimax.cn/v1/images/generations');

      expect(
        resolveImageEndpointUrl(
          'https://api.minimaxi.com/v1/image_generation',
          '/image_generation',
        ),
      ).toBe('https://api.minimaxi.com/v1/image_generation');

      expect(
        resolveImageEndpointUrl(
          'https://other-vendor.example.com/v2/text2img',
          '/images/generations',
        ),
      ).toBe('https://other-vendor.example.com/v2/text2img');
    });

    it('appends default endpoint path when given a base prefix URL', () => {
      expect(resolveImageEndpointUrl('https://api.openai.com/v1/', '/images/generations')).toBe(
        'https://api.openai.com/v1/images/generations',
      );
      expect(resolveImageEndpointUrl('https://api.minimaxi.com/v1', '/images/generations')).toBe(
        'https://api.minimaxi.com/v1/images/generations',
      );
      expect(
        resolveImageEndpointUrl('https://ark.cn-beijing.volces.com/api/v3', '/images/generations'),
      ).toBe('https://ark.cn-beijing.volces.com/api/v3/images/generations');
      expect(resolveImageEndpointUrl(undefined, '/images/generations')).toBe(
        'https://api.openai.com/v1/images/generations',
      );
    });
  });

  describe('MiniMax adapters', () => {
    it('sends MiniMax H3 OpenAI-compatible request with PNG format and mapped size', async () => {
      const fetchMock = mockJsonFetch({
        data: [{ b64_json: Buffer.from('fake-png-bytes').toString('base64') }],
      });

      const bytes = await generateImageBytes(
        {
          apiKey: 'sk-minimax-test',
          baseUrl: 'https://api.minimax.cn/v1/images/generations',
          model: 'MiniMax-H3-Image-Highspeed',
        },
        'minimalist coffee hero',
        { aspectRatio: '16:9', outputFormat: 'png' },
      );

      expect(bytes.toString()).toBe('fake-png-bytes');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [calledUrl, init] = fetchMock.mock.calls[0];
      expect(calledUrl).toBe('https://api.minimax.cn/v1/images/generations');
      const parsedBody = JSON.parse(init?.body as string) as Record<string, unknown>;
      expect(parsedBody).toEqual({
        model: 'MiniMax-H3-Image-Highspeed',
        prompt: 'minimalist coffee hero',
        n: 1,
        size: '1280x720',
        output_format: 'png',
      });
      expect(parsedBody).not.toHaveProperty('aspect_ratio');
      expect(parsedBody).not.toHaveProperty('area');
    });

    it('surfaces item-level data[0].error from MiniMax H3 response', async () => {
      mockJsonFetch({
        data: [{ error: { code: 1026, message: 'sensitive content blocked' } }],
      });

      await expect(
        generateImageBytes(
          {
            apiKey: 'sk-minimax-test',
            baseUrl: 'https://api.minimax.cn/v1/images/generations',
            model: 'MiniMax-H3-Image-Highspeed',
          },
          'test prompt',
        ),
      ).rejects.toThrow(/1026.*sensitive content blocked/);
    });

    it('routes MiniMax legacy native endpoint (/image_generation) cleanly', async () => {
      const fetchMock = mockJsonFetch({
        data: { image_base64: [Buffer.from('native-bytes').toString('base64')] },
        base_resp: { status_code: 0, status_msg: 'success' },
      });

      const bytes = await generateImageBytes(
        {
          apiKey: 'sk-minimax-native',
          baseUrl: 'https://api.minimaxi.com/v1/image_generation',
          model: 'image-01',
        },
        'fresh fruit banner',
        { aspectRatio: '4:3' },
      );

      expect(bytes.toString()).toBe('native-bytes');
      const [calledUrl, init] = fetchMock.mock.calls[0];
      expect(calledUrl).toBe('https://api.minimaxi.com/v1/image_generation');
      expect(JSON.parse(init?.body as string)).toEqual({
        model: 'image-01',
        prompt: 'fresh fruit banner',
        n: 1,
        aspect_ratio: '4:3',
        response_format: 'base64',
      });
    });
  });

  describe('careful retry and extensibility', () => {
    it('does not retry on 503 or TimeoutError when maxRetries defaults to 0', async () => {
      const fetch503 = mockJsonFetch({ error: { message: 'busy' } }, { ok: false, status: 503 });

      await expect(
        generateImageBytes(
          {
            apiKey: 'sk-test',
            baseUrl: 'https://api.minimax.cn/v1/images/generations',
            model: 'MiniMax-H3-Image-Highspeed',
          },
          'test',
        ),
      ).rejects.toThrow(/HTTP 503: busy/);
      expect(fetch503).toHaveBeenCalledTimes(1);

      const timeoutErr = Object.assign(new Error('The operation timed out'), {
        name: 'TimeoutError',
      });
      const fetchTimeout = jest
        .fn<Promise<Response>, [string | URL | Request, RequestInit?]>()
        .mockRejectedValue(timeoutErr);
      globalThis.fetch = fetchTimeout;

      await expect(
        generateImageBytes(
          {
            apiKey: 'sk-test',
            baseUrl: 'https://api.minimax.cn/v1/images/generations',
            model: 'MiniMax-H3-Image-Highspeed',
            maxRetries: 2,
          },
          'test',
        ),
      ).rejects.toThrow(/timed out/);
      expect(fetchTimeout).toHaveBeenCalledTimes(1);
    });

    it('allows explicit AI_IMAGE_PROVIDER override and custom adapter registration', () => {
      const customAdapter: ImageProviderAdapter = {
        id: 'custom-flux',
        matches: (cfg) => cfg.model.startsWith('flux-'),
        generate: () => Promise.resolve(Buffer.from('custom-flux-bytes')),
      };
      registerImageProviderAdapter(customAdapter);

      expect(
        resolveImageProviderAdapter({
          apiKey: 'sk-x',
          model: 'flux-pro',
        }).id,
      ).toBe('custom-flux');

      expect(
        resolveImageProviderAdapter({
          provider: 'openai-compatible',
          apiKey: 'sk-x',
          baseUrl: 'https://api.minimax.cn/v1/images/generations',
          model: 'MiniMax-H3-Image-Highspeed',
        }).id,
      ).toBe('openai-compatible');
    });
  });
});
