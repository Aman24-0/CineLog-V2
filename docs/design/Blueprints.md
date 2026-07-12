# CineLog Page Blueprints

> **Version:** 1.0  
> **Date:** 2026-07-12  
> **Status:** Structural Layout Blueprints — No Colors, No CSS, No UI Redesign  
> **Rule:** These are structural blueprints only. They describe WHAT goes WHERE, not HOW it looks.

---

## Blueprint Notation

```
[TOP AREA]        → Sticky/fixed elements, header, back navigation
[PRIMARY]         → Main content the page exists to show
[SECONDARY]       → Supporting content that enriches understanding
[CARDS]           → Grid/list of card components
[ACTIONS]         → Interactive elements (buttons, toggles)
[FAB]             → Floating action button (if applicable)
[BOTTOM AREA]     → Content padding for bottom nav
[EMPTY STATE]     → What shows when there's no data
[LOADING STATE]   → What shows during data fetch
[SCROLL BEHAVIOR] → How scrolling affects the layout
[INTERACTION PRIORITY] → Which interactions matter most
```

---

## 1. Discover Blueprint

### Top Area
- App header (sticky, glass): CINELOG wordmark + avatar pill

### Primary Section
- **Spotlight** — Full-width hero with backdrop image, gradient overlay, content cluster (eyebrow + title + subtitle + quick meta + CTA)

### Secondary Sections (17 folds, vertically stacked)
- Continue Watching (horizontal rail, 16:9 cards)
- Insight Strip (3 mini-cards: taste summary)
- Trending This Week (horizontal rail)
- Now in Theatres (horizontal rail)
- Because You Love [Genre] (horizontal rail)
- Surprise Me (editorial card, 16:9)
- Weekend Picks (horizontal rail)
- Something Different (horizontal rail)
- Hidden Gems (horizontal rail, LazyMount starts here)
- Top Rated Movies (horizontal rail)
- Top Rated Series (horizontal rail)
- New on [OTT Platform] (OTT section with provider chips)
- Genre Explorer (expandable genre browser)
- New Seasons (horizontal rail)
- Coming Soon (horizontal rail)
- Guest CTA (sign-in prompt for unauthenticated users)

### Cards
- Rail cards: 2:3 poster, 130-140px wide, 12px gap, horizontal scroll with snap
- Continue cards: 16:9 with progress bar, ~200px wide
- Editorial card: 16:9 with overlay text
- OTT section: provider chip + rail

### Actions
- Spotlight CTA (primary button)
- "Surprise Me" card tap (random pick)
- Genre Explorer expand/collapse
- Card taps → Details Modal

### FAB
- None

### Bottom Area
- Bottom navigation (fixed, opaque)
- Page content padded for nav height + safe area

### Empty State
- Premium empty state with icon + title + message + CTA (Sign In for guests)

### Loading State
- DiscoverSkeleton: Spotlight skeleton + 3 rail skeletons + placeholder cards

### Scroll Behavior
- Vertical scroll through 17 sections
- Sections 8+ use LazyMount (IntersectionObserver, 150px rootMargin)
- Horizontal rails scroll independently with snap
- No parallax, no sticky elements below header

### Interaction Priority
1. Spotlight CTA (primary conversion)
2. Card taps (open details)
3. Genre Explorer (discover new content)
4. Surprise Me (serendipity)
5. Rail scrolling (browse content)

---

## 2. Watchlist (Vault) Blueprint

### Top Area
- App header (sticky, glass)
- Search bar (sticky, glass, below header) — input + clear button
- Filter bar (sticky, below search) — Quick filter tabs (All/Watching/Completed/Planned/On Hold/Dropped) + filter button

### Primary Section
- **Vault Grid** — Responsive grid of vault cards (3→4→5 columns)
- Each card: 2:3 poster + status badge + title + subtitle + rating chips

### Secondary Section
- **Watchlist Stats** — Horizontal bar with counts (Watching N · Completed N · Planned N · On Hold N · Dropped N)
- **Timeline View** (alternative to grid) — Vertical timeline with month pills, entry cards

### Cards
- Vault cards: 2:3 poster, status badge, rating chips
- Timeline cards: horizontal card with poster + metadata

### Actions
- Search input (debounced, 250ms)
- Quick filter tab selection
- Filter drawer (genre, platform, tags)
- Grid/Timeline view toggle
- Card tap → Details Modal
- ScrollToTop button

### FAB
- None

### Bottom Area
- Bottom navigation
- Infinite scroll threshold: 200px from bottom → increment displayLimit by 20

### Empty State
- "Start Your Vault" — icon + title + message + CTA (Discover link)

### Loading State
- LoadingSkeleton — Grid of poster-shaped blocks

### Scroll Behavior
- Search + filters are sticky
- Grid scrolls vertically
- Infinite scroll via scroll event listener
- ScrollToTop appears after scrolling past first viewport

### Interaction Priority
1. Search input (find specific title)
2. Quick filter tabs (narrow by status)
3. Card tap (open details)
4. Filter drawer (advanced filtering)
5. View toggle (grid vs. timeline)

---

## 3. Collections Index Blueprint

### Top Area
- App header (sticky, glass)

### Primary Section
- **Page Title** — Display type "Collections" + eyebrow label
- **User Collections** — Grid of collection cards (2→3 columns)
  - Each card: poster collage (4-image grid) + collection name + entry count
  - Action bar: "New Collection" button + "Smart" button
- **Subscribed Universes** — Grid of universe cards
  - Each card: banner image + universe name + entry count + progress ring
  - Action: "Add Universe" button

### Secondary Section
- None

### Cards
- Collection cards: 4-poster collage, name, count
- Universe cards: banner, name, count, progress ring, three-dot menu

### Actions
- "New Collection" → FolderEditor inline
- "Smart" → SmartCollectionBuilder
- "Add Universe" → AddUniverseModal (lazy-loaded)
- Card tap → Collection Detail
- Three-dot menu → Unsubscribe

### FAB
- None

### Bottom Area
- Bottom navigation
- ScrollToTop

### Empty State
- "No Collections Yet" — icon + title + message + "Create Your First" CTA

### Loading State
- Grid of skeleton blocks

### Scroll Behavior
- Vertical scroll through two sections
- No sticky elements below header

### Interaction Priority
1. "New Collection" / "Smart" (create)
2. Card tap (view collection)
3. "Add Universe" (subscribe)
4. Unsubscribe (three-dot menu)

---

## 4. Collection Detail Blueprint

### Top Area
- Back link: "← Back to Collections"

### Primary Section
- **Universe Dashboard** — Hero banner with backdrop + gradient + content cluster (name + stats + viewing order selector + provider filter)
- **Timeline** — Vertical timeline with year/month markers and entry cards

### Secondary Section
- None

### Cards
- Timeline entries: poster + title + year + type badge + position indicator

### Actions
- Back link
- Viewing order toggle (Chronological/Release)
- Provider filter
- Edit button → Collection Edit page
- Timeline entry tap → Details Modal

### FAB
- None

### Bottom Area
- Bottom navigation
- ScrollToTop

### Empty State
- Not Found state with message + back link

### Loading State
- CollectionSkeleton (2 gray bars — currently too basic)

### Scroll Behavior
- Vertical scroll through timeline
- Back link is at top (not sticky)

### Interaction Priority
1. Timeline entry tap (open details)
2. Edit button (navigate to edit page)
3. Viewing order toggle
4. Back link

---

## 5. Collection Edit Blueprint

### Top Area
- Header: Back button + "Edit [Collection Name]" + Save + Reset buttons

### Primary Section
- **Add Custom Entry** — Search input + results dropdown
- **Timeline Entry List** — Draggable list of entries
  - Each entry: drag handle + poster + title + year + pin toggle + hide toggle + notes + remove button

### Secondary Section
- None

### Cards
- Timeline entries: drag handle + poster + title + controls

### Actions
- Save (persist changes → navigate back)
- Reset (discard local changes)
- Drag-and-drop reorder (mouse-only — **accessibility gap**)
- Pin/Hide/Notes/Remove per entry
- Add custom entry (search + add)

### FAB
- None

### Bottom Area
- Bottom navigation
- List bottom padding

### Empty State
- None (page always has at least the original entries)

### Loading State
- None (entries are passed from detail page)

### Scroll Behavior
- Vertical scroll through entry list
- No sticky elements (Save/Reset at top — should they be sticky?)

### Interaction Priority
1. Save (persist changes)
2. Reorder (drag-and-drop)
3. Pin/Hide/Remove per entry
4. Add custom entry
5. Reset (discard changes)

---

## 6. Profile Blueprint

### Top Area
- App header (sticky, glass)

### Primary Section (Portrait Layout)
- **Profile Banner** — Full-bleed image, 16:6 (mobile) / 16:5 (desktop), gradient overlay
- **Avatar** — Overlaps banner bottom by ~50%, 80px (mobile) / 96px (desktop)
- **Identity Block** — Display name + @username + tagline (inline-editable)
- **Taste Card** — 6-tile grid of top genres/directors with poster thumbnails + swap overlays

### Secondary Sections
- **Profile Completion** — Checklist of setup steps with progress
- **Watchlist Summary** — Stat counts (watching, completed, planned, etc.)
- **Quick Links** — 4 link cards: Stats, History, Achievements, Settings

### Cards
- Taste tiles: poster background + genre/director name + swap overlay
- Quick link cards: icon + label + chevron
- Completion items: icon + label + checkmark

### Actions
- Edit/Save/Cancel (inline editing of name, username, tagline)
- ESC key to cancel editing
- Taste tile swap → FavoritesPicker modal
- Quick link taps → navigate to sub-pages
- Banner tap → BannerEditor

### FAB
- None

### Bottom Area
- Bottom navigation

### Empty State
- Guest state: sign-in prompt

### Loading State
- ProfileSkeleton: banner + avatar circle + 3 text lines + taste grid

### Scroll Behavior
- Vertical scroll through profile sections
- Banner parallax: subtle shrink on scroll

### Interaction Priority
1. Edit/Save identity (primary self-expression)
2. Taste card swap (curate taste profile)
3. Quick link navigation
4. Banner edit
5. Profile completion steps

---

## 7. Stats Blueprint

### Top Area
- Back link: "← Back to Profile"
- Page title: "How You Watch"
- Hero stat: largest single stat (e.g., total titles)

### Primary Section
- **Quick Stats Grid** — 4 insight cards (movies vs. series, total hours, genres in taste, average rating)

### Secondary Sections (9 additional sections)
- Movie vs TV ratio bar
- Top Genres (horizontal bar chart)
- Release Decades (grid with year + count)
- Favorite Directors (list with poster + name + count)
- Watching Heatmap (7×52 grid)
- Monthly Trends (bar chart)
- Weekend vs Weekday (ratio bar)
- Top Rated (list of highest-rated titles)

### Cards
- Insight cards: icon + value + label
- Director rows: poster + name + count
- Top rated rows: poster + title + rating

### Actions
- Back link
- Card/item taps (where applicable)

### FAB
- None

### Bottom Area
- Bottom navigation
- 10 sections need generous bottom padding

### Empty State
- "Start Tracking" — icon + title + message + CTA

### Loading State
- None currently (should add section-level skeletons)

### Scroll Behavior
- Vertical scroll through 10 sections
- All sections mount at once (should use LazyMount)

### Interaction Priority
1. Hero stat (immediate understanding)
2. Insight cards (key metrics)
3. Genre/director deep-dives
4. Heatmap/trend analysis
5. Top rated browsing

---

## 8. Search Blueprint

### Top Area
- App header (sticky, glass)
- Search input (autofocus, full-width, clear button)

### Primary Section (3 modes, only 1 visible)
- **Cold-start** — Recent searches (chip list) + Trending (rail) + Browse by Genre (pill grid)
- **Active Query** — Search results grid (3→4 columns of poster cards)
- **Genre Browse** — Selected genre results grid + load more

### Secondary Section
- Search filters (genre, year, type — below search input)

### Cards
- Result cards: 2:3 poster + title + year + type + "in vault" indicator + add-to-vault button
- Genre pills: pill-shaped, accent-colored when active
- Recent search chips: pill-shaped, removable

### Actions
- Search input (debounced, 250ms)
- Recent search chip tap (re-run search)
- Genre pill tap (genre browse mode)
- Add to vault (from result card)
- Result card tap → Details Modal

### FAB
- None

### Bottom Area
- Bottom navigation
- ScrollToTop

### Empty State
- "No Results Found" — icon + query echo + suggestion

### Loading State
- SearchLoading — Rail-style poster skeleton blocks

### Scroll Behavior
- Vertical scroll through results
- Genre browse has infinite scroll
- Search input is not sticky (at top of page)

### Interaction Priority
1. Search input (primary action)
2. Result card tap (open details)
3. Add to vault (quick action)
4. Genre browse (discovery)
5. Recent searches (convenience)

---

## 9. Settings Blueprint

### Top Area
- Back link: "← Back to Profile"
- Page title: "Settings"
- Subtitle: "Your preferences, your rules"

### Primary Section
- **Account** — Profile row + Account row + Appearance row
- **Preferences** — Notifications row
- **Data** — Sync row
- **Advanced** — Developer row + Privacy row
- **Session** — Sign Out button

### Secondary Section
- None

### Cards
- Setting rows: icon + label + value/chevron
- Setting groups: section label + rows with 2px gaps

### Actions
- Row taps → navigate to sub-pages
- Sign Out → sign out + redirect to /discover

### FAB
- None

### Bottom Area
- Bottom navigation
- Sign Out at page bottom (danger zone separation)

### Empty State
- None (settings always has content)

### Loading State
- None (static content)

### Scroll Behavior
- Vertical scroll through setting groups
- No sticky elements below header

### Interaction Priority
1. Setting row taps (navigate to sub-pages)
2. Sign Out (destructive, at bottom)
3. Back link (return to profile)

---

## 10. Detail Modal Blueprint

### Top Area
- **Cinematic Hero** — Full-bleed backdrop + gradient overlay + floating poster + content cluster
- Close button (top-right, glass circle)
- Content cluster: eyebrow + title + subtitle + quick meta (year · type · runtime) + CTA

### Primary Section
- **Action Dock** — Floating glass dock with contextual actions (add to vault, rate, add to folder, share, remove)
- **Your Activity** — Status + user rating + date added + notes (if in vault)
- **Overview** — Synopsis text
- **Ratings** — IMDb / RT / Metacritic / User rating cluster

### Secondary Section
- **Cast** — Horizontal rail of cast member cards
- **Seasons** — Accordion-style season navigator with episode grid (TV only)
- **Similar Titles** — Horizontal rail of recommendation cards
- **Franchise Info** — Universe/franchise membership

### Cards
- Cast cards: photo + name + character
- Episode cards: still + number + title + runtime + watched indicator
- Similar title cards: 2:3 poster + title + year

### Actions
- Close modal (X button, backdrop tap, Escape key)
- Action dock buttons (add to vault, rate, add to folder, remove)
- Season accordion expand/collapse
- Episode card tap
- Similar title tap → new detail (replace current)
- Cast card tap (if linked)

### FAB
- None (Action Dock serves the FAB purpose)

### Bottom Area
- Modal scroll bottom padding
- No bottom navigation (modal overlays everything)

### Empty State
- Error state: icon + message + retry

### Loading State
- DetailsSkeleton matching hero + sections layout

### Scroll Behavior
- Vertical scroll within modal
- Hero content has parallax-like effect (poster and backdrop move at different rates)
- Action Dock may be sticky at bottom of hero

### Interaction Priority
1. Add to vault / status change (primary conversion)
2. Rate (self-expression)
3. Close modal (escape)
4. Similar titles navigation
5. Season/episode browsing
6. Add to folder (organization)

---

## 11. Achievements Blueprint

### Top Area
- Back link: "← Back to Profile"
- Page title: "Your Cinephile Journey"
- Subtitle: "No childish badges. No XP. No levels."
- Progress summary: "N of 16 unlocked"

### Primary Section
- **Achievement Grid** — 2-column grid of achievement cards
  - Unlocked: icon (accent glow) + title + description + progress bar
  - Locked: icon (dim) + title + description + progress bar

### Secondary Section
- None

### Cards
- Achievement cards: icon + title + description + N/M progress + percentage

### Actions
- Back link
- (No actions on individual cards — informational only)

### FAB
- None

### Bottom Area
- Bottom navigation

### Empty State
- None (always shows all 16 achievements, some locked)

### Loading State
- Grid of skeleton blocks

### Scroll Behavior
- Vertical scroll through 2-column grid

### Interaction Priority
1. View progress (informational)
2. Back link (navigation)

---

## 12. History Blueprint

### Top Area
- Back link: "← Back to Profile"
- Page title: "Your Journey"
- Search bar (filters history items)
- Status filter tabs: All / Watching / Completed / Planned / On Hold / Dropped

### Primary Section
- **Grouped Timeline** — Items grouped by time period
  - Today / Yesterday / This Week / This Month / This Year / Earlier
  - Each group: header with label + count + list of items

### Secondary Section
- None

### Cards
- History items: poster thumbnail + title + year + type + status badge + date

### Actions
- Search input
- Status filter tab selection
- History item tap → **currently broken** (empty onClick)
- Back link

### FAB
- None

### Bottom Area
- Bottom navigation

### Empty State
- "No History Yet" — icon + message + CTA

### Loading State
- None currently

### Scroll Behavior
- Vertical scroll through grouped timeline
- All items render at once (no pagination — **performance concern**)

### Interaction Priority
1. Search (find specific item)
2. Filter tabs (narrow by status)
3. Item tap (should open details — currently broken)
4. Back link

---

## 13. Notifications Blueprint

### Top Area
- Back link: "← Back to Settings"
- Page title: "Notifications"
- Subtitle: "Stay in the loop, your way"

### Primary Section
- **Notification Toggle List** — Rows of notification types with toggle switches
  - New Season Available
  - Continue Watching Reminder
  - Weekly Digest
  - Milestone Achieved
  - Collection Updated

### Secondary Section
- **Insight Card** — "How notifications work" explanation
  - "No emails, no spam, no followers"
  - "Only what you ask for"
  - "Always in your control"

### Cards
- Setting rows: icon + label + description + toggle switch

### Actions
- Toggle switches (currently `<div>` — **accessibility gap**)
- Back link

### FAB
- None

### Bottom Area
- Bottom navigation

### Empty State
- None (toggles always present)

### Loading State
- None (local state only)

### Scroll Behavior
- Short page, likely no scroll needed

### Interaction Priority
1. Toggle switches (configure notifications)
2. Back link

---

## 14. Sync Blueprint

### Top Area
- Back link: "← Back to Settings"
- Page title: "Data Center"
- Eyebrow: "Sync & Backup"
- Subtitle: "Your library is safe, portable, and yours."

### Primary Section (8 sections, priority-ordered)
1. **Cloud Status** — Last sync time + manual sync button
2. **Import** — Import from JSON (future: Letterboxd, Trakt)
3. **Backup & Restore** — Export + import backup files
4. **Devices** — Connected devices list
5. **Recent Activity** — Sync history timeline
6. **Storage** — Storage usage stats
7. **Privacy** — Data privacy info
8. **Danger Zone** — Reset library + delete account (red styling)

### Secondary Section
- Guest state: lock icon + "Sign in to sync" + Sign In button

### Cards
- CloudStatusCard, BackupCards, ImportHub, DevicesCard, SyncHistoryTimeline, StorageStats, PrivacyCard, DangerZoneCard

### Actions
- Manual sync
- Import from source
- Export backup
- Reset library (with confirmation sheet)
- Delete account
- Back link

### FAB
- None

### Bottom Area
- Bottom navigation
- Danger Zone at page bottom (separation from safe actions)

### Empty State
- Guest state replaces all content

### Loading State
- Per-section loading states (inconsistent)

### Scroll Behavior
- Vertical scroll through 8 sections
- All sections eagerly rendered (should lazy-load below-fold)

### Interaction Priority
1. Cloud sync (primary action)
2. Import data (migration)
3. Export backup (safety)
4. Back link
5. Danger zone actions (rare, destructive)

---

## Appendix: Universal Blueprint Elements

Every page shares these universal elements:

### Top Area (All Pages)
- App header: CINELOG wordmark + avatar pill (sticky, glass, z-30)
- Safe area: `env(safe-area-inset-top)` padding

### Bottom Area (All Pages)
- Bottom navigation: 4 tabs (Discover, Search, Watchlist, Collections) (fixed, opaque)
- Safe area: `env(safe-area-inset-bottom)` padding
- Content padding: `var(--nav-total-height)` minimum bottom padding

### Page Container (All Pages)
- `<PageContainer>` wrapper: consistent padding, max-width, centering, fade-in animation
- Renders as `<main>` element (semantic HTML)

### Loading State Pattern (All Pages)
- Skeleton matching content layout (not generic spinners)
- `aria-hidden="true"` on skeleton elements
- `aria-busy="true"` on content container during loading

### Error State Pattern (All Pages)
- Icon + message + retry button
- `role="alert"` on error container
- Route-level ErrorBoundary with rich fallback

### Empty State Pattern (All Pages)
- Icon tile (72px, accent glow) + title + message (max 280px) + action CTA
- `role="status"` + `aria-live="polite"`
- Descriptive copy explaining what will appear + how to fill it

### Scroll Behavior (All Pages)
- Vertical scroll for page content
- Horizontal scroll for rails/carousels with snap
- ScrollToTop for long pages
- LazyMount for below-fold sections (Discover pattern should be universal)
