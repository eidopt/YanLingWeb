import type {
  AuthResponseDto,
  OAuthCallbackDto,
  UpdateUserDto,
  UserDto,
} from '@shared/types/user.types';

export class UserService {
  private readonly base = '/api/proxy/users';

  constructor(private readonly getToken?: () => string | null) {}

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

  private async put<T>(path: string, body: unknown): Promise<T> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    const token = this.getToken?.();
    if (token) {
      headers.authorization = `Bearer ${token}`;
    }

    const res = await fetch(`${this.base}${path}`, {
      method: 'PUT',
      headers,
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

  getUser(id: string): Promise<UserDto> {
    return this.get<UserDto>(`/${id}`);
  }

  updateUser(id: string, dto: UpdateUserDto): Promise<UserDto> {
    return this.put<UserDto>(`/${id}`, dto);
  }
}
