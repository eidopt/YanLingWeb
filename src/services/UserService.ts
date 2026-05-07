import type { AuthResponseDto, OAuthCallbackDto } from '@shared/types/user.types';

export class UserService {
  private readonly base = '/api/proxy/users';

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.base}${path}`);
    const data = await res.json() as T & { message?: string };
    if (!res.ok) {
      throw new Error(
        (data as { message?: string }).message ?? `Request failed (${res.status})`,
      );
    }
    return data;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json() as T & { message?: string };
    if (!res.ok) {
      throw new Error(
        (data as { message?: string }).message ?? `Request failed (${res.status})`,
      );
    }
    return data;
  }

  requestChallenge(): Promise<{ nonce: string; expiresAt: string }> {
    return this.get('/auth/challenge');
  }

  login(identifier: string, password: string, nonce: string): Promise<AuthResponseDto> {
    return this.post<AuthResponseDto>('/login', { identifier, password, nonce });
  }

  register(dto: {
    username: string;
    password: string;
    email?: string;
  }): Promise<AuthResponseDto> {
    return this.post<AuthResponseDto>('/register', dto);
  }

  getWechatQrCode(): Promise<{ qrUrl: string; state: string }> {
    return this.get('/oauth/qrcode?provider=wechat');
  }

  submitOAuthCallback(dto: OAuthCallbackDto): Promise<AuthResponseDto> {
    return this.post<AuthResponseDto>('/oauth/callback', dto);
  }
}
