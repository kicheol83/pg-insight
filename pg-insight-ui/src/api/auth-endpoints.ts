import { http } from "./http";

export interface AuthResponse {
  accessToken: string;
  user: { id: string; email: string; role: string };
}

export const authApi = {
  login: (email: string, password: string) =>
    http
      .post<AuthResponse>("/auth/login", { email, password })
      .then((r) => r.data),
  registerFirst: (email: string, password: string) =>
    http
      .post<AuthResponse>("/auth/register-first", { email, password })
      .then((r) => r.data),
};
