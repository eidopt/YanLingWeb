import type { AuthResponseDto, UserDto } from '@shared/types/user.types';

export type AuthUser = UserDto;

function hasLocalStorage(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage != null;
  } catch {
    return false;
  }
}

export class AuthService {
  private readonly tokenKey = 'ai_app_token';
  private readonly userKey = 'ai_app_user';

  save(response: AuthResponseDto): void {
    if (!hasLocalStorage()) { return; }
    localStorage.setItem(this.tokenKey, response.accessToken);
    localStorage.setItem(this.userKey, JSON.stringify(response.user));
  }

  getToken(): string | null {
    if (!hasLocalStorage()) { return null; }
    return localStorage.getItem(this.tokenKey);
  }

  getUser(): AuthUser | null {
    if (!hasLocalStorage()) { return null; }
    const raw = localStorage.getItem(this.userKey);
    if (!raw) { return null; }
    try {
      return JSON.parse(raw) as AuthUser;
    } catch {
      return null;
    }
  }

  clear(): void {
    if (!hasLocalStorage()) { return; }
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.userKey);
  }

  isLoggedIn(): boolean {
    return Boolean(this.getToken());
  }
}
