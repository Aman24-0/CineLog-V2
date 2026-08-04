// src/shared/ui/layout/index.ts
//
// Previously re-exported `PageContainer` and `SectionContainer` from this
// directory. Both have been removed:
//   - `SectionContainer.tsx` was dead code (Task 1, Phase 2 cleanup).
//   - `PageContainer.tsx` was a duplicate of `~/shared/ui/PageContainer.tsx`
//     (Task 5, Phase 2 consolidation — ProfilePage now imports the
//     standard `PageContainer` from `~/shared/ui`).
//
// The barrel is kept as an empty file so existing `~/shared/ui/layout`
// import paths don't break the build (none remain in the codebase, but
// the file presence avoids confusing resolution errors during the
// transition). Safe to delete entirely once no consumer references it.

export {};
