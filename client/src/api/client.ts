const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8080";

const TOKEN_KEY = "jamapp.token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(
  path: string,
  opts: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  const headers = new Headers(opts.headers);
  if (opts.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (opts.auth !== false) {
    const tok = getToken();
    if (tok) headers.set("Authorization", `Bearer ${tok}`);
  }
  const res = await fetch(`${BASE_URL}${path}`, { ...opts, headers });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch {
      // ignore
    }
    throw new ApiError(res.status, msg);
  }
  if (res.status === 204 || res.headers.get("Content-Length") === "0") {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}
