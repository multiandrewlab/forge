import type { User } from './index';

export interface AuthTokens {
  accessToken: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
}
