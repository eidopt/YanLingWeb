import { createHmac, timingSafeEqual } from 'crypto';

const SIGNATURE_TTL_SECONDS = 30 * 24 * 60 * 60;

export function appendAssetSignature(url: string, relativePath: string, secret: string): string {
  const exp = Math.floor(Date.now() / 1000) + SIGNATURE_TTL_SECONDS;
  const sig = signAssetPath(secret, relativePath, exp);
  const joiner = url.includes('?') ? '&' : '?';
  return `${url}${joiner}exp=${exp}&sig=${sig}`;
}

export function assetSignatureMatches(
  secret: string,
  relativePath: string,
  expRaw: unknown,
  sigRaw: unknown,
): boolean {
  const exp = typeof expRaw === 'string' ? Number(expRaw) : NaN;
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) {
    return false;
  }
  if (typeof sigRaw !== 'string' || sigRaw.length === 0) {
    return false;
  }
  const expected = signAssetPath(secret, relativePath, exp);
  const left = Buffer.from(expected);
  const right = Buffer.from(sigRaw);
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

function signAssetPath(secret: string, relativePath: string, exp: number): string {
  return createHmac('sha256', secret).update(`${relativePath}:${exp}`).digest('base64url');
}
