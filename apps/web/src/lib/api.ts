/** Thin fetch wrapper for the JSON API (base path /api, cookie session). */

export class ApiRequestError extends Error {
  readonly status: number;
  /** Server error code, e.g. "username_taken", "version_conflict"; "network" when unreachable. */
  readonly code: string;
  /** Parsed response body (may be undefined). */
  readonly body: unknown;

  constructor(status: number, code: string, message: string, body?: unknown) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

export interface RequestOptions {
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

async function request<T>(method: string, path: string, body: unknown, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json", ...opts.headers };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: "include",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      ...(opts.signal ? { signal: opts.signal } : {}),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiRequestError(0, "network", "Keine Verbindung zum Server");
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let parsed: unknown;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = undefined;
    }
  }

  if (!res.ok) {
    const b = (parsed ?? {}) as { error?: string; code?: string };
    throw new ApiRequestError(res.status, b.code ?? `http_${res.status}`, b.error ?? res.statusText, parsed);
  }
  return parsed as T;
}

export const apiGet = <T>(path: string, opts?: RequestOptions) => request<T>("GET", path, undefined, opts);
export const apiPost = <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>("POST", path, body, opts);
export const apiPatch = <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>("PATCH", path, body, opts);
export const apiPut =<T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>("PUT", path, body, opts);
export const apiDelete = <T = void>(path: string, opts?: RequestOptions) => request<T>("DELETE", path, undefined, opts);

const MESSAGES: Record<string, string> = {
  network: "Keine Verbindung zum Server. Bitte prüfe deine Internetverbindung.",
  username_taken: "Dieser Benutzername ist schon vergeben.",
  invalid_credentials: "Benutzername oder Passwort ist falsch.",
  validation: "Bitte prüfe deine Eingaben.",
  invalid_state: "Der Spielstand ist ungültig.",
  version_conflict: "Der Spielstand wurde zwischenzeitlich geändert.",
  forbidden: "Dafür fehlt dir die Berechtigung.",
  not_found: "Nicht gefunden.",
  unauthorized: "Bitte melde dich an.",
};

/** German user-facing message for any thrown error. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiRequestError) {
    if (MESSAGES[err.code]) return MESSAGES[err.code]!;
    if (err.status === 401) return MESSAGES.unauthorized!;
    if (err.status === 404) return MESSAGES.not_found!;
    if (err.status === 429) return "Zu viele Versuche. Bitte warte einen Moment.";
    if (err.status >= 500) return "Der Server hat ein Problem. Bitte versuche es später erneut.";
  }
  return "Etwas ist schiefgelaufen. Bitte versuche es erneut.";
}
