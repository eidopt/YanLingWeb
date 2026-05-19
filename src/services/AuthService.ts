import type { AuthResponseDto, UserDto } from '@shared/types/user.types';

export type AuthUser = UserDto;
export const AUTH_CHANGED_EVENT = 'ai-app-auth-changed';

function hasLocalStorage(): boolean {
  try {
    if (typeof window === 'undefined') { return false; }
    void window.localStorage;
    return true;
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
    this.emitAuthChange(response.user);
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

  updateUser(user: AuthUser): void {
    localStorage.setItem(this.userKey, JSON.stringify(user));
    this.emitAuthChange(user);
  }

  clear(): void {
    if (!hasLocalStorage()) { return; }
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.userKey);
    this.emitAuthChange(null);
  }

  isLoggedIn(): boolean {
    return Boolean(this.getToken());
  }

  private emitAuthChange(user: AuthUser | null): void {
    if (typeof window === 'undefined') { return; }
    window.dispatchEvent(new CustomEvent<AuthUser | null>(AUTH_CHANGED_EVENT, {
      detail: user,
    }));
  }
}
