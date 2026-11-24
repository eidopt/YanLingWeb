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
 * Nonce-bound login proof: SHA-256(nonce + SHA-256(rawPassword)).
 * A captured proof cannot be reused with a newly issued nonce.
 */
export async function hashForLogin(nonce: string, passwordHash: string): Promise<string> {
  return sha256(nonce + passwordHash);
}
