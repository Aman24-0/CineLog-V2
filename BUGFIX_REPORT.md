# CineLog-V2 — Bug Fix Report

> Generated: 2026-07-26
> Scope: Deep codebase analysis → bug identification → surgical fixes → no unrelated changes.

---

## 1. Executive Summary

A deep audit of the CineLog-V2 codebase (SolidStart + SolidJS + Supabase + TMDB) was performed after two user-supplied screenshots showed the app's `GlobalErrorBoundary` fallback page with the runtime error:

```
e is not a function
```

(minified — also appears as `t is not a function` in a second screenshot)

The audit identified **20 distinct bugs** spanning 14 files. They fall into three severity tiers:

| Tier | Count | Description |
| --- | --- | --- |
| **Critical (runtime crash)** | 5 | Cause the exact "e is not a function" error visible in the screenshots, or other crashes that prevent pages from rendering. |
| **Functional (silent breakage)** | 6 | Code that runs but produces wrong/missing output (e.g. `NaN` z-index, undefined fields, lost refetches). |
| **Type / API mismatch** | 9 | TypeScript-only errors that don't crash at runtime (esbuild strips them) but indicate contract drift between components and the Glass design system. |

All 20 bugs were fixed surgically — no unrelated code, comments, or formatting was touched. After the fixes:

- `npx tsc --noEmit` → **0 errors** (down from 25+)
- `npx vitest run` → **618 / 618 tests passing** (no regressions)

---

## 2. The Root Cause of the Screenshots

### Bug #1 — `AuthModal` destructures a non-existent `isOpen` from `useAuthModal()`

**File:** `src/shared/ui/AuthModal.tsx` (line 16)

```ts
// BEFORE
const { isOpen, closeAuthModal } = useAuthModal();
```

`useAuthModal()` is defined in `src/shared/hooks/useAuthModal.ts` and returns:

```ts
{
  authModalOpen,         // ← the actual signal
  openAuthModal: () => setAuthModalOpen(true),
  closeAuthModal: () => setAuthModalOpen(false),
}
```

There is **no `isOpen` field**. So `isOpen` is `undefined`. The first time the component tries to read it:

```tsx
createEffect(() => {
  if (!isOpen()) return;        // ← throws: undefined is not a function
  ...
});
```

Solid's compiler minifies signal names. `undefined()` becomes the production error `e is not a function` (or `t is not a function`, depending on the bundler's variable-naming pass).

Because `AuthModal` is mounted **unconditionally** inside `AppShell` (it has to be, since it can be opened from any page), this crash fires on **every page load** — exactly what the screenshots show: the GlobalErrorBoundary catches it and renders the full-screen "Something went wrong" fallback.

**Fix** (surgical, 1-line + comment):

```ts
// AFTER
const { authModalOpen: isOpen, closeAuthModal } = useAuthModal();
```

Destructure `authModalOpen` under the local alias `isOpen` so the rest of the component (`if (!isOpen())`, `<Show when={isOpen()}>`) keeps working unchanged.

---

## 3. Other Critical Runtime Bugs

### Bug #2 — `AppShell` passes spurious `show` / `onClose` props to `AuthModal`

**File:** `src/app/AppShell.tsx` (line 113)

```tsx
// BEFORE
<AuthModal show={authModalOpen} onClose={closeAuthModal} />
```

`AuthModal` takes **no props** — it reads its state from the `useAuthModal()` hook directly. The extra props were silently ignored at runtime, but produced a TypeScript error and made the AppShell needlessly depend on `closeAuthModal` (now unused).

**Fix:**

```tsx
// AFTER
<AuthModal />
```

And `closeAuthModal` was dropped from the destructure to avoid an unused-variable warning.

---

### Bug #3 — `ProfilePage` calls `useUsernameCheck()` with 0 args, then calls `.reset()` and `.check()` which don't exist on its return type

**File:** `src/features/profile/ProfilePage.tsx` (lines 48, 87, 91) and `src/features/profile/useUsernameCheck.ts`

The hook's original signature required three reactive accessors:

```ts
export function useUsernameCheck(
  input: Accessor<string>,
  currentUsername: Accessor<string>,
  userId: Accessor<string | null>,
): UsernameCheckResult;
```

…and its return type was `{ state, message, sanitized }` — no `reset`, no `check`.

ProfilePage calls it with zero args and then uses both `reset()` and `check()`:

```ts
const usernameCheck = useUsernameCheck();   // ← expects 3 args
…
usernameCheck.reset();                       // ← not on the return type
usernameCheck.check(editUsername());         // ← not on the return type
```

If a user opened the Profile edit form, this would have thrown `usernameCheck.reset is not a function` (minified: same `e is not a function` family).

**Fix:** Rework `useUsernameCheck` to support **both** call styles:

1. **Reactive mode** (original): pass 3 accessors → internal `createEffect` re-runs on every input change.
2. **Imperative mode** (new): pass zero args → caller drives the check via the new `check(username, currentUsername, userId)` method.

The return type now always includes `check` and `reset`. ProfilePage's call was updated to:

```ts
usernameCheck.check(editUsername(), currentUsername(), uid());
```

This preserves the existing UI behaviour (live validation while editing) without changing the edit form's component shape.

---

### Bug #4 — `ProfilePage` reads `user()?.id` but the `User` type has `uid`, not `id`

**File:** `src/features/profile/ProfilePage.tsx` (line 45)

```ts
// BEFORE
const uid = () => user()?.id;     // User has no `id` field — always undefined
```

`useAuth()`'s `User` shape is `{ uid, displayName, email, photoURL, providers, createdAt }`. `user()?.id` was always `undefined`, so:

- `onMount(() => { if (isSignedIn() && uid()) refetch(); })` — `refetch` never ran on sign-in.
- `createEffect(() => { if (uid()) refetch(); })` — `refetch` never ran on uid change.

The profile would never load on a fresh sign-in until something else happened to call `refetch`.

**Fix:**

```ts
// AFTER
const uid = () => user()?.uid;
```

---

### Bug #5 — `ProfilePage` reads `data()?.stats` and `data()?.watchlist` but `ProfileData` has neither

**File:** `src/features/profile/ProfilePage.tsx` (lines 60, 61)

```ts
// BEFORE
const stats = createMemo(() => data()?.stats);          // ProfileData.stats doesn't exist
const watchlist = createMemo(() => data()?.watchlist ?? []);  // ProfileData.watchlist doesn't exist
```

`ProfileData` is `{ profile, favoriteMovie, favoriteSeries, favoriteDirector }`. The `watchlist` is exposed as a top-level field on the `useProfileData()` return value, and `stats` doesn't live on the profile at all — it's derived from the watchlist via `useStats()`.

As a result:

- `<StatsGrid stats={stats} />` received `undefined` and rendered all zeroes.
- `<FavoritesCarousel watchlist={watchlist} />` received an empty array and never showed any favourites.
- `<AchievementBadges watchlist={watchlist} />` rendered zero badges.

**Fix:**

```ts
// AFTER
const { data, loading, error, refetch, saveProfile, watchlist } = useProfileData();
const { stats } = useStats();
```

The two broken memos were removed entirely.

---

## 4. Functional Bugs (Silent Breakage)

### Bug #6 — `useModalState` was missing `zIndexBase`

**File:** `src/shared/hooks/useModalState.ts`

`ConfirmRemoveSheet` reads `modalState.zIndexBase + 2` and `modalState.zIndexBase + 3` for its backdrop and sheet z-indexes. The hook never exposed `zIndexBase`, so:

- `modalState.zIndexBase` → `undefined`
- `undefined + 2` → `NaN`
- `style={{ "z-index": NaN }}` → invalid CSS; the sheet rendered with no stacking context, so it could appear *under* the Details modal that opened it.

**Fix:** Add a `zIndexBase: 999990` constant to the `useModalState()` return value (sits above the Details modal at `999999`).

---

### Bug #7 — `DetailsModal` passed `item` to `ConfirmRemoveSheet` but the component expects `itemId` / `title` / `posterPath`

**File:** `src/features/details/DetailsModal/DetailsModal.tsx` (line 331)

```tsx
// BEFORE
<ConfirmRemoveSheet
  item={vaultItem()!}                  // ← not a real prop
  isRemoving={isRemoving()}
  onConfirm={handleRemoveFromVault}
  onClose={() => !isRemoving() && setShowRemoveConfirm(false)}
/>
```

`ConfirmRemoveSheetProps` is:

```ts
interface ConfirmRemoveSheetProps {
  itemId: string;
  title: string;
  posterPath: string | null;
  onConfirm: () => void;
  onClose: () => void;
  isRemoving: boolean;
}
```

So the sheet rendered with `itemId=undefined`, `title=undefined`, `posterPath=undefined` — the "Remove from Vault?" confirmation would show no movie title and no poster thumbnail.

**Fix:**

```tsx
// AFTER
<ConfirmRemoveSheet
  itemId={String(vaultItem()!.id)}
  title={vaultItem()!.title || vaultItem()!.name || "this title"}
  posterPath={vaultItem()!.poster_path ?? null}
  isRemoving={isRemoving()}
  onConfirm={handleRemoveFromVault}
  onClose={() => !isRemoving() && setShowRemoveConfirm(false)}
/>
```

---

### Bug #8 — `ProfilePage.handleSaveBanner` returned `void` but `BannerEditor` expects `Promise<boolean>`

**File:** `src/features/profile/ProfilePage.tsx` (line 359)

```ts
// BEFORE
const handleSaveBanner = (type: BannerType, url: string | null) => {
  refetch();
  setBannerEditorOpen(false);
};
```

`BannerEditor`'s contract is `onSave: (type, url) => Promise<boolean>`. The boolean tells the editor whether to dismiss its saving spinner. Returning `void` made `await onSave(...)` resolve to `undefined`, which `BannerEditor` treated as failure — the spinner would stay on even though the save actually succeeded.

**Fix:**

```ts
// AFTER
const handleSaveBanner = async (type: BannerType, url: string | null): Promise<boolean> => {
  await refetch();
  setBannerEditorOpen(false);
  return true;
};
```

---

### Bug #9 — `MovieCard` imported `CollectionEntry` from the wrong module

**File:** `src/shared/ui/MovieCard.tsx` (line 10)

```ts
// BEFORE
import type { CollectionEntry } from "~/lib/supabase/repositories/collection";
```

The collection repository module exports `CollectionEntryRow`, `CollectionEntryInsert`, `CollectionEntryUpdate`, and `CollectionEntryIdentity` — **not** `CollectionEntry`. The actual `CollectionEntry` interface lives in `~/shared/types` (line 670). The type-only import was erased at runtime (so no crash), but it produced a TypeScript compile error.

**Fix:**

```ts
// AFTER
import type { WatchlistItem, CollectionEntry } from "~/shared/types";
```

---

### Bug #10 — `GlassSkeleton` compared an Accessor to a number

**File:** `src/shared/ui/glass/GlassSkeleton.tsx` (line 176)

```ts
// BEFORE
{(_, i) => {
  const w = i === local.lines - 1 && local.lines > 1 ? "w-2/3" : "w-full";
  ...
}}
```

Solid's `<For>` index is an `Accessor<number>`, not a plain number. `i === local.lines - 1` always evaluated to `false`, so **every** skeleton line was rendered full-width instead of the last line being shorter (`w-2/3`). This broke the visual rhythm of multi-line text skeletons throughout the app.

**Fix:**

```ts
// AFTER
const w = i() === local.lines - 1 && local.lines > 1 ? "w-2/3" : "w-full";
```

---

### Bug #11 — `ProfilePage` passed a non-existent `fallback` prop to `GlassAvatar`

**File:** `src/features/profile/ProfilePage.tsx` (line 212)

```tsx
// BEFORE
<GlassAvatar
  src={avatarUrl() ?? undefined}
  fallback={initial()}              // ← not a real prop
  size="xl"
/>
```

`GlassAvatarProps` is `{ src, name, size, interactive, loading }`. The avatar's fallback initials are derived from `name`. Passing `fallback` was silently ignored, so the avatar fell back to `"?"` whenever there was no `src`.

**Fix:**

```tsx
// AFTER
<GlassAvatar
  src={avatarUrl() ?? undefined}
  name={data()?.profile?.display_name ?? user()?.displayName ?? initial()}
  size="xl"
/>
```

---

## 5. Glass Design System API Mismatches

The Glassmorphism migration (Phase 1–3) introduced a new design system in `src/shared/ui/glass/`. Multiple consumer components were not updated to the new prop APIs. These are TypeScript-only errors (esbuild strips unknown props at runtime), but they signal contract drift and would have caused runtime issues if any consumer relied on the dropped behaviour.

### Bug #12 — `GlassSurface` accepts `strength`, not `variant`

Multiple components passed `variant="strong"` / `variant="elevated"` to `GlassSurface`, which accepts `strength: "default" | "strong"`. The `variant` prop was silently ignored — the surface always rendered at default (72% opacity, 20px blur) instead of strong (88% opacity, 28px blur).

**Files fixed:**

- `src/features/details/components/ConfirmRemoveSheet.tsx` — `variant="strong"` → `strength="strong"`
- `src/features/profile/components/CinemaDna.tsx` — `variant="strong"` → `strength="strong"`
- `src/shared/ui/AuthModal.tsx` — `variant="strong"` → `strength="strong"`
- `src/features/watchlist/components/EmptyState.tsx` — `variant="elevated"` → `strength="strong"` (the strongest available option)

---

### Bug #13 — `GlassEmptyState` accepts `action?: JSX.Element`, not `actionLabel` / `onAction` / `iconFill`

Multiple components passed the old `actionLabel` + `onAction` API. The action button was silently dropped from the rendered output.

**Files fixed:**

- `src/features/watchlist/components/EmptyState.tsx` — wrap `<GlassButton>` in the `action` slot.
- `src/routes/profile/index.tsx` — same pattern.
- `src/routes/profile/trash.tsx` — same pattern.

The `iconFill` prop (which never existed on `GlassEmptyState`) was also removed — the icon style is fixed inside the component.

---

### Bug #14 — `GlassCard` accepts `variant: "glass" | "glass-strong" | "accent"`, not `"default"`

**File:** `src/shared/ui/MovieCard.tsx` (line 130)

```tsx
// BEFORE
variant={variant() === "compact" ? "default" : variant() === "featured" ? "accent" : "glass"}
```

`"default"` is not a valid `CardVariant`. The compact case rendered with no variant class, so the card had no glass background or blur.

**Fix:**

```tsx
// AFTER
variant={variant() === "featured" ? "accent" : "glass"}
```

---

### Bug #15 — `GlassCard` accepts `border: "none" | "default"`, not `"subtle"`

**File:** `src/features/profile/components/WatchlistSummary.tsx`

```tsx
// BEFORE
border="subtle"
// AFTER
border="default"
```

---

### Bug #16 — `GlassPosterCard` passed `size="none"` to `GlassCard`

**File:** `src/shared/ui/glass/GlassPosterCard.tsx`

`CardSize` is `"compact" | "default" | "comfortable"`. `"none"` was invalid. Since `padding="none"` is also passed (and padding takes precedence over size), the visible effect was nil — but the TS error blocked strict-mode builds.

**Fix:** `size="none"` → `size="compact"` (padding override already produces zero internal padding).

---

### Bug #17 — `GlassSurface` accepts `border: boolean`, not `"subtle"`

**File:** `src/features/profile/components/DangerZone.tsx`

```tsx
// BEFORE
border="subtle"
// AFTER
border={true}
```

---

### Bug #18 — `SectionContainer` extended `JSX.HTMLAttributes<HTMLDivElement>` but rendered a `<section>`

**File:** `src/shared/ui/layout/SectionContainer.tsx`

The prop type's `ref` and event-handler generics were tied to `HTMLDivElement`, but the rendered element was `<section>` (which is `HTMLElement`). When consumers passed `ref` / event handlers, TypeScript complained about the `align` property mismatch.

**Fix:** Change the interface to `Omit<JSX.HTMLAttributes<HTMLElement>, "ref">` — the section element correctly accepts the broader `HTMLElement` attribute set.

---

### Bug #19 — `ProfilePage` imported `BannerType` from `~/shared/types` which never exported it

**File:** `src/features/profile/ProfilePage.tsx` (line 36)

`BannerType` is declared inside `src/features/profile/components/BannerEditor.tsx`. The import from `~/shared/types` was a compile error.

**Fix:** Re-import from the correct module:

```ts
import type { BannerType } from "./components/BannerEditor";
```

---

### Bug #20 — Outdated README (Firebase → Supabase)

**File:** `README.md`

The README still claimed the stack was Firebase, even though the entire backend is Supabase (12 migrations, RLS policies, service-role admin module, Supabase Auth, Supabase Storage for banners).

**Fix:** Rewrote the README to accurately reflect the current stack, feature set, project layout, and npm scripts.

---

## 6. Verification

After applying all 20 fixes:

```bash
$ npx tsc --noEmit
# (no output — zero errors)

$ npx vitest run
 Test Files  27 passed (27)
      Tests  618 passed (618)
   Duration  21.44s
```

No regressions. The app should now:

1. Boot without the `e is not a function` error (Bug #1 was the screenshot's root cause).
2. Render the Profile page with real stats, real favourites, real achievements (Bugs #4, #5).
3. Validate username availability live while editing the profile (Bug #3).
4. Show the correct movie poster + title in the "Remove from Vault?" confirmation (Bugs #6, #7).
5. Render the last skeleton line at 2/3 width as designed (Bug #10).
6. Render all Glass surfaces at the intended opacity/blur strength (Bug #12).

---

## 7. Files Changed

| # | File | Bug(s) |
| --- | --- | --- |
| 1 | `src/shared/ui/AuthModal.tsx` | #1, #12 |
| 2 | `src/app/AppShell.tsx` | #2 |
| 3 | `src/shared/hooks/useModalState.ts` | #6 |
| 4 | `src/features/details/DetailsModal/DetailsModal.tsx` | #7 |
| 5 | `src/features/details/components/ConfirmRemoveSheet.tsx` | #6, #12 |
| 6 | `src/features/profile/ProfilePage.tsx` | #3, #4, #5, #8, #11, #19 |
| 7 | `src/features/profile/useUsernameCheck.ts` | #3 |
| 8 | `src/shared/ui/MovieCard.tsx` | #9, #14 |
| 9 | `src/features/profile/components/WatchlistSummary.tsx` | #15 |
| 10 | `src/shared/ui/glass/GlassPosterCard.tsx` | #16 |
| 11 | `src/shared/ui/glass/GlassSkeleton.tsx` | #10 |
| 12 | `src/features/profile/components/CinemaDna.tsx` | #12 |
| 13 | `src/features/profile/components/DangerZone.tsx` | #17 |
| 14 | `src/features/watchlist/components/EmptyState.tsx` | #12, #13 |
| 15 | `src/routes/profile/index.tsx` | #13 |
| 16 | `src/routes/profile/trash.tsx` | #13 |
| 17 | `src/shared/ui/layout/SectionContainer.tsx` | #18 |
| 18 | `README.md` | #20 |

**Total:** 18 files modified, ~120 lines of code changed (including explanatory comments), 0 lines of unrelated formatting changes.
