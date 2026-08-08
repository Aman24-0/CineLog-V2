// src/features/account/__tests__/accountActions.test.ts
//
// Unit tests for the extended account actions module.
// Covers: updateEmail, changePassword, linkEmailPassword,
// getUserIdentities, linkProvider, unlinkProvider, signOutGlobal,
// sendPasswordResetEmail.
//
// Mock strategy:
//   • ~/lib/supabase/client → returns a stub with `.auth` methods.
//   • ~/shared/hooks/useToast → returns a spy showToast.
//   • ~/shared/hooks/useAuth → refreshUserFromServer is a spy.

import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks must run BEFORE the module under test is imported. ---
// vi.hoisted ensures the mock fn references exist when vi.mock factories
// run (they are hoisted above all imports).

const {
  mockShowToast,
  mockRefreshUserFromServer,
  mockAuthUpdateUser,
  mockAuthGetUser,
  mockAuthGetUserIdentities,
  mockAuthLinkIdentity,
  mockAuthUnlinkIdentity,
  mockAuthSignOut,
  mockAuthResetPasswordForEmail
} = vi.hoisted(() => ({
  mockShowToast: vi.fn(),
  mockRefreshUserFromServer: vi.fn().mockResolvedValue(undefined),
  mockAuthUpdateUser: vi.fn(),
  mockAuthGetUser: vi.fn(),
  mockAuthGetUserIdentities: vi.fn(),
  mockAuthLinkIdentity: vi.fn(),
  mockAuthUnlinkIdentity: vi.fn(),
  mockAuthSignOut: vi.fn(),
  mockAuthResetPasswordForEmail: vi.fn()
}));

vi.mock("~/shared/hooks/useToast", () => ({
  useToast: () => ({ showToast: mockShowToast, toasts: () => [] })
}));

vi.mock("~/shared/hooks/useAuth", () => ({
  refreshUserFromServer: mockRefreshUserFromServer
}));

vi.mock("~/lib/supabase/client", () => ({
  getClient: () => ({
    auth: {
      updateUser: mockAuthUpdateUser,
      getUser: mockAuthGetUser,
      getUserIdentities: mockAuthGetUserIdentities,
      linkIdentity: mockAuthLinkIdentity,
      unlinkIdentity: mockAuthUnlinkIdentity,
      signOut: mockAuthSignOut,
      resetPasswordForEmail: mockAuthResetPasswordForEmail
    }
  })
}));

// --- Import the module under test AFTER mocks are in place. ---

import {
  updateEmail,
  changePassword,
  linkEmailPassword,
  getUserIdentities,
  linkProvider,
  unlinkProvider,
  signOutGlobal,
  sendPasswordResetEmail
} from "../accountActions";

beforeEach(() => {
  vi.clearAllMocks();
  // Default: each auth method resolves successfully.
  mockAuthUpdateUser.mockResolvedValue({ data: {}, error: null });
  mockAuthGetUser.mockResolvedValue({
    data: { user: { email: "old@example.com" } },
    error: null
  });
  mockAuthGetUserIdentities.mockResolvedValue({
    data: { identities: [{ id: "ident-1", provider: "google" }] },
    error: null
  });
  mockAuthLinkIdentity.mockResolvedValue({ data: {}, error: null });
  mockAuthUnlinkIdentity.mockResolvedValue({ data: {}, error: null });
  mockAuthSignOut.mockResolvedValue({ error: null });
  mockAuthResetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
});

// ---------------------------------------------------------------------------
// updateEmail
// ---------------------------------------------------------------------------

describe("updateEmail", () => {
  it("rejects an invalid email with a toast and returns success=false", async () => {
    const result = await updateEmail("not-an-email");
    expect(result.success).toBe(false);
    expect(result.error).toBe("Invalid email");
    expect(mockShowToast).toHaveBeenCalledWith(
      "Please enter a valid email address.",
      "error"
    );
    expect(mockAuthUpdateUser).not.toHaveBeenCalled();
  });

  it("rejects an empty email", async () => {
    const result = await updateEmail("   ");
    expect(result.success).toBe(false);
  });

  it("trims + lowercases the email before sending to Supabase", async () => {
    await updateEmail("  New.Email@Example.COM  ");
    expect(mockAuthUpdateUser).toHaveBeenCalledWith({
      email: "new.email@example.com"
    });
  });

  it("shows a success toast on success", async () => {
    const result = await updateEmail("new@example.com");
    expect(result.success).toBe(true);
    expect(mockShowToast).toHaveBeenCalledWith(
      "Confirmation email sent — check your new inbox.",
      "success",
      4000
    );
  });

  it("surfaces Supabase errors via friendlyError + toast", async () => {
    mockAuthUpdateUser.mockResolvedValueOnce({
      data: {},
      error: new Error("User already registered")
    });
    const result = await updateEmail("taken@example.com");
    expect(result.success).toBe(false);
    expect(result.error).toBe("An account with that email already exists.");
    expect(mockShowToast).toHaveBeenCalledWith(
      "An account with that email already exists.",
      "error"
    );
  });

  it("passes through unknown Supabase error messages", async () => {
    mockAuthUpdateUser.mockResolvedValueOnce({
      data: {},
      error: new Error("Some random Supabase error")
    });
    const result = await updateEmail("new@example.com");
    expect(result.success).toBe(false);
    expect(result.error).toBe("Some random Supabase error");
  });
});

// ---------------------------------------------------------------------------
// changePassword
// ---------------------------------------------------------------------------

describe("changePassword", () => {
  it("rejects a password shorter than 8 chars", async () => {
    const result = await changePassword("short");
    expect(result.success).toBe(false);
    expect(result.error).toBe("Password too short");
    expect(mockShowToast).toHaveBeenCalledWith(
      "Password must be at least 8 characters.",
      "error"
    );
    expect(mockAuthUpdateUser).not.toHaveBeenCalled();
  });

  it("rejects an empty password", async () => {
    const result = await changePassword("");
    expect(result.success).toBe(false);
  });

  it("sends only { password } when currentPassword is omitted", async () => {
    await changePassword("valid-password-123");
    expect(mockAuthUpdateUser).toHaveBeenCalledWith({ password: "valid-password-123" });
  });

  it("includes current_password when provided", async () => {
    await changePassword("valid-password-123", "old-pass");
    expect(mockAuthUpdateUser).toHaveBeenCalledWith({
      password: "valid-password-123",
      current_password: "old-pass"
    });
  });

  it("shows a success toast on success", async () => {
    const result = await changePassword("valid-password-123");
    expect(result.success).toBe(true);
    expect(mockShowToast).toHaveBeenCalledWith("Password updated.", "success");
  });

  it("maps 'password should be at least' Supabase error to friendly message", async () => {
    // Use a valid-length password so the call reaches Supabase.
    mockAuthUpdateUser.mockResolvedValueOnce({
      data: {},
      error: new Error("Password should be at least 8 characters.")
    });
    const result = await changePassword("valid-but-rejected");
    expect(result.success).toBe(false);
    expect(result.error).toBe("Password must be at least 8 characters.");
  });

  it("maps 'invalid credentials' Supabase error to friendly message", async () => {
    mockAuthUpdateUser.mockResolvedValueOnce({
      data: {},
      error: new Error("Invalid credentials")
    });
    const result = await changePassword("valid-password-123", "wrong-old");
    expect(result.success).toBe(false);
    expect(result.error).toBe("Incorrect current password.");
  });
});

// ---------------------------------------------------------------------------
// linkEmailPassword
// ---------------------------------------------------------------------------

describe("linkEmailPassword", () => {
  it("rejects an invalid email", async () => {
    const result = await linkEmailPassword("bad", "valid-password-123");
    expect(result.success).toBe(false);
    expect(result.error).toBe("Invalid email");
  });

  it("rejects a short password", async () => {
    const result = await linkEmailPassword("new@example.com", "short");
    expect(result.success).toBe(false);
    expect(result.error).toBe("Password too short");
  });

  it("sends both email and password to updateUser", async () => {
    await linkEmailPassword("new@example.com", "valid-password-123");
    expect(mockAuthUpdateUser).toHaveBeenCalledWith({
      email: "new@example.com",
      password: "valid-password-123"
    });
  });

  it("calls refreshUserFromServer after success", async () => {
    await linkEmailPassword("new@example.com", "valid-password-123");
    expect(mockRefreshUserFromServer).toHaveBeenCalled();
  });

  it("returns emailChangePending=true when email differs from current", async () => {
    mockAuthGetUser.mockResolvedValueOnce({
      data: { user: { email: "old@example.com" } },
      error: null
    });
    const result = await linkEmailPassword("new@example.com", "valid-password-123");
    expect(result.success).toBe(true);
    expect(result.emailChangePending).toBe(true);
  });

  it("returns emailChangePending=false when email matches current", async () => {
    mockAuthGetUser.mockResolvedValueOnce({
      data: { user: { email: "same@example.com" } },
      error: null
    });
    const result = await linkEmailPassword("same@example.com", "valid-password-123");
    expect(result.success).toBe(true);
    expect(result.emailChangePending).toBe(false);
  });

  it("shows different toasts for email-change vs password-only", async () => {
    // Email change case
    mockAuthGetUser.mockResolvedValueOnce({
      data: { user: { email: "old@example.com" } },
      error: null
    });
    await linkEmailPassword("new@example.com", "valid-password-123");
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.stringContaining("Password set. We also sent a confirmation"),
      "success",
      6000
    );

    mockShowToast.mockClear();

    // Password-only case
    mockAuthGetUser.mockResolvedValueOnce({
      data: { user: { email: "same@example.com" } },
      error: null
    });
    await linkEmailPassword("same@example.com", "valid-password-123");
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.stringContaining("Email + password linked"),
      "success",
      4000
    );
  });

  it("surfaces getUser errors", async () => {
    mockAuthGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: new Error("No active session")
    });
    const result = await linkEmailPassword("new@example.com", "valid-password-123");
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getUserIdentities
// ---------------------------------------------------------------------------

describe("getUserIdentities", () => {
  it("returns the identities array on success", async () => {
    const result = await getUserIdentities();
    expect(result).toEqual([{ id: "ident-1", provider: "google" }]);
  });

  it("returns an empty array when Supabase returns no identities", async () => {
    mockAuthGetUserIdentities.mockResolvedValueOnce({
      data: { identities: [] },
      error: null
    });
    const result = await getUserIdentities();
    expect(result).toEqual([]);
  });

  it("returns null on Supabase error", async () => {
    mockAuthGetUserIdentities.mockResolvedValueOnce({
      data: null,
      error: new Error("network failure")
    });
    const result = await getUserIdentities();
    expect(result).toBeNull();
  });

  it("returns null when the call throws", async () => {
    mockAuthGetUserIdentities.mockRejectedValueOnce(new Error("boom"));
    const result = await getUserIdentities();
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// linkProvider
// ---------------------------------------------------------------------------

describe("linkProvider", () => {
  it("calls linkIdentity with the given provider", async () => {
    await linkProvider("google");
    expect(mockAuthLinkIdentity).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "google" })
    );
  });

  it("includes a redirectTo based on window.location.origin", async () => {
    const result = await linkProvider("apple");
    expect(result.success).toBe(true);
    const call = mockAuthLinkIdentity.mock.calls[0][0] as {
      provider: string;
      options: { redirectTo?: string };
    };
    expect(call.provider).toBe("apple");
    expect(call.options.redirectTo).toMatch(/\/settings\/account$/);
  });

  it("returns success=false + error on Supabase error", async () => {
    mockAuthLinkIdentity.mockResolvedValueOnce({
      data: {},
      error: new Error("identity already exists")
    });
    const result = await linkProvider("google");
    expect(result.success).toBe(false);
    expect(result.error).toBe("That provider is already linked to your account.");
  });
});

// ---------------------------------------------------------------------------
// unlinkProvider
// ---------------------------------------------------------------------------

describe("unlinkProvider", () => {
  const identity = {
    id: "ident-1",
    provider: "google",
    identity_data: { email: "user@example.com" }
  } as never;

  it("calls unlinkIdentity with the full identity object", async () => {
    await unlinkProvider(identity);
    expect(mockAuthUnlinkIdentity).toHaveBeenCalledWith(identity);
  });

  it("calls refreshUserFromServer after success", async () => {
    await unlinkProvider(identity);
    expect(mockRefreshUserFromServer).toHaveBeenCalled();
  });

  it("shows a success toast on success", async () => {
    await unlinkProvider(identity);
    expect(mockShowToast).toHaveBeenCalledWith("Provider unlinked.", "success");
  });

  it("maps 'last identity' Supabase error to friendly message", async () => {
    mockAuthUnlinkIdentity.mockResolvedValueOnce({
      data: {},
      error: new Error("Cannot unlink the last identity")
    });
    const result = await unlinkProvider(identity);
    expect(result.success).toBe(false);
    expect(result.error).toContain("last sign-in method");
  });
});

// ---------------------------------------------------------------------------
// signOutGlobal
// ---------------------------------------------------------------------------

describe("signOutGlobal", () => {
  it("calls signOut with scope=global", async () => {
    await signOutGlobal();
    expect(mockAuthSignOut).toHaveBeenCalledWith({ scope: "global" });
  });

  it("shows a success toast on success", async () => {
    const result = await signOutGlobal();
    expect(result.success).toBe(true);
    expect(mockShowToast).toHaveBeenCalledWith(
      "Signed out everywhere.",
      "success"
    );
  });

  it("returns success=false + error on Supabase error", async () => {
    mockAuthSignOut.mockResolvedValueOnce({
      error: new Error("session expired")
    });
    const result = await signOutGlobal();
    expect(result.success).toBe(false);
    expect(result.error).toBe("session expired");
  });
});

// ---------------------------------------------------------------------------
// sendPasswordResetEmail
// ---------------------------------------------------------------------------

describe("sendPasswordResetEmail", () => {
  it("calls resetPasswordForEmail with the trimmed email", async () => {
    await sendPasswordResetEmail("  user@example.com  ");
    expect(mockAuthResetPasswordForEmail).toHaveBeenCalledWith(
      "user@example.com",
      expect.objectContaining({})
    );
  });

  it("includes a redirectTo based on window.location.origin", async () => {
    await sendPasswordResetEmail("user@example.com");
    const call = mockAuthResetPasswordForEmail.mock.calls[0];
    expect(call[1].redirectTo).toMatch(/\/settings\/account$/);
  });

  it("shows a success toast on success", async () => {
    const result = await sendPasswordResetEmail("user@example.com");
    expect(result.success).toBe(true);
    expect(mockShowToast).toHaveBeenCalledWith(
      "Reset link sent — check your inbox.",
      "success",
      4000
    );
  });

  it("returns success=false + error on Supabase error", async () => {
    mockAuthResetPasswordForEmail.mockResolvedValueOnce({
      error: new Error("Email not confirmed")
    });
    const result = await sendPasswordResetEmail("user@example.com");
    expect(result.success).toBe(false);
    expect(result.error).toContain("confirm your email");
  });
});
