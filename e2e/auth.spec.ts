// e2e/auth.spec.ts
//
// E2E smoke tests for the authentication flow.
//
// ─────────────────────────────────────────────────────────────────────
// PHASE 8 CHUNK 4 — E2E TESTING
// ─────────────────────────────────────────────────────────────────────
// These tests verify the AuthModal renders correctly and responds to
// basic interactions. They do NOT actually sign in — that would
// require live Supabase credentials and a verified email, which is
// out of scope for the default E2E suite. Instead, we verify:
//   1. The auth modal can be opened from a guest-only trigger
//   2. The modal renders the email/password form
//   3. The mode toggle (signin ↔ signup) works
//   4. The Google OAuth button is present
//   5. Form validation prevents empty submission
//
// The auth modal is opened via the Profile page's "Sign In" CTA,
// which is the most stable guest-visible trigger in the app.

import { test, expect } from "@playwright/test";

test.describe("Auth modal — critical flow", () => {
  test.beforeEach(async ({ page }) => {
    // Profile page shows a "Sign In" CTA for guests. This is the most
    // reliable cross-page trigger for opening the auth modal.
    await page.goto("/profile");
  });

  test("auth modal opens and renders the email/password form", async ({
    page,
  }) => {
    // The Profile page renders a "Sign In" button for guests. Click it.
    // We use a resilient text-match since the exact CTA copy may evolve.
    await page.getByRole("button", { name: /sign in/i }).first().click();

    // The modal title is "Welcome Back" (signin mode) — verify it appears.
    await expect(page.locator("#auth-modal-title")).toBeVisible();

    // Email + password inputs should be visible and labeled correctly.
    await expect(
      page.getByRole("textbox", { name: /email address/i })
    ).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();

    // Submit button should be present (text depends on mode).
    await expect(
      page.getByRole("button", { name: /sign in|create account/i })
    ).toBeVisible();
  });

  test("mode toggle switches between Sign In and Create Account", async ({
    page,
  }) => {
    // Open the auth modal.
    await page.getByRole("button", { name: /sign in/i }).first().click();
    await expect(page.locator("#auth-modal-title")).toBeVisible();

    // Default mode is "signin" → title is "Welcome Back", button is "Sign In".
    await expect(page.locator("#auth-modal-title")).toHaveText(/welcome back/i);
    const submitButton = page.getByRole("button", { name: /^sign in$/i });
    await expect(submitButton).toBeVisible();

    // Click the "Sign up" toggle link.
    await page.getByRole("button", { name: /^sign up$/i }).click();

    // Mode should switch to "signup" → title is "Join CineLog", button is "Create Account".
    await expect(page.locator("#auth-modal-title")).toHaveText(/join cinelog/i);
    await expect(
      page.getByRole("button", { name: /create account/i })
    ).toBeVisible();

    // Toggle back to "signin".
    await page.getByRole("button", { name: /^sign in$/i }).click();
    await expect(page.locator("#auth-modal-title")).toHaveText(/welcome back/i);
    await expect(submitButton).toBeVisible();
  });

  test("Google OAuth button is present", async ({ page }) => {
    await page.getByRole("button", { name: /sign in/i }).first().click();
    await expect(page.locator("#auth-modal-title")).toBeVisible();

    // Google OAuth button should be rendered with its recognizable label.
    await expect(
      page.getByRole("button", { name: /continue with google/i })
    ).toBeVisible();
  });

  test("form validation prevents empty submission", async ({ page }) => {
    await page.getByRole("button", { name: /sign in/i }).first().click();
    await expect(page.locator("#auth-modal-title")).toBeVisible();

    // Click Sign In without filling the form. The browser's native
    // `required` validation should block submission — the modal stays
    // open and no error toast appears.
    const submitButton = page.getByRole("button", { name: /^sign in$/i });
    await submitButton.click();

    // Modal remains open (no close on empty submit).
    await expect(page.locator("#auth-modal-title")).toBeVisible();

    // No error toast should be shown — native validation intercepts.
    await expect(page.locator('[role="alert"]')).toHaveCount(0);
  });

  test("auth modal closes via the close button", async ({ page }) => {
    await page.getByRole("button", { name: /sign in/i }).first().click();
    await expect(page.locator("#auth-modal-title")).toBeVisible();

    // Click the close (X) button in the modal corner.
    await page.getByRole("button", { name: /^close$/i }).click();

    // Modal should disappear.
    await expect(page.locator("#auth-modal-title")).toHaveCount(0);
  });
});
