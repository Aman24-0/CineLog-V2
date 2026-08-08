// src/features/notifications/hooks/__tests__/usePushSubscription.test.ts
//
// Tests for the usePushSubscription hook — manages the browser-side
// lifecycle of a Web Push subscription.
//
// Mock strategy:
//   • `~/lib/supabase/client` → chainable builder.
//   • `~/lib/supabase/session` → returns a fake access_token.
//   • `~/shared/hooks/useAuth` → returns a fake user.
//   • `~/core/preferences/notifications` → returns default prefs.
//   • Global `fetch` → controlled JSON for /api/push/send.
//   • Browser APIs: navigator.serviceWorker, PushManager, Notification.
//
// Each test stubs `navigator.serviceWorker` to return controlled
// PushSubscription objects.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRoot } from "solid-js";

// --- Hoisted mocks ---

const { mockFrom, mockGetBrowserSession, mockUseAuth, mockNotifPrefs, mockFetch } =
  vi.hoisted(() => {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    const rebuild = () => {
      for (const m of [
        "select", "insert", "update", "upsert", "delete",
        "eq", "neq", "is", "not", "or", "in", "ilike",
        "order", "limit", "range", "lt", "gt", "gte", "lte"
      ]) {
        chain[m] = vi.fn(() => chain);
      }
      chain.single = vi.fn(() => Promise.resolve({ data: null, error: null }));
      chain.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
      chain.then = vi.fn((resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: null, error: null }).then(resolve)
      );
      chain.catch = vi.fn(() => Promise.resolve({ data: null, error: null }));
    };
    rebuild();
    return {
      mockFrom: vi.fn(() => chain),
      mockGetBrowserSession: vi.fn().mockResolvedValue({ access_token: "test-token" }),
      mockUseAuth: vi.fn((): { user: () => { uid: string } | null; isSignedIn: () => boolean } => ({
        user: () => ({ uid: "user-1" }),
        isSignedIn: () => true
      })),
      mockNotifPrefs: vi.fn(() => ({
        newSeason: true,
        continueWatching: false,
        weeklyRecap: true,
        recommendations: false,
        syncStatus: true,
        quietHoursEnabled: false,
        quietHoursStart: "22:00",
        quietHoursEnd: "07:00",
        weeklyDigestTime: "09:00",
        weeklyDigestDay: 1,
        episodeReminderLead: 60,
        emailEnabled: false,
        emailNewSeason: false,
        emailContinueWatching: false,
        emailWeeklyRecap: false,
        emailRecommendations: false,
        emailSyncStatus: false
      })),
      mockFetch: vi.fn(),
      chain
    };
  });

vi.mock("~/lib/supabase/client", () => ({
  getClient: () => ({ from: mockFrom })
}));

vi.mock("~/lib/supabase/session", () => ({
  getBrowserSession: mockGetBrowserSession
}));

vi.mock("~/shared/hooks/useAuth", () => ({
  useAuth: mockUseAuth
}));

vi.mock("~/core/preferences/notifications", () => ({
  notifPrefs: mockNotifPrefs
}));

globalThis.fetch = mockFetch as unknown as typeof fetch;

// --- Browser API stubs ---
//
// jsdom doesn't implement serviceWorker / PushManager / Notification.
// We install minimal stubs that tests can configure per-test.

interface FakePushSubscription {
  endpoint: string;
  expirationTime: number | null;
  getKey: (name: string) => ArrayBuffer | null;
  unsubscribe: () => Promise<boolean>;
}

interface FakePushManager {
  getSubscription: () => Promise<FakePushSubscription | null>;
  subscribe: (opts: unknown) => Promise<FakePushSubscription>;
}

interface FakeServiceWorkerRegistration {
  pushManager: FakePushManager;
}

interface FakeServiceWorkerContainer {
  ready: Promise<FakeServiceWorkerRegistration>;
}

function installServiceWorkerStub(
  registration: FakeServiceWorkerRegistration
): void {
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      ready: Promise.resolve(registration)
    } as FakeServiceWorkerContainer
  });
}

function makeFakeSubscription(
  overrides: Partial<FakePushSubscription> = {}
): FakePushSubscription {
  return {
    endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
    expirationTime: null,
    getKey: (name: string) => {
      // Return a 32-byte buffer for p256dh, 16-byte for auth.
      if (name === "p256dh") return new ArrayBuffer(32);
      if (name === "auth") return new ArrayBuffer(16);
      return null;
    },
    unsubscribe: vi.fn().mockResolvedValue(true),
    ...overrides
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Reset chain to default thenable.
  mockChain.then = vi.fn((resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data: null, error: null }).then(resolve)
  );

  // Default: no PushManager / Notification support (each test installs
  // its own stubs as needed).
  // @ts-expect-error — jsdom doesn't define these.
  delete (navigator as unknown).serviceWorker;
  // @ts-expect-error — jsdom doesn't define Notification.
  delete (globalThis as unknown).Notification;
  // @ts-expect-error — jsdom doesn't define PushManager.
  delete (globalThis as unknown).PushManager;

  // Default fetch: 200 OK with sent=0.
  mockFetch.mockImplementation(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ sent: 0 })
    } as Response)
  );
});

// Convenience accessor for the chain (so tests can install per-call
// return values).
const mockChain = mockFrom();

// Helper: run the hook inside a reactive root + flush onMount.
type PushSubscriptionApi = ReturnType<
  typeof import("../usePushSubscription")["usePushSubscription"]
>;

async function withHook<T>(
  cb: (api: PushSubscriptionApi) => Promise<T>
): Promise<T> {
  const { usePushSubscription } = await import("../usePushSubscription");
  return new Promise<T>((resolve, reject) => {
    createRoot(async (dispose) => {
      try {
        const api = usePushSubscription();
        // Flush onMount.
        await new Promise((r) => setTimeout(r, 50));
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
// isSupported
// ---------------------------------------------------------------------------

describe("usePushSubscription — isSupported", () => {
  it("returns false when serviceWorker is missing", async () => {
    await withHook(async (api) => {
      expect(api.isSupported()).toBe(false);
    });
  });

  it("returns false when PushManager is missing", async () => {
    installServiceWorkerStub({
      pushManager: {
        getSubscription: vi.fn().mockResolvedValue(null),
        subscribe: vi.fn()
      }
    });
    // @ts-expect-error — jsdom doesn't define Notification.
    globalThis.Notification = vi.fn();

    await withHook(async (api) => {
      expect(api.isSupported()).toBe(false);
    });
  });

  it("returns false when Notification is missing", async () => {
    installServiceWorkerStub({
      pushManager: {
        getSubscription: vi.fn().mockResolvedValue(null),
        subscribe: vi.fn()
      }
    });
    globalThis.PushManager = class FakePushManager {} as never;

    await withHook(async (api) => {
      expect(api.isSupported()).toBe(false);
    });
  });

  it("returns true when all three (SW + PushManager + Notification) are present", async () => {
    installServiceWorkerStub({
      pushManager: {
        getSubscription: vi.fn().mockResolvedValue(null),
        subscribe: vi.fn()
      }
    });
    globalThis.PushManager = class FakePushManager {} as never;
    globalThis.Notification = { permission: "default", requestPermission: vi.fn() } as never;

    await withHook(async (api) => {
      expect(api.isSupported()).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// subscribe — happy path
// ---------------------------------------------------------------------------

describe("usePushSubscription — subscribe", () => {
  function installPushSupport(opts: {
    vapidKey?: string;
    existingSubscription?: FakePushSubscription | null;
    newSubscription?: FakePushSubscription;
    permission?: NotificationPermission;
    /** What Notification.requestPermission() resolves to. Defaults to "granted". */
    requestResult?: NotificationPermission;
  } = {}): {
    pushManager: FakePushManager;
    setVapidKey: (key: string) => void;
  } {
    const vapidKey = opts.vapidKey ?? "";
    // Per-test chain override: .maybeSingle() returns the vapid_public_key row.
    mockChain.maybeSingle = vi.fn(() =>
      Promise.resolve({
        data: vapidKey ? { value: vapidKey } : null,
        error: null
      })
    );

    const newSub = opts.newSubscription ?? makeFakeSubscription();
    const pushManager: FakePushManager = {
      getSubscription: vi.fn().mockResolvedValue(opts.existingSubscription ?? null),
      subscribe: vi.fn().mockResolvedValue(newSub)
    };
    installServiceWorkerStub({ pushManager });
    globalThis.PushManager = class {} as never;
    globalThis.Notification = {
      permission: opts.permission ?? "default",
      requestPermission: vi.fn().mockResolvedValue(opts.requestResult ?? "granted")
    } as never;

    return {
      pushManager,
      setVapidKey: (key: string) => {
        mockChain.maybeSingle = vi.fn(() =>
          Promise.resolve({ data: { value: key }, error: null })
        );
      }
    };
  }

  it("returns false when push is not supported", async () => {
    // No serviceWorker / PushManager / Notification installed.
    await withHook(async (api) => {
      const ok = await api.subscribe();
      expect(ok).toBe(false);
      expect(api.error()).toContain("not supported");
    });
  });

  it("returns false when VAPID key is missing", async () => {
    installPushSupport({ vapidKey: "" });

    await withHook(async (api) => {
      const ok = await api.subscribe();
      expect(ok).toBe(false);
      expect(api.error()).toContain("not configured");
    });
  });

  it("returns false when user is not signed in", async () => {
    installPushSupport({ vapidKey: "BP3bW0LpZ5KQ8M2nV4xR1yH7TtCm9vE0gF6oXaZsBw=" });
    mockUseAuth.mockReturnValueOnce({
      user: () => null,
      isSignedIn: () => false
    });

    await withHook(async (api) => {
      const ok = await api.subscribe();
      expect(ok).toBe(false);
      expect(api.error()).toContain("sign in");
    });
  });

  it("returns false when Notification.permission is denied", async () => {
    installPushSupport({
      vapidKey: "BP3bW0LpZ5KQ8M2nV4xR1yH7TtCm9vE0gF6oXaZsBw=",
      permission: "denied"
    });

    await withHook(async (api) => {
      const ok = await api.subscribe();
      expect(ok).toBe(false);
      expect(api.error()).toContain("blocked");
    });
  });

  it("requests permission + subscribes + upserts the row on success", async () => {
    const sub = makeFakeSubscription();
    const { pushManager } = installPushSupport({
      vapidKey: "BP3bW0LpZ5KQ8M2nV4xR1yH7TtCm9vE0gF6oXaZsBw=",
      permission: "default", // initial state, triggers requestPermission
      requestResult: "granted", // what requestPermission resolves to
      newSubscription: sub
    });
    // Upsert succeeds.
    mockChain.then = vi.fn((resolve: (v: unknown) => unknown) =>
      Promise.resolve({ error: null }).then(resolve)
    );

    await withHook(async (api) => {
      const ok = await api.subscribe();
      expect(ok).toBe(true);
      expect(api.isSubscribed()).toBe(true);
      expect(api.error()).toBeNull();
      expect(pushManager.subscribe).toHaveBeenCalledWith(
        expect.objectContaining({
          userVisibleOnly: true,
          applicationServerKey: expect.any(Uint8Array)
        })
      );
      // Verify the upsert call.
      expect(mockFrom).toHaveBeenCalledWith("push_subscriptions");
      expect(mockChain.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: "user-1",
          endpoint: sub.endpoint,
          keys: {
            p256dh: expect.any(String),
            auth: expect.any(String)
          }
        })
      );
    });
  });

  it("skips permission request when already granted", async () => {
    installPushSupport({
      vapidKey: "BP3bW0LpZ5KQ8M2nV4xR1yH7TtCm9vE0gF6oXaZsBw=",
      permission: "granted"
    });
    mockChain.then = vi.fn((resolve: (v: unknown) => unknown) =>
      Promise.resolve({ error: null }).then(resolve)
    );

    await withHook(async (api) => {
      await api.subscribe();
      // Notification.requestPermission should NOT have been called.
      expect(globalThis.Notification.requestPermission).not.toHaveBeenCalled();
    });
  });

  it("returns false + rolls back the browser subscription when upsert fails", async () => {
    const sub = makeFakeSubscription({ unsubscribe: vi.fn().mockResolvedValue(true) });
    installPushSupport({
      vapidKey: "BP3bW0LpZ5KQ8M2nV4xR1yH7TtCm9vE0gF6oXaZsBw=",
      permission: "granted",
      newSubscription: sub
    });
    // Upsert fails.
    mockChain.then = vi.fn((resolve: (v: unknown) => unknown) =>
      Promise.resolve({ error: new Error("db error") }).then(resolve)
    );

    await withHook(async (api) => {
      const ok = await api.subscribe();
      expect(ok).toBe(false);
      expect(api.error()).toContain("Failed to save");
      // Verify the browser subscription was cleaned up.
      expect(sub.unsubscribe).toHaveBeenCalled();
    });
  });

  it("returns false + sets error when permission is not granted", async () => {
    installPushSupport({
      vapidKey: "BP3bW0LpZ5KQ8M2nV4xR1yH7TtCm9vE0gF6oXaZsBw=",
      permission: "default"
    });
    // requestPermission returns "denied".
    globalThis.Notification.requestPermission = vi.fn().mockResolvedValue("denied");

    await withHook(async (api) => {
      const ok = await api.subscribe();
      expect(ok).toBe(false);
      expect(api.error()).toContain("not granted");
    });
  });
});

// ---------------------------------------------------------------------------
// checkSubscription
// ---------------------------------------------------------------------------

describe("usePushSubscription — checkSubscription", () => {
  it("returns true + sets isSubscribed when an existing subscription is found", async () => {
    const sub = makeFakeSubscription();
    installServiceWorkerStub({
      pushManager: {
        getSubscription: vi.fn().mockResolvedValue(sub),
        subscribe: vi.fn()
      }
    });
    globalThis.PushManager = class {} as never;
    globalThis.Notification = { permission: "granted" } as never;

    await withHook(async (api) => {
      const result = await api.checkSubscription();
      expect(result).toBe(true);
      expect(api.isSubscribed()).toBe(true);
    });
  });

  it("returns false when no subscription exists", async () => {
    installServiceWorkerStub({
      pushManager: {
        getSubscription: vi.fn().mockResolvedValue(null),
        subscribe: vi.fn()
      }
    });
    globalThis.PushManager = class {} as never;
    globalThis.Notification = { permission: "default" } as never;

    await withHook(async (api) => {
      const result = await api.checkSubscription();
      expect(result).toBe(false);
      expect(api.isSubscribed()).toBe(false);
    });
  });

  it("returns false when push is not supported", async () => {
    await withHook(async (api) => {
      const result = await api.checkSubscription();
      expect(result).toBe(false);
    });
  });

  it("returns false when getSubscription throws", async () => {
    installServiceWorkerStub({
      pushManager: {
        getSubscription: vi.fn().mockRejectedValue(new Error("sw error")),
        subscribe: vi.fn()
      }
    });
    globalThis.PushManager = class {} as never;
    globalThis.Notification = { permission: "default" } as never;

    await withHook(async (api) => {
      const result = await api.checkSubscription();
      expect(result).toBe(false);
      expect(api.isSubscribed()).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// unsubscribe
// ---------------------------------------------------------------------------

describe("usePushSubscription — unsubscribe", () => {
  function installWithSubscription(sub: FakePushSubscription): void {
    installServiceWorkerStub({
      pushManager: {
        getSubscription: vi.fn().mockResolvedValue(sub),
        subscribe: vi.fn()
      }
    });
    globalThis.PushManager = class {} as never;
    globalThis.Notification = { permission: "granted" } as never;
  }

  it("unsubscribes from the browser + deletes the DB row", async () => {
    const sub = makeFakeSubscription({ unsubscribe: vi.fn().mockResolvedValue(true) });
    installWithSubscription(sub);
    mockChain.then = vi.fn((resolve: (v: unknown) => unknown) =>
      Promise.resolve({ error: null }).then(resolve)
    );

    await withHook(async (api) => {
      // Verify the subscription was detected on mount.
      expect(api.isSubscribed()).toBe(true);

      const ok = await api.unsubscribe();
      expect(ok).toBe(true);
      expect(api.isSubscribed()).toBe(false);
      expect(sub.unsubscribe).toHaveBeenCalled();
      expect(mockFrom).toHaveBeenCalledWith("push_subscriptions");
      expect(mockChain.delete).toHaveBeenCalled();
      expect(mockChain.eq).toHaveBeenCalledWith("endpoint", sub.endpoint);
    });
  });

  it("returns true when there is no local subscription (no-op)", async () => {
    installServiceWorkerStub({
      pushManager: {
        getSubscription: vi.fn().mockResolvedValue(null),
        subscribe: vi.fn()
      }
    });
    globalThis.PushManager = class {} as never;
    globalThis.Notification = { permission: "default" } as never;

    await withHook(async (api) => {
      const ok = await api.unsubscribe();
      expect(ok).toBe(true);
      expect(api.isSubscribed()).toBe(false);
    });
  });

  it("still marks unsubscribed locally even when browser unsubscribe fails", async () => {
    const sub = makeFakeSubscription({ unsubscribe: vi.fn().mockResolvedValue(false) });
    installWithSubscription(sub);
    mockChain.then = vi.fn((resolve: (v: unknown) => unknown) =>
      Promise.resolve({ error: null }).then(resolve)
    );

    await withHook(async (api) => {
      const _ok = await api.unsubscribe();
      // The browser call returned false (didn't unsubscribe), but we
      // still delete the DB row + mark unsubscribed locally.
      expect(api.isSubscribed()).toBe(false);
    });
  });

  it("returns false + sets error when the DB delete fails", async () => {
    const sub = makeFakeSubscription({ unsubscribe: vi.fn().mockResolvedValue(true) });
    installWithSubscription(sub);
    mockChain.then = vi.fn((resolve: (v: unknown) => unknown) =>
      Promise.resolve({ error: new Error("delete failed") }).then(resolve)
    );

    await withHook(async (api) => {
      const ok = await api.unsubscribe();
      expect(ok).toBe(false);
      expect(api.error()).toContain("update server");
    });
  });

  it("returns false when push is not supported", async () => {
    await withHook(async (api) => {
      const ok = await api.unsubscribe();
      expect(ok).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// sendTest
// ---------------------------------------------------------------------------

describe("usePushSubscription — sendTest", () => {
  it("POSTs to /api/push/send with userId + accessToken", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ sent: 1 })
      } as Response)
    );

    await withHook(async (api) => {
      const ok = await api.sendTest();
      expect(ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/push/send",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: expect.stringContaining('"accessToken":"test-token"')
        })
      );
    });
  });

  it("returns false + sets error when user is not signed in", async () => {
    mockUseAuth.mockReturnValueOnce({
      user: () => null,
      isSignedIn: () => false
    });

    await withHook(async (api) => {
      const ok = await api.sendTest();
      expect(ok).toBe(false);
      expect(api.error()).toContain("sign in");
    });
  });

  it("returns false when server returns non-OK status", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: "server explosion" })
      } as Response)
    );

    await withHook(async (api) => {
      const ok = await api.sendTest();
      expect(ok).toBe(false);
      expect(api.error()).toBe("server explosion");
    });
  });

  it("returns false when sent count is 0 (no subscriptions)", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ sent: 0 })
      } as Response)
    );

    await withHook(async (api) => {
      const ok = await api.sendTest();
      expect(ok).toBe(false);
      expect(api.error()).toContain("No push subscriptions");
    });
  });

  it("returns false + sets error when fetch throws", async () => {
    mockFetch.mockImplementation(() => Promise.reject(new Error("network down")));

    await withHook(async (api) => {
      const ok = await api.sendTest();
      expect(ok).toBe(false);
      expect(api.error()).toBe("network down");
    });
  });
});

// ---------------------------------------------------------------------------
// subscribedCategories (derived from notifPrefs)
// ---------------------------------------------------------------------------

describe("usePushSubscription — subscribedCategories", () => {
  it("returns null when not subscribed", async () => {
    await withHook(async (api) => {
      expect(api.subscribedCategories()).toBeNull();
    });
  });

  it("returns the category map when subscribed", async () => {
    const sub = makeFakeSubscription();
    installServiceWorkerStub({
      pushManager: {
        getSubscription: vi.fn().mockResolvedValue(sub),
        subscribe: vi.fn()
      }
    });
    globalThis.PushManager = class {} as never;
    globalThis.Notification = { permission: "granted" } as never;

    await withHook(async (api) => {
      expect(api.isSubscribed()).toBe(true);
      const cats = api.subscribedCategories();
      expect(cats).toEqual({
        newSeason: true,
        continueWatching: false,
        weeklyRecap: true,
        recommendations: false,
        syncStatus: true
      });
    });
  });
});

// ---------------------------------------------------------------------------
// vapidPublicKey (fetched on mount when supported + signed in)
// ---------------------------------------------------------------------------

describe("usePushSubscription — vapidPublicKey", () => {
  it("fetches the VAPID key on mount when supported + signed in", async () => {
    installServiceWorkerStub({
      pushManager: {
        getSubscription: vi.fn().mockResolvedValue(null),
        subscribe: vi.fn()
      }
    });
    globalThis.PushManager = class {} as never;
    globalThis.Notification = { permission: "default" } as never;

    mockChain.maybeSingle = vi.fn(() =>
      Promise.resolve({
        data: { value: "BK2v-fetched-key" },
        error: null
      })
    );

    await withHook(async (api) => {
      expect(api.vapidPublicKey()).toBe("BK2v-fetched-key");
    });
  });

  it("sets vapidPublicKey to empty string when the DB row is missing", async () => {
    installServiceWorkerStub({
      pushManager: {
        getSubscription: vi.fn().mockResolvedValue(null),
        subscribe: vi.fn()
      }
    });
    globalThis.PushManager = class {} as never;
    globalThis.Notification = { permission: "default" } as never;

    mockChain.maybeSingle = vi.fn(() =>
      Promise.resolve({ data: null, error: null })
    );

    await withHook(async (api) => {
      expect(api.vapidPublicKey()).toBe("");
    });
  });
});
