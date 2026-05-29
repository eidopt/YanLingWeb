import { type HttpClient, resolveHttpClient } from './http/HttpClient';
import type {
  AuthResponseDto,
  OAuthCallbackDto,
  UpdateUserDto,
  UserDto,
  UserTokenUsageSummaryDto,
} from '@shared/types/user.types';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly errorCode?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ErrorResponseBody {
  message?: string | { errorCode?: string; message?: string } | null;
  errorCode?: string;
  statusCode?: number;
  error?: string;
}

function extractError(res: Response, data: ErrorResponseBody): ApiError {
  // NestJS may nest our object under `message` (when using UnauthorizedException)
  // or spread it at top level (when using HttpException directly). Handle both.
  let errorCode: string | undefined;
  let message: string;

  if (typeof data.message === 'object' && data.message !== null) {
    errorCode = data.message.errorCode;
    message = data.message.message ?? `请求失败 (${res.status})`;
  } else if (typeof data.message === 'string' && data.message.length > 0) {
    message = data.message;
  } else {
    message = `请求失败 (${res.status})`;
  }

  // Top-level errorCode takes precedence (HttpException direct-object format)
  if (!errorCode && typeof data.errorCode === 'string') {
    errorCode = data.errorCode;
  }

  // If the nested object had no message, check top-level
  if (message === `请求失败 (${res.status})` && typeof data.message === 'string' && data.message.length > 0) {
    message = data.message;
  }

  return new ApiError(message, res.status, errorCode);
}

export class UserService {
  private readonly base = '/api/proxy/users';
  private readonly http: HttpClient;

  constructor(clientOrTokenProvider?: HttpClient | (() => string | null)) {
    this.http = resolveHttpClient(clientOrTokenProvider);
  }

  private async get<T>(path: string, auth = false): Promise<T> {
    const { data, response } = await this.http.json<T & ErrorResponseBody>(`${this.base}${path}`, { auth });
    if (!response.ok) {
      throw extractError(response, data);
    }
    return data;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const { data, response } = await this.http.json<T & ErrorResponseBody>(`${this.base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw extractError(response, data);
    }
    return data;
  }

  private async put<T>(path: string, body: unknown): Promise<T> {
    const { data, response } = await this.http.json<T & ErrorResponseBody>(`${this.base}${path}`, {
      method: 'PUT',
      auth: true,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw extractError(response, data);
    }
    return data;
  }

  requestChallenge(): Promise<{ nonce: string; expiresAt: string }> {
    return this.get('/auth/challenge');
  }

  login(identifier: string, password: string, nonce: string): Promise<AuthResponseDto> {
    return this.post<AuthResponseDto>('/login', { identifier, password, nonce });
  }

  register(dto: { username: string; password: string; email?: string }): Promise<AuthResponseDto> {
    return this.post<AuthResponseDto>('/register', dto);
  }

  getWechatQrCode(): Promise<{ qrUrl: string; state: string }> {
    return this.get('/oauth/qrcode?provider=wechat');
  }

  submitOAuthCallback(dto: OAuthCallbackDto): Promise<AuthResponseDto> {
    return this.post<AuthResponseDto>('/oauth/callback', dto);
  }

  getUser(id: string): Promise<UserDto> {
    return this.get<UserDto>(`/${id}`, true);
  }

  getCurrentUser(): Promise<UserDto> {
    return this.get<UserDto>('/me', true);
  }

  getTokenUsage(id: string): Promise<UserTokenUsageSummaryDto> {
    return this.get<UserTokenUsageSummaryDto>(`/${id}/token-usage`, true);
  }

  updateUser(id: string, dto: UpdateUserDto): Promise<UserDto> {
    return this.put<UserDto>(`/${id}`, dto);
  }
}
