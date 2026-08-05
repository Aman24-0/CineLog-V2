// src/features/admin/hooks/__tests__/useAdminAuth.test.ts
//
// Tests for the useAdminAuth hook — admin session state, login flows,
// logout, and refresh.
//
// IMPORTANT: The module auto-initializes on import (browser only) via a
// microtask that calls GET /api/admin/auth. To test the auto-init
// behavior cleanly, each test that depends on it MUST call
// vi.resetModules() + dynamic-import the hook fresh.
//
// Mock strategy:
//   • `~/lib/supabase/client` → returns a stub with `.auth.getSession()`.
//   • Global `fetch` → returns controlled JSON for /api/admin/auth.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRoot } from "solid-js";

// --- Hoisted mocks ---

const { mockFetch, mockGetClient } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
  mockGetClient: vi.fn()
}));

vi.mock("~/lib/supabase/client", () => ({
  getClient: mockGetClient
}));

// Stub global fetch BEFORE the module loads.
globalThis.fetch = mockFetch as unknown as typeof fetch;

// Helper: build a JSON Response.
function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
    ...init
  } as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  // Reset to default mocks.
  mockFetch.mockImplementation(() =>
    Promise.resolve(jsonResponse({ ok: false }))
  );
  mockGetClient.mockReturnValue({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: "test-token" } },
        error: null
      })
    }
  });
});

// Helper: dynamically import the hook so module-level state is fresh
// for each test (after vi.resetModules()).
async function importHook(): Promise<typeof import("../useAdminAuth")> {
  return (await import("../useAdminAuth")) as typeof import("../useAdminAuth");
}

// Helper: run the hook inside a reactive root + flush microtasks so the
// module-level auto-init completes before assertions run.
async function withHook<T>(
  cb: (api: ReturnType<Awaited<ReturnType<typeof importHook>>["useAdminAuth"]>) => Promise<T>,
  options: { flushAutoInit?: boolean } = { flushAutoInit: true }
): Promise<T> {
  const { useAdminAuth } = await importHook();
  return new Promise<T>((resolve, reject) => {
    createRoot(async (dispose) => {
      try {
        const api = useAdminAuth();
        if (options.flushAutoInit) {
          // Flush the auto-init microtask + the resulting fetch.
          await new Promise((r) => setTimeout(r, 50));
        }
        const result = await cb(api);
        dispose();
        resolve(result);
      } catch (err) {
        dispose();
        reject(err);
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Initial state (after auto-init completes)
// ---------------------------------------------------------------------------

describe("useAdminAuth — initial state after auto-init", () => {
  it("sets adminReady=true + admin=null when GET returns ok=false", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(jsonResponse({ ok: false }))
    );

    await withHook(async (api) => {
      expect(api.adminReady()).toBe(true);
      expect(api.admin()).toBeNull();
      expect(api.isAdmin()).toBe(false);
    });
  });

  it("sets admin when GET /api/admin/auth returns ok + admin object", async () => {
    const adminObj = {
      id: "admin-1",
      email: "admin@example.com",
      username: "admin",
      display_name: "Admin"
    };
    mockFetch.mockImplementation(() =>
      Promise.resolve(jsonResponse({ ok: true, admin: adminObj }))
    );

    await withHook(async (api) => {
      expect(api.admin()).toEqual(adminObj);
      expect(api.isAdmin()).toBe(true);
    });
  });

  it("clears admin + sets adminReady=true when GET throws", async () => {
    mockFetch.mockImplementation(() => Promise.reject(new Error("network down")));

    await withHook(async (api) => {
      expect(api.adminReady()).toBe(true);
      expect(api.admin()).toBeNull();
    });
  });

  it("sets adminReady=true when GET returns malformed JSON", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.reject(new Error("invalid json"))
      } as Response)
    );

    await withHook(async (api) => {
      expect(api.adminReady()).toBe(true);
      expect(api.admin()).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// login (email + password + pin)
// ---------------------------------------------------------------------------

describe("useAdminAuth — login (email/password)", () => {
  it("POSTs to /api/admin/auth with mode=password + sets admin on success", async () => {
    const adminObj = {
      id: "admin-1",
      email: "admin@example.com",
      username: "admin",
      display_name: "Admin"
    };
    // First call = auto-init GET. Second call = login POST.
    let callCount = 0;
    mockFetch.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(jsonResponse({ ok: false }));
      }
      return Promise.resolve(jsonResponse({ ok: true, admin: adminObj }));
    });

    await withHook(async (api) => {
      const result = await api.login("admin@example.com", "password", "123456");
      expect(result.ok).toBe(true);
      expect(result.admin).toEqual(adminObj);
      expect(api.admin()).toEqual(adminObj);
      expect(api.loginLoading()).toBe(false);

      // Verify the POST call.
      const loginCall = mockFetch.mock.calls[1];
      expect(loginCall[0]).toBe("/api/admin/auth");
      const init = loginCall[1] as RequestInit;
      expect(init.method).toBe("POST");
      const body = JSON.parse(init.body as string);
      expect(body.email).toBe("admin@example.com");
      expect(body.password).toBe("password");
      expect(body.pin).toBe("123456");
      expect(body.mode).toBe("password");
    });
  });

  it("includes totpCode in the body when provided", async () => {
    let callCount = 0;
    mockFetch.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(jsonResponse({ ok: false }));
      }
      return Promise.resolve(jsonResponse({ ok: true, admin: { id: "1" } }));
    });

    await withHook(async (api) => {
      await api.login("a@b.c", "p", "123456", "987654");
      const loginCall = mockFetch.mock.calls[1];
      const body = JSON.parse((loginCall[1] as RequestInit).body as string);
      expect(body.totpCode).toBe("987654");
    });
  });

  it("sets loginError + returns ok=false when login fails", async () => {
    let callCount = 0;
    mockFetch.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(jsonResponse({ ok: false }));
      }
      return Promise.resolve(
        jsonResponse({ ok: false, error: "Invalid credentials" })
      );
    });

    await withHook(async (api) => {
      const result = await api.login("a@b.c", "wrong", "123456");
      expect(result.ok).toBe(false);
      expect(result.error).toBe("Invalid credentials");
      expect(api.loginError()).toBe("Invalid credentials");
      expect(api.admin()).toBeNull();
    });
  });

  it("appends server detail to the error message when present", async () => {
    let callCount = 0;
    mockFetch.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(jsonResponse({ ok: false }));
      }
      return Promise.resolve(
        jsonResponse({
          ok: false,
          error: "Config error",
          detail: "ADMIN_PIN env var not set"
        })
      );
    });

    await withHook(async (api) => {
      const result = await api.login("a@b.c", "p", "123456");
      expect(result.error).toContain("Config error");
      expect(result.error).toContain("ADMIN_PIN env var not set");
    });
  });

  it("does NOT set loginError when requires2FA is true", async () => {
    let callCount = 0;
    mockFetch.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(jsonResponse({ ok: false }));
      }
      return Promise.resolve(
        jsonResponse({ ok: false, requires2FA: true, error: "2FA required" })
      );
    });

    await withHook(async (api) => {
      const result = await api.login("a@b.c", "p", "123456");
      expect(result.ok).toBe(false);
      expect(result.requires2FA).toBe(true);
      expect(api.loginError()).toBeNull();
    });
  });

  it("returns ok=false + Network error on fetch throw", async () => {
    let callCount = 0;
    mockFetch.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(jsonResponse({ ok: false }));
      }
      return Promise.reject(new Error("Network error"));
    });

    await withHook(async (api) => {
      const result = await api.login("a@b.c", "p", "123456");
      expect(result.ok).toBe(false);
      expect(result.error).toBe("Network error");
      expect(api.loginError()).toBe("Network error");
    });
  });

  it("sets loginLoading=true during the call, false after", async () => {
    let resolveLogin: ((v: Response) => void) | null = null;
    let callCount = 0;
    mockFetch.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(jsonResponse({ ok: false }));
      }
      return new Promise<Response>((resolve) => {
        resolveLogin = resolve;
      });
    });

    await withHook(async (api) => {
      const loginPromise = api.login("a@b.c", "p", "123456");
      // Wait a tick so the fetch has been called.
      await new Promise((r) => setTimeout(r, 0));
      expect(api.loginLoading()).toBe(true);
      resolveLogin?.(jsonResponse({ ok: false }));
      await loginPromise;
      expect(api.loginLoading()).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// loginWithPin (session-based)
// ---------------------------------------------------------------------------

describe("useAdminAuth — loginWithPin", () => {
  it("reads the CineLog session + POSTs mode=session with accessToken", async () => {
    const adminObj = { id: "admin-1", email: "a@b.c" };
    let callCount = 0;
    mockFetch.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(jsonResponse({ ok: false }));
      }
      return Promise.resolve(jsonResponse({ ok: true, admin: adminObj }));
    });

    await withHook(async (api) => {
      const result = await api.loginWithPin("123456");
      expect(result.ok).toBe(true);
      expect(result.admin).toEqual(adminObj);

      const loginCall = mockFetch.mock.calls[1];
      const body = JSON.parse((loginCall[1] as RequestInit).body as string);
      expect(body.pin).toBe("123456");
      expect(body.mode).toBe("session");
      expect(body.accessToken).toBe("test-token");
    });
  });

  it("returns ok=false when no CineLog session is available", async () => {
    mockGetClient.mockReturnValue({
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: null },
          error: null
        })
      }
    });

    await withHook(async (api) => {
      const result = await api.loginWithPin("123456");
      expect(result.ok).toBe(false);
      expect(result.error).toContain("sign in to CineLog first");
    });
  });

  it("returns ok=false when getSession throws", async () => {
    mockGetClient.mockReturnValue({
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: null,
          error: new Error("supabase unreachable")
        })
      }
    });

    await withHook(async (api) => {
      const result = await api.loginWithPin("123456");
      expect(result.ok).toBe(false);
      expect(result.error).toBe("supabase unreachable");
    });
  });

  it("returns ok=false when getClient throws", async () => {
    mockGetClient.mockImplementation(() => {
      throw new Error("client init failed");
    });

    await withHook(async (api) => {
      const result = await api.loginWithPin("123456");
      expect(result.ok).toBe(false);
      expect(result.error).toBe("client init failed");
    });
  });
});

// ---------------------------------------------------------------------------
// logout
// ---------------------------------------------------------------------------

describe("useAdminAuth — logout", () => {
  it("DELETEs /api/admin/auth and clears admin", async () => {
    const adminObj = { id: "1", email: "a@b.c" };
    let callCount = 0;
    mockFetch.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(jsonResponse({ ok: true, admin: adminObj }));
      }
      return Promise.resolve(jsonResponse({ ok: true }));
    });

    await withHook(async (api) => {
      expect(api.admin()).toEqual(adminObj);
      await api.logout();
      expect(api.admin()).toBeNull();
      const logoutCall = mockFetch.mock.calls[1];
      expect(logoutCall[0]).toBe("/api/admin/auth");
      expect((logoutCall[1] as RequestInit).method).toBe("DELETE");
    });
  });

  it("clears admin even when the DELETE request throws", async () => {
    const adminObj = { id: "1", email: "a@b.c" };
    let callCount = 0;
    mockFetch.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(jsonResponse({ ok: true, admin: adminObj }));
      }
      return Promise.reject(new Error("network down"));
    });

    await withHook(async (api) => {
      await api.logout();
      expect(api.admin()).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// refresh
// ---------------------------------------------------------------------------

describe("useAdminAuth — refresh", () => {
  it("sets adminReady=true even when fetch fails", async () => {
    // Auto-init fetch fails, then refresh fetch also fails.
    mockFetch.mockImplementation(() => Promise.reject(new Error("boom")));

    await withHook(async (api) => {
      await api.refresh();
      expect(api.adminReady()).toBe(true);
      expect(api.admin()).toBeNull();
    });
  });

  it("sets admin when refresh returns a valid session", async () => {
    const adminObj = { id: "1", email: "a@b.c" };
    let callCount = 0;
    mockFetch.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // Auto-init: no admin.
        return Promise.resolve(jsonResponse({ ok: false }));
      }
      // Refresh: admin present.
      return Promise.resolve(jsonResponse({ ok: true, admin: adminObj }));
    });

    await withHook(async (api) => {
      expect(api.admin()).toBeNull();
      await api.refresh();
      expect(api.admin()).toEqual(adminObj);
      expect(api.adminReady()).toBe(true);
    });
  });

  it("clears admin when refresh returns ok=false", async () => {
    // Auto-init returns admin. Refresh returns ok=false.
    const adminObj = { id: "1", email: "a@b.c" };
    let callCount = 0;
    mockFetch.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(jsonResponse({ ok: true, admin: adminObj }));
      }
      return Promise.resolve(jsonResponse({ ok: false }));
    });

    await withHook(async (api) => {
      expect(api.admin()).toEqual(adminObj);
      await api.refresh();
      expect(api.admin()).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// fetchJSON helper — credentials + headers
// ---------------------------------------------------------------------------

describe("useAdminAuth — request shape", () => {
  it("always sends credentials: include + Content-Type: application/json", async () => {
    let callCount = 0;
    mockFetch.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(jsonResponse({ ok: false }));
      }
      return Promise.resolve(jsonResponse({ ok: true, admin: { id: "1" } }));
    });

    await withHook(async (api) => {
      await api.login("a@b.c", "p", "123456");
      const loginCall = mockFetch.mock.calls[1];
      const init = loginCall[1] as RequestInit;
      expect(init.credentials).toBe("include");
      const headers = init.headers as Record<string, string>;
      expect(headers["Content-Type"]).toBe("application/json");
    });
  });
});
