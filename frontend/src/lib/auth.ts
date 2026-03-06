import { API_BASE } from './config';

export interface LoginPayload {
  host:      string;
  port:      string;
  user:      string;
  password:  string;
  database?: string;
  encrypt?:  boolean;
}

export interface LoginResponse {
  token: string;
  user:  string;
  host:  string;
  port:  string;
}

export async function apiLogin(payload: LoginPayload): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message ?? `Login failed: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

export async function apiLogout(token: string): Promise<void> {
  await fetch(`${API_BASE}/auth/logout`, {
    method:  'POST',
    headers: { 'x-session-token': token },
  });
}
