import {
  apiVersionAliasMiddleware,
  type ApiVersionAliasRequest,
  normalizeApiVersionAliasUrl,
} from './api-version-alias.middleware';

describe('apiVersionAliasMiddleware', () => {
  it('rewrites /api/v1 routes to the canonical /api prefix', () => {
    expect(normalizeApiVersionAliasUrl('/api/v1/templates')).toBe('/api/templates');
    expect(normalizeApiVersionAliasUrl('/api/v1/templates?category=commerce')).toBe(
      '/api/templates?category=commerce',
    );
    expect(normalizeApiVersionAliasUrl('/api/v1/docs')).toBe('/api/docs');
  });

  it('leaves non-versioned and partial-prefix URLs unchanged', () => {
    expect(normalizeApiVersionAliasUrl('/api/templates')).toBe('/api/templates');
    expect(normalizeApiVersionAliasUrl('/api/v10/templates')).toBe('/api/v10/templates');
    expect(normalizeApiVersionAliasUrl('/api/v1')).toBe('/api/v1');
    expect(normalizeApiVersionAliasUrl(undefined)).toBeUndefined();
  });

  it('mutates request URL before continuing middleware chain', () => {
    const req: ApiVersionAliasRequest = { url: '/api/v1/search' };
    const next = jest.fn();

    apiVersionAliasMiddleware(req, {}, next);

    expect(req.url).toBe('/api/search');
    expect(next).toHaveBeenCalledTimes(1);
  });
});
