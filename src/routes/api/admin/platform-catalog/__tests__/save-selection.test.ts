// src/routes/api/admin/platform-catalog/__tests__/save-selection.test.ts
//
// Tests for the POST /api/admin/platform-catalog/save-selection route.
//
// These tests verify the admin "Save Selected = complete published
// catalogue" behavior:
//   - requireAdmin auth (401 if not admin)
//   - country validation (400 if missing/invalid)
//   - empty providers array is allowed (deactivates all rows for
//     the country — the zero-selection case)
//   - the route calls saveSelectionToPublishedCatalog with the
//     country + valid providers
//   - the route returns { ok, published, deactivated }
//   - audit log entry is created with action
//     "platform-catalog:save-selection"
//   - rate limiting is enforced
//
// The saveSelectionToPublishedCatalog cache helper is mocked so we
// can verify the call shape without a real Supabase connection.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────

// Mock requireAdmin — returns a fake admin user by default. Each
// test can override via `requireAdminMock.mockResolvedValueOnce(...)`.
const requireAdminMock = vi.fn();
vi.mock("~/lib/supabase/admin/adminGuard", () => ({
  requireAdmin: requireAdminMock,
  AdminAPIEvent: undefined as unknown
}));

// Mock enforceAdminMutationRateLimit — returns null (allowed) by
// default. Tests can override to return a 429 Response.
const enforceAdminMutationRateLimitMock = vi.fn();
vi.mock("~/lib/server/adminRateLimit", () => ({
  enforceAdminMutationRateLimit: enforceAdminMutationRateLimitMock
}));

// Mock logAdminAction — captures the audit log entry for assertions.
const logAdminActionMock = vi.fn();
vi.mock("~/lib/supabase/admin/auditLog", () => ({
  logAdminAction: logAdminActionMock
}));

// Mock saveSelectionToPublishedCatalog — captures the call args so
// we can assert the route passed the right country + providers.
// Returns a fake { published, deactivated } result by default.
const saveSelectionMock = vi.fn();
vi.mock("~/server/justwatch/cache", () => ({
  saveSelectionToPublishedCatalog: saveSelectionMock
}));

const { POST } = await import("../save-selection");

// ─── Helpers ─────────────────────────────────────────────────────────

interface AdminUser {
  id: string;
  email: string;
  username: string;
  display_name: string;
}

const FAKE_ADMIN: AdminUser = {
  id: "admin-1",
  email: "admin@example.com",
  username: "admin",
  display_name: "Admin"
};

function makeEvent(body: unknown): { request: Request } {
  return {
    request: new Request("https://example.com/api/admin/platform-catalog/save-selection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    })
  };
}

beforeEach(() => {
  requireAdminMock.mockReset();
  enforceAdminMutationRateLimitMock.mockReset();
  logAdminActionMock.mockReset();
  saveSelectionMock.mockReset();

  // Default: admin auth succeeds, rate limit allows, audit log
  // resolves, save-selection returns a fake result.
  requireAdminMock.mockResolvedValue({ ok: true, admin: FAKE_ADMIN });
  enforceAdminMutationRateLimitMock.mockResolvedValue(null);
  logAdminActionMock.mockResolvedValue(undefined);
  saveSelectionMock.mockResolvedValue({ published: 0, deactivated: 0 });
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────

describe("POST /api/admin/platform-catalog/save-selection", () => {
  it("returns 401 if requireAdmin fails", async () => {
    requireAdminMock.mockResolvedValueOnce({ ok: false, reason: "no_cookie" });
    const res = await POST(makeEvent({ country: "IN", providers: [] }) as never);
    expect(res.status).toBe(401);
    expect(saveSelectionMock).not.toHaveBeenCalled();
    expect(logAdminActionMock).not.toHaveBeenCalled();
  });

  it("returns 400 if country is missing", async () => {
    const res = await POST(makeEvent({ providers: [] }) as never);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/country/i);
    expect(saveSelectionMock).not.toHaveBeenCalled();
  });

  it("returns 400 if country is invalid (not 2-letter)", async () => {
    const res = await POST(makeEvent({ country: "INDIA", providers: [] }) as never);
    expect(res.status).toBe(400);
    expect(saveSelectionMock).not.toHaveBeenCalled();
  });

  it("normalizes country to uppercase", async () => {
    const res = await POST(
      makeEvent({ country: "in", providers: [] }) as never
    );
    expect(res.status).toBe(200);
    expect(saveSelectionMock).toHaveBeenCalledTimes(1);
    expect(saveSelectionMock.mock.calls[0][0]).toBe("IN");
  });

  it("passes the rate-limit response through (429) when rate-limited", async () => {
    const rateLimitResponse = new Response(
      JSON.stringify({ error: "Too many admin mutations" }),
      { status: 429 }
    );
    enforceAdminMutationRateLimitMock.mockResolvedValueOnce(rateLimitResponse);
    const res = await POST(
      makeEvent({ country: "IN", providers: [] }) as never
    );
    expect(res.status).toBe(429);
    expect(saveSelectionMock).not.toHaveBeenCalled();
  });

  it("calls saveSelectionToPublishedCatalog with the country + valid providers", async () => {
    const providers = [
      {
        id: "p1",
        clearName: "Netflix",
        shortName: "NF",
        technicalName: "netflix",
        icon: ""
      },
      {
        id: "p2",
        clearName: "Prime Video",
        shortName: "PV",
        technicalName: "prime",
        icon: ""
      }
    ];
    const res = await POST(
      makeEvent({ country: "IN", providers }) as never
    );
    expect(res.status).toBe(200);
    expect(saveSelectionMock).toHaveBeenCalledTimes(1);
    const [countryArg, providersArg] = saveSelectionMock.mock.calls[0];
    expect(countryArg).toBe("IN");
    expect(providersArg).toHaveLength(2);
    expect(providersArg[0].technicalName).toBe("netflix");
    expect(providersArg[1].technicalName).toBe("prime");
  });

  it("filters out malformed provider entries (missing technicalName)", async () => {
    const providers = [
      { id: "p1", clearName: "Netflix", shortName: "NF", technicalName: "netflix", icon: "" },
      { id: "p2", clearName: "Bad", shortName: "B", technicalName: "", icon: "" }, // empty technicalName
      { id: "p3", clearName: "", shortName: "X", technicalName: "x", icon: "" }, // empty clearName
      { id: "p4", clearName: "NoTech", shortName: "N", technicalName: undefined as unknown as string, icon: "" } // undefined technicalName (cast to satisfy TS while still being malformed at runtime)
    ];
    const res = await POST(
      makeEvent({ country: "IN", providers }) as never
    );
    expect(res.status).toBe(200);
    expect(saveSelectionMock).toHaveBeenCalledTimes(1);
    const providersArg = saveSelectionMock.mock.calls[0][1];
    // Only the first (netflix) is valid; the rest are filtered out.
    expect(providersArg).toHaveLength(1);
    expect(providersArg[0].technicalName).toBe("netflix");
  });

  it("allows an empty providers array (zero-selection case — deactivates all rows for the country)", async () => {
    const res = await POST(
      makeEvent({ country: "IN", providers: [] }) as never
    );
    expect(res.status).toBe(200);
    expect(saveSelectionMock).toHaveBeenCalledTimes(1);
    const [countryArg, providersArg] = saveSelectionMock.mock.calls[0];
    expect(countryArg).toBe("IN");
    expect(providersArg).toEqual([]);
  });

  it("returns { ok, published, deactivated } from saveSelectionToPublishedCatalog", async () => {
    saveSelectionMock.mockResolvedValueOnce({ published: 4, deactivated: 87 });
    const res = await POST(
      makeEvent({
        country: "IN",
        providers: [
          { id: "p1", clearName: "Netflix", shortName: "NF", technicalName: "netflix", icon: "" }
        ]
      }) as never
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; published: number; deactivated: number };
    expect(body.ok).toBe(true);
    expect(body.published).toBe(4);
    expect(body.deactivated).toBe(87);
  });

  it("creates an audit log entry with action 'platform-catalog:save-selection'", async () => {
    const providers = [
      { id: "p1", clearName: "Netflix", shortName: "NF", technicalName: "netflix", icon: "" }
    ];
    await POST(makeEvent({ country: "IN", providers }) as never);
    expect(logAdminActionMock).toHaveBeenCalledTimes(1);
    // logAdminAction(event, admin, entry) — we check the 3rd arg (entry).
    const entry = logAdminActionMock.mock.calls[0][2] as {
      action: string;
      entity_type: string;
      entity_id: string;
      payload: { country: string; published: number; deactivated: number; selectedTechnicalNames: string[] };
    };
    expect(entry.action).toBe("platform-catalog:save-selection");
    expect(entry.entity_type).toBe("justwatch_provider_catalog");
    expect(entry.entity_id).toBe("IN");
    expect(entry.payload.country).toBe("IN");
    expect(entry.payload.selectedTechnicalNames).toEqual(["netflix"]);
  });

  it("returns 500 if saveSelectionToPublishedCatalog throws", async () => {
    saveSelectionMock.mockRejectedValueOnce(new Error("Supabase down"));
    const res = await POST(
      makeEvent({ country: "IN", providers: [] }) as never
    );
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/failed/i);
  });

  it("audit-logs the deactivated count too (so a future auditor can reconstruct before/after)", async () => {
    saveSelectionMock.mockResolvedValueOnce({ published: 3, deactivated: 88 });
    await POST(
      makeEvent({
        country: "IN",
        providers: [
          { id: "p1", clearName: "Netflix", shortName: "NF", technicalName: "netflix", icon: "" }
        ]
      }) as never
    );
    expect(logAdminActionMock).toHaveBeenCalledTimes(1);
    const entry = logAdminActionMock.mock.calls[0][2] as {
      payload: { published: number; deactivated: number };
    };
    expect(entry.payload.published).toBe(3);
    expect(entry.payload.deactivated).toBe(88);
  });
});
