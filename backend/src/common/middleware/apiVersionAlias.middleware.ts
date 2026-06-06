export interface ApiVersionAliasRequest {
  url?: string;
}

export type ApiVersionAliasNext = () => void;

const VERSIONED_API_PREFIX = '/api/v1/';
const CANONICAL_API_PREFIX = '/api/';

export function normalizeApiVersionAliasUrl(url: string | undefined): string | undefined {
  if (!url?.startsWith(VERSIONED_API_PREFIX)) {
    return url;
  }

  return `${CANONICAL_API_PREFIX}${url.slice(VERSIONED_API_PREFIX.length)}`;
}

export function apiVersionAliasMiddleware(
  req: ApiVersionAliasRequest,
  _res: unknown,
  next: ApiVersionAliasNext,
): void {
  req.url = normalizeApiVersionAliasUrl(req.url);
  next();
}
