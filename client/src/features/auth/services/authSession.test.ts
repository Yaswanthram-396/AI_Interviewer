import { describe, expect, it, vi } from "vitest";
import { ApiError, createAuthSession } from "./authSession";

const API = "http://api.test";
const user = { id: "u1", email: "a@example.com", role: "candidate" as const };

/** Builds an unsigned JWT-shaped token expiring `ttlSec` after `nowMs`. */
const makeToken = (nowMs: number, ttlSec: number) => {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "HS256" })}.${b64({ sub: "u1", exp: Math.floor(nowMs / 1000) + ttlSec })}.sig`;
};

const json = (status: number, body: object) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

interface Call {
  url: string;
  init?: RequestInit;
}

function setup(handler: (call: Call, n: number) => Response | Promise<Response>) {
  const clock = { t: 1_700_000_000_000 };
  const calls: Call[] = [];
  const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: String(url), init };
    calls.push(call);
    return handler(call, calls.length);
  }) as unknown as typeof fetch;
  const session = createAuthSession({ apiUrl: API, fetchImpl, now: () => clock.t });
  return { session, calls, clock };
}

const session200 = (clock: { t: number }, ttl = 900) => json(200, { success: true, user, accessToken: makeToken(clock.t, ttl) });
const authHeader = (c: Call) => new Headers(c.init?.headers).get("Authorization");

describe("login / register / logout", () => {
  it("login stores the user, sends credentials with cookies, and never persists the token", async () => {
    const { session, calls, clock } = setup(() => session200(clock));
    await session.login({ email: "a@example.com", password: "pw" });
    expect(session.getState()).toEqual({ status: "authenticated", user });
    expect(calls[0].url).toBe(`${API}/api/auth/login`);
    expect(calls[0].init?.credentials).toBe("include");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ email: "a@example.com", password: "pw" });
  });

  it("surfaces the server's error code and leaves the user signed out", async () => {
    const { session } = setup(() => json(401, { code: "INVALID_CREDENTIALS", message: "Invalid email or password" }));
    await expect(session.login({ email: "a@example.com", password: "bad" })).rejects.toMatchObject({
      status: 401,
      code: "INVALID_CREDENTIALS",
    });
    expect(session.getState().status).toBe("loading");
  });

  it("logout clears local state even when the network call fails", async () => {
    const { session, clock } = setup((call) => {
      if (call.url.endsWith("/login")) return session200(clock);
      throw new TypeError("network down");
    });
    await session.login({ email: "a@example.com", password: "pw" });
    await expect(session.logout()).rejects.toThrow();
    expect(session.getState()).toEqual({ status: "anonymous", user: null });
    await expect(session.getAccessToken()).resolves.toBeNull();
  });
});

describe("restore (silent sign-in)", () => {
  it("signs in from the refresh cookie", async () => {
    const { session, clock } = setup(() => session200(clock));
    await session.restore();
    expect(session.getState().status).toBe("authenticated");
  });
  it("becomes anonymous when the cookie is rejected", async () => {
    const { session } = setup(() => json(401, { code: "INVALID_REFRESH_TOKEN", message: "expired" }));
    await session.restore();
    expect(session.getState()).toEqual({ status: "anonymous", user: null });
  });
  it("becomes anonymous (not stuck loading) on a network failure", async () => {
    const { session } = setup(() => {
      throw new TypeError("offline");
    });
    await session.restore();
    expect(session.getState().status).toBe("anonymous");
  });
});

describe("access token handling", () => {
  it("reuses a fresh token and refreshes one that is about to expire", async () => {
    let n = 0;
    const { session, calls, clock } = setup(() => session200(clock, 60));
    await session.login({ email: "a@example.com", password: "pw" });
    n = calls.length;
    await session.getAccessToken();
    expect(calls.length).toBe(n); // still fresh: 60s left > 30s skew
    clock.t += 40_000; // 20s left < skew
    await session.getAccessToken();
    expect(calls.at(-1)?.url).toBe(`${API}/api/auth/refresh`);
  });

  it("deduplicates concurrent refreshes into one request", async () => {
    const { session, calls, clock } = setup(() => session200(clock));
    const tokens = await Promise.all([session.getAccessToken(), session.getAccessToken(), session.getAccessToken()]);
    expect(calls.filter((c) => c.url.endsWith("/refresh"))).toHaveLength(1);
    expect(new Set(tokens).size).toBe(1);
  });

  it("a transient refresh failure keeps the signed-in state", async () => {
    let fail = false;
    const { session, clock } = setup((call) => {
      if (fail && call.url.endsWith("/refresh")) throw new TypeError("offline");
      return session200(clock, 60);
    });
    await session.login({ email: "a@example.com", password: "pw" });
    fail = true;
    clock.t += 40_000;
    await expect(session.getAccessToken()).resolves.toBeNull();
    expect(session.getState().status).toBe("authenticated");
  });
});

describe("authFetch", () => {
  it("attaches the bearer token and JSON content type", async () => {
    const { session, calls, clock } = setup((call) => (call.url.includes("/api/auth/") ? session200(clock) : json(200, { ok: true })));
    await session.restore();
    await session.authFetch("/api/interviews", { method: "POST", body: "{}" });
    const call = calls.at(-1)!;
    expect(call.url).toBe(`${API}/api/interviews`);
    expect(authHeader(call)).toMatch(/^Bearer /);
    expect(new Headers(call.init?.headers).get("Content-Type")).toBe("application/json");
  });

  it("on 401 refreshes once and retries with the new token", async () => {
    let first = true;
    const { session, calls, clock } = setup((call) => {
      if (call.url.includes("/api/auth/")) return session200(clock);
      if (first) {
        first = false;
        return json(401, { code: "UNAUTHENTICATED" });
      }
      return json(200, { ok: true });
    });
    await session.restore();
    const res = await session.authFetch("/api/interviews");
    expect(res.status).toBe(200);
    expect(calls.filter((c) => c.url.endsWith("/refresh"))).toHaveLength(2); // restore + forced
    expect(calls.filter((c) => c.url.endsWith("/api/interviews"))).toHaveLength(2);
  });

  it("does not loop: a second 401 after refreshing is returned to the caller", async () => {
    const { session, calls, clock } = setup((call) => (call.url.includes("/api/auth/") ? session200(clock) : json(401, { code: "UNAUTHENTICATED" })));
    await session.restore();
    const res = await session.authFetch("/api/interviews");
    expect(res.status).toBe(401);
    expect(calls.filter((c) => c.url.endsWith("/api/interviews"))).toHaveLength(2);
  });

  it("signed-out callers fail fast with ApiError and never hit the API", async () => {
    const { session, calls } = setup(() => json(401, { code: "INVALID_REFRESH_TOKEN", message: "no" }));
    await expect(session.authFetch("/api/interviews")).rejects.toBeInstanceOf(ApiError);
    expect(calls.every((c) => c.url.endsWith("/refresh"))).toBe(true);
  });

  it("request() throws ApiError with the server code on non-2xx", async () => {
    const { session, clock } = setup((call) =>
      call.url.includes("/api/auth/") ? session200(clock) : json(404, { code: "NOT_FOUND", message: "Interview not found" })
    );
    await session.restore();
    await expect(session.request("/api/interviews/x")).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
  });
});
