/**
 * Password hashing utilities — all crypto happens in the browser.
 * Plaintext passwords never leave the client.
 */

async function sha256(input: string): Promise<string> {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Step 1 — hash the raw password once.
 * Used for registration (sent as-is) and as the base for login.
 */
export async function hashPassword(password: string): Promise<string> {
  return sha256(password);
}

/**
 * @deprecated No longer needed. The login protocol now sends SHA256(rawPassword)
 * directly; the nonce is consumed server-side for anti-replay only and does NOT
 * participate in password hashing.
 *
 * Kept for reference. Will be removed in a future cleanup.
 */
export async function hashForLogin(nonce: string, passwordHash: string): Promise<string> {
  return sha256(nonce + passwordHash);
}
