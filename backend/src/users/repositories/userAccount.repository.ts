import type { User } from '../entities/user.entity';

export const USER_ACCOUNT_REPOSITORY = Symbol('USER_ACCOUNT_REPOSITORY');

export type OAuthProvider = 'wechat' | 'qq';

export interface CreateLocalUserInput {
  username: string;
  email: string | null;
  phone: string | null;
  passwordHash: string;
}

export interface CreateOAuthUserInput {
  provider: OAuthProvider;
  openId: string;
  username: string;
}

export interface FindRegistrationIdentityInput {
  username: string;
  email?: string;
  phone?: string;
}

export type UserAccountUpdate = Partial<
  Pick<User, 'username' | 'email' | 'phone' | 'passwordHash' | 'linkedLogins' | 'lastLoginAt'>
>;

export interface UserAccountRepository {
  findById(id: string): Promise<User | null>;
  findByLoginIdentifier(identifier: string): Promise<User | null>;
  findByRegistrationIdentity(input: FindRegistrationIdentityInput): Promise<User | null>;
  findByOAuthOpenId(provider: OAuthProvider, openId: string): Promise<User | null>;
  createLocalUser(input: CreateLocalUserInput): User;
  createOAuthUser(input: CreateOAuthUserInput): User;
  save(user: User): Promise<User>;
  update(id: string, patch: UserAccountUpdate): Promise<void>;
  remove(user: User): Promise<void>;
}
