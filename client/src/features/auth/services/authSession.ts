import type { AuthState, AuthUser, LoginInput, RegisterInput, SessionPayload } from "../types/auth.types";

/** Error from the API with the server's stable `code` (e.g. INVALID_CREDENTIALS). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface AuthSessionDeps {
  apiUrl: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  /** Serializes refreshes across browser tabs (refresh tokens rotate, so concurrent use would revoke the session). */
  withLock?: <T>(fn: () => Promise<T>) => Promise<T>;
}

type Listener = () => void;

const EXPIRY_SKEW_MS = 30_000;
const LOADING: AuthState = { status: "loading", user: null };
const ANONYMOUS: AuthState = { status: "anonymous", user: null };

/** Reads `exp` (ms) from a JWT without verifying it; the server remains the authority. */
function readExpiryMs(token: string): number {
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const exp = (JSON.parse(atob(payload)) as { exp?: unknown }).exp;
    return typeof exp === "number" ? exp * 1000 : 0;
  } catch {
    return 0; // unreadable: treat as already expired so it is refreshed
  }
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await res.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * Browser-side auth session. The access token lives only in memory; the refresh token is an
 * HttpOnly cookie the browser sends to /api/auth. Framework-agnostic so it can be unit tested.
 */
export function createAuthSession({ apiUrl, fetchImpl, now = Date.now, withLock = (fn) => fn() }: AuthSessionDeps) {
  const doFetch: typeof fetch = (...args) => (fetchImpl ?? fetch)(...args);
  let state: AuthState = LOADING;
  let accessToken: string | null = null;
  let expiresAtMs = 0;
  let refreshInFlight: Promise<boolean> | null = null;
  const listeners = new Set<Listener>();

  const setState = (next: AuthState) => {
    state = next;
    listeners.forEach((l) => l());
  };

  const apply = ({ user, accessToken: token }: SessionPayload) => {
    accessToken = token;
    expiresAtMs = readExpiryMs(token);
    setState({ status: "authenticated", user });
  };

  const clear = () => {
    accessToken = null;
    expiresAtMs = 0;
    setState(ANONYMOUS);
  };

  async function postAuth(path: string, body?: unknown): Promise<SessionPayload> {
    const res = await doFetch(`${apiUrl}/api/auth/${path}`, {
      method: "POST",
      credentials: "include",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await readJson(res);
    if (!res.ok) {
      throw new ApiError(res.status, String(json.code ?? "UNKNOWN"), String(json.message ?? "Request failed"));
    }
    return json as unknown as SessionPayload;
  }

  /** One refresh at a time; true when a fresh access token is available afterwards. */
  function refresh(): Promise<boolean> {
    refreshInFlight ??= withLock(async () => {
      try {
        apply(await postAuth("refresh"));
        return true;
      } catch (e) {
        // Only an explicit rejection ends the session; a network blip keeps it so a retry can succeed.
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) clear();
        return false;
      }
    }).finally(() => {
      refreshInFlight = null;
    });
    return refreshInFlight;
  }

  async function getAccessToken(): Promise<string | null> {
    if (accessToken && expiresAtMs - now() > EXPIRY_SKEW_MS) return accessToken;
    return (await refresh()) ? accessToken : null;
  }

  /** Authenticated fetch: attaches the token and retries once after a refresh on 401. */
  async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
    const send = (token: string) => {
      const headers = new Headers(init.headers);
      headers.set("Authorization", `Bearer ${token}`);
      if (init.body !== undefined && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
      return doFetch(`${apiUrl}${path}`, { ...init, headers });
    };
    const token = await getAccessToken();
    if (!token) throw new ApiError(401, "UNAUTHENTICATED", "Please sign in");
    const res = await send(token);
    if (res.status !== 401) return res;
    expiresAtMs = 0;
    if (!(await refresh()) || !accessToken) throw new ApiError(401, "UNAUTHENTICATED", "Please sign in again");
    return send(accessToken);
  }

  /** authFetch + JSON parsing; non-2xx responses throw ApiError. */
  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await authFetch(path, init);
    const json = await readJson(res);
    if (!res.ok) throw new ApiError(res.status, String(json.code ?? "UNKNOWN"), String(json.message ?? "Request failed"));
    return json as T;
  }

  return {
    getState: () => state,
    subscribe(listener: Listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    /** Silent sign-in from the refresh cookie; call once when the app mounts. */
    async restore(): Promise<void> {
      if (state.status !== "loading") return;
      if (!(await refresh()) && state.status === "loading") setState(ANONYMOUS);
    },

    async login(input: LoginInput): Promise<AuthUser> {
      apply(await postAuth("login", input));
      return (state as Extract<AuthState, { status: "authenticated" }>).user;
    },

    async register(input: RegisterInput): Promise<AuthUser> {
      apply(await postAuth("register", input));
      return (state as Extract<AuthState, { status: "authenticated" }>).user;
    },

    async logout(): Promise<void> {
      try {
        await postAuth("logout");
      } finally {
        clear(); // local sign-out happens even if the network call fails
      }
    },

    getAccessToken,
    authFetch,
    request,
  };
}

export type AuthSession = ReturnType<typeof createAuthSession>;
