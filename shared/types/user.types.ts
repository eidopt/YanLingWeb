// Shared user types — used by both frontend (Next.js) and backend (NestJS)

export type LoginType = 'local' | 'wechat' | 'qq';

export interface UserDto {
  id: string;
  username: string;
  email: string | null;
  phone: string | null;
  linkedLogins: LoginType[];
  /** Cumulative AI tokens consumed (stored as bigint in DB, safe as JS number up to 9×10¹⁵) */
  tokensUsed: number;
  /** Remaining purchased token quota */
  tokensBalance: number;
  /** Account balance in cents (100 = ¥1.00) */
  balanceCents: number;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface UserTokenUsageEventDto {
  id: string;
  endpoint: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheHitTokens: number | null;
  cacheMissTokens: number | null;
  createdAt: string;
}

export interface UserTokenUsageSummaryDto {
  ownerUserId: string;
  /** Cumulative value stored on the user account. */
  tokensUsed: number;
  tokensBalance: number;
  balanceCents: number;
  /** Sum of recorded AI request input tokens. */
  inputTokens: number;
  /** Sum of recorded AI request output tokens. */
  outputTokens: number;
  /** Sum of detailed usage rows; may be lower than tokensUsed for legacy usage. */
  recordedTokens: number;
  requestCount: number;
  recent: UserTokenUsageEventDto[];
}

export interface RegisterDto {
  username: string;
  password: string;
  email?: string;
  phone?: string;
}

export interface LoginDto {
  /** Username, email, or phone */
  identifier: string;
  password: string;
}

export interface OAuthCallbackDto {
  provider: 'wechat' | 'qq';
  /** Authorization code returned by the OAuth provider */
  code: string;
  /** State token (CSRF protection) */
  state: string;
}

export interface OAuthQrCodeDto {
  /** URL to embed in a QR code image */
  qrUrl: string;
  /** State token to verify on callback */
  state: string;
}

export interface UpdateUserDto {
  username?: string;
  email?: string;
  phone?: string;
  /** New password — requires currentPassword */
  password?: string;
  currentPassword?: string;
}

export interface AuthResponseDto {
  accessToken: string;
  user: UserDto;
}
