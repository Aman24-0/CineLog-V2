// src/features/sync/import/sources/V1MigrationWizard.tsx
//
// V1MigrationWizard — the multi-step migration flow for CineLog V1 → V2.
//
// FLOW (per spec):
//   Welcome → Sign in to V1 → Read Firebase → Analyze Library →
//   Duplicate Detection → Preview Import → Start Migration →
//   Import Progress → Finished (Summary)
//
// RESUMABLE: if a previous migration was interrupted, the Welcome step
// offers to resume from where it left off.
//
// This component is rendered inside a modal/sheet by the Sync page
// when the user taps the "CineLog V1" import card.

import {
  createSignal, createMemo, Show, For, type Component,
} from "solid-js";
import type { ImportResult } from "../ImportSource";
import {
  connectToV1, readV1Library, detectDuplicates,
  migrateV1ToV2, loadMigrationProgress,
  type ImportItem, type ImportPreview,
} from "./cinelogV1Migration";
import { useUserLibrary } from "~/shared/hooks/useUserLibrary";

interface V1MigrationWizardProps {
  onComplete: (result: ImportResult) => void;
  onCancel: () => void;
}

type Step =
  | "welcome"
  | "signin"
  | "reading"
  | "analyzing"
  | "preview"
  | "migrating"
  | "complete";

const STEPS: { id: Step; label: string }[] = [
  { id: "welcome",   label: "Welcome" },
  { id: "signin",    label: "Sign In" },
  { id: "reading",   label: "Reading" },
  { id: "analyzing", label: "Analyzing" },
  { id: "preview",   label: "Preview" },
  { id: "migrating", label: "Migrating" },
  { id: "complete",  label: "Done" },
];

const V1MigrationWizard: Component<V1MigrationWizardProps> = (props) => {
  const library = useUserLibrary();
  const [step, setStep] = createSignal<Step>("welcome");
  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [error, setError] = createSignal<string | null>(null);
  const [v1Uid, setV1Uid] = createSignal<string | null>(null);
  const [v1Items, setV1Items] = createSignal<ImportItem[]>([]);
  const [preview, setPreview] = createSignal<ImportPreview | null>(null);
  const [skipDuplicates, setSkipDuplicates] = createSignal(true);
  const [progress, setProgress] = createSignal({ processed: 0, total: 0, imported: 0, skipped: 0, failed: 0 });
  const [result, setResult] = createSignal<ImportResult | null>(null);
  const [resumable, setResumable] = createSignal(false);

  // Check for resumable migration on mount.
  const existingProgress = loadMigrationProgress();
  if (existingProgress && !existingProgress.completed) {
    setResumable(true);
  }

  const currentStepIndex = createMemo(() => STEPS.findIndex((s) => s.id === step()));

  const handleSignIn = async () => {
    setError(null);
    setStep("reading");
    try {
      const { uid } = await connectToV1(email(), password());
      setV1Uid(uid);
      setStep("analyzing");
      const items = await readV1Library(uid);
      setV1Items(items);
      const analyzed = detectDuplicates(items, library.watchlist());
      setPreview(analyzed);
      setStep("preview");
    } catch (err) {
      console.error("[V1 migration] Sign-in or read failed:", err);
      setError(err instanceof Error ? err.message : "Failed to read your V1 library.");
      setStep("signin");
    }
  };

  const handleStartMigration = async () => {
    if (!v1Uid()) return;
    setStep("migrating");
    setError(null);
    try {
      const res = await migrateV1ToV2(v1Uid()!, v1Items(), {
        onProgress: (processed, total, imported, skipped, failed) => {
          setProgress({ processed, total, imported, skipped, failed });
        },
        shouldSkipDuplicates: () => skipDuplicates(),
      });
      setResult(res);
      setStep("complete");
      // Refresh the V2 library so the imported titles appear everywhere.
      void library.refresh();
    } catch (err) {
      console.error("[V1 migration] Migration failed:", err);
      setError(err instanceof Error ? err.message : "Migration failed. Your progress is saved.");
      setStep("preview");
    }
  };

  const handleFinish = () => {
    if (result()) props.onComplete(result()!);
    else props.onCancel();
  };

  return (
    <div class="v1-wizard">
      {/* Step indicator */}
      <div class="v1-wizard-steps" aria-label="Migration progress">
        <For each={STEPS}>
          {(s, i) => (
            <div
              class="v1-wizard-step"
              classList={{
                "is-active": step() === s.id,
                "is-done": currentStepIndex() > i(),
              }}
            >
              <span class="v1-wizard-step-dot" aria-hidden="true" />
              <span class="v1-wizard-step-label">{s.label}</span>
            </div>
          )}
        </For>
      </div>

      {/* Step content */}
      <div class="v1-wizard-content">
        {/* WELCOME */}
        <Show when={step() === "welcome"}>
          <div class="v1-wizard-panel">
            <div class="v1-wizard-hero-icon" aria-hidden="true">
              <span class="material-symbols-outlined" style={{ "font-size": "40px", color: "var(--p)" }} aria-hidden="true">rocket_launch</span>
            </div>
            <h2 class="v1-wizard-title">Migrate from CineLog V1</h2>
            <p class="v1-wizard-body">
              Bring your entire library — movies, series, ratings, notes, and collections — from the original CineLog app into your new account.
              Your V2 library stays untouched; we only add what's missing.
            </p>
            <Show when={resumable()}>
              <div class="v1-wizard-resume">
                <span class="material-symbols-outlined" style={{ "font-size": "16px", color: "var(--p)" }} aria-hidden="true">history</span>
                <span>A previous migration was interrupted. You can resume from where it left off.</span>
              </div>
            </Show>
            <div class="v1-wizard-actions">
              <button class="btn-ghost focus-ring" onClick={props.onCancel}>Cancel</button>
              <button class="btn-primary focus-ring" onClick={() => setStep("signin")}>
                <span class="material-symbols-outlined" style={{ "font-size": "14px" }} aria-hidden="true">arrow_forward</span>
                Get Started
              </button>
            </div>
          </div>
        </Show>

        {/* SIGN IN */}
        <Show when={step() === "signin"}>
          <div class="v1-wizard-panel">
            <h2 class="v1-wizard-title">Sign in to CineLog V1</h2>
            <p class="v1-wizard-body">Use your original CineLog account credentials. We only read your data — we don't change anything in V1.</p>
            <div class="v1-wizard-form">
              <label class="v1-wizard-field">
                <span class="v1-wizard-field-label">V1 Email</span>
                <input
                  type="email"
                  class="v1-wizard-input focus-ring"
                  value={email()}
                  onInput={(e) => setEmail(e.currentTarget.value)}
                  placeholder="you@example.com"
                  autocomplete="email"
                />
              </label>
              <label class="v1-wizard-field">
                <span class="v1-wizard-field-label">V1 Password</span>
                <input
                  type="password"
                  class="v1-wizard-input focus-ring"
                  value={password()}
                  onInput={(e) => setPassword(e.currentTarget.value)}
                  placeholder="••••••••"
                  autocomplete="current-password"
                />
              </label>
            </div>
            <Show when={error()}>
              <p class="v1-wizard-error" role="alert">{error()}</p>
            </Show>
            <div class="v1-wizard-actions">
              <button class="btn-ghost focus-ring" onClick={() => setStep("welcome")}>Back</button>
              <button class="btn-primary focus-ring" onClick={handleSignIn} disabled={!email() || !password()}>
                <span class="material-symbols-outlined" style={{ "font-size": "14px" }} aria-hidden="true">lock_open</span>
                Connect & Read
              </button>
            </div>
          </div>
        </Show>

        {/* READING (auto-transitions to analyzing) */}
        <Show when={step() === "reading"}>
          <WizardLoading
            icon="cloud_download"
            title="Reading your V1 library"
            body="Fetching every title, rating, and note from your original account. This may take a moment for large libraries."
          />
        </Show>

        {/* ANALYZING (auto-transitions to preview) */}
        <Show when={step() === "analyzing"}>
          <WizardLoading
            icon="insights"
            title="Analyzing your library"
            body="Categorizing titles, detecting duplicates, and preparing your migration preview."
          />
        </Show>

        {/* PREVIEW */}
        <Show when={step() === "preview" && preview()}>
          <div class="v1-wizard-panel">
            <h2 class="v1-wizard-title">Migration Preview</h2>
            <p class="v1-wizard-body">Here's what we found in your V1 library.</p>
            <div class="v1-wizard-preview-grid">
              <PreviewStat icon="movie" label="Movies" value={preview()!.movies} />
              <PreviewStat icon="tv" label="Series" value={preview()!.series} />
              <PreviewStat icon="star" label="Ratings" value={preview()!.ratings} />
              <PreviewStat icon="check_circle" label="Watch Status" value={preview()!.watchStatuses} />
              <PreviewStat icon="sticky_note_2" label="Notes" value={preview()!.notes} />
              <PreviewStat icon="collections_bookmark" label="Collections" value={preview()!.collections} />
              <PreviewStat icon="content_copy" label="Duplicates" value={preview()!.duplicates} accent="warning" />
              <PreviewStat icon="download" label="Will Import" value={preview()!.total} accent="primary" />
            </div>
            <label class="v1-wizard-toggle">
              <input
                type="checkbox"
                checked={skipDuplicates()}
                onChange={(e) => setSkipDuplicates(e.currentTarget.checked)}
              />
              <span>Skip titles already in your V2 library ({preview()!.duplicates} duplicates)</span>
            </label>
            <Show when={error()}>
              <p class="v1-wizard-error" role="alert">{error()}</p>
            </Show>
            <div class="v1-wizard-actions">
              <button class="btn-ghost focus-ring" onClick={props.onCancel}>Cancel</button>
              <button class="btn-primary focus-ring" onClick={handleStartMigration}>
                <span class="material-symbols-outlined" style={{ "font-size": "14px" }} aria-hidden="true">play_arrow</span>
                Start Migration
              </button>
            </div>
          </div>
        </Show>

        {/* MIGRATING (progress bar) */}
        <Show when={step() === "migrating"}>
          <div class="v1-wizard-panel">
            <h2 class="v1-wizard-title">Migrating your library…</h2>
            <p class="v1-wizard-body">Do not close this window. Your progress is saved — you can resume if interrupted.</p>
            <div class="v1-wizard-progress">
              <div class="v1-wizard-progress-bar">
                <div
                  class="v1-wizard-progress-fill"
                  style={{ width: `${progress().total > 0 ? (progress().processed / progress().total) * 100 : 0}%` }}
                />
              </div>
              <div class="v1-wizard-progress-stats">
                <span>{progress().processed} / {progress().total}</span>
                <span>{progress().imported} imported · {progress().skipped} skipped · {progress().failed} failed</span>
              </div>
            </div>
          </div>
        </Show>

        {/* COMPLETE */}
        <Show when={step() === "complete" && result()}>
          <div class="v1-wizard-panel">
            <div class="v1-wizard-hero-icon v1-wizard-hero-icon-success" aria-hidden="true">
              <span class="material-symbols-outlined" style={{ "font-size": "40px", color: "var(--p)" }} aria-hidden="true">check_circle</span>
            </div>
            <h2 class="v1-wizard-title">Migration Complete</h2>
            <p class="v1-wizard-body">{result()!.summary}</p>
            <div class="v1-wizard-result-grid">
              <PreviewStat icon="check" label="Imported" value={result()!.imported} accent="primary" />
              <PreviewStat icon="skip_next" label="Skipped" value={result()!.skipped} />
              <PreviewStat icon="error" label="Failed" value={result()!.failed} accent={result()!.failed > 0 ? "warning" : undefined} />
            </div>
            <div class="v1-wizard-actions">
              <button class="btn-primary focus-ring" onClick={handleFinish}>
                <span class="material-symbols-outlined" style={{ "font-size": "14px" }} aria-hidden="true">check</span>
                Done
              </button>
            </div>
          </div>
        </Show>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Small helper components
// ---------------------------------------------------------------------------

const WizardLoading: Component<{ icon: string; title: string; body: string }> = (props) => (
  <div class="v1-wizard-panel">
    <div class="v1-wizard-loading-icon" aria-hidden="true">
      <span class="material-symbols-outlined animate-spin" style={{ "font-size": "40px", color: "var(--p)" }} aria-hidden="true">{props.icon}</span>
    </div>
    <h2 class="v1-wizard-title">{props.title}</h2>
    <p class="v1-wizard-body">{props.body}</p>
  </div>
);

const PreviewStat: Component<{ icon: string; label: string; value: number; accent?: "primary" | "warning" }> = (props) => (
  <div class="v1-wizard-stat" data-accent={props.accent}>
    <span class="material-symbols-outlined" style={{ "font-size": "16px" }} aria-hidden="true">{props.icon}</span>
    <div class="v1-wizard-stat-text">
      <span class="v1-wizard-stat-value">{props.value}</span>
      <span class="v1-wizard-stat-label">{props.label}</span>
    </div>
  </div>
);

export default V1MigrationWizard;
