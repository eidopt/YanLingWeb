import type { AuthResponseDto, UserDto } from '@shared/types/user.types';

export type AuthUser = UserDto;

export class AuthService {
  private readonly tokenKey = 'ai_app_token';
  private readonly userKey = 'ai_app_user';

  save(response: AuthResponseDto): void {
    localStorage.setItem(this.tokenKey, response.accessToken);
    localStorage.setItem(this.userKey, JSON.stringify(response.user));
  }

  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  getUser(): AuthUser | null {
    const raw = localStorage.getItem(this.userKey);
    if (!raw) { return null; }
    try {
      return JSON.parse(raw) as AuthUser;
    } catch {
      return null;
    }
  }

  clear(): void {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.userKey);
  }

  isLoggedIn(): boolean {
    return Boolean(this.getToken());
  }
}
