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
  signup: (email: string, password: string) =>
    http
      .post<AuthResponse>("/auth/signup", { email, password })
      .then((r) => r.data),
  config: () =>
    http.get<{ signupEnabled: boolean }>("/auth/config").then((r) => r.data),
};
