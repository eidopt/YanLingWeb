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
