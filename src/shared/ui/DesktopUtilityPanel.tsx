// src/shared/ui/DesktopUtilityPanel.tsx
import {
  Show,
  Switch,
  Match,
  createMemo,
  type Component
} from "solid-js";
import { useLocation } from "@solidjs/router";
import { useAuth } from "~/shared/hooks/useAuth";

/**
 * DesktopUtilityPanel — right contextual panel for desktop.
 *
 * Changes content based on the current page:
 *   - Discover → Trending, Recently viewed, Quick filters
 *   - Watchlist → Library stats, Filters summary, Continue Watching
 *   - Collections → Collection stats, Random Pick
 *   - Profile/Upcoming → Today's releases, Reminder summary
 *   - Settings → Quick links
 *   - Detail pages → Your rating, Status, Quick actions, Similar titles
 *
 * The panel is hidden on mobile/tablet and only visible on desktop >= 1024px.
 * It's rendered by AppShell and managed via CSS visibility.
 */
const DesktopUtilityPanel: Component = () => {
  const location = useLocation();
  const { isSignedIn } = useAuth();

  const pageContext = createMemo(() => {
    const p = location.pathname;
    if (p === "/discover" || p === "/search") return "discover";
    if (p === "/watchlist") return "watchlist";
    if (p.startsWith("/collections")) return "collections";
    if (p === "/profile/upcoming") return "upcoming";
    if (p.startsWith("/profile")) return "profile";
    if (p.startsWith("/settings")) return "settings";
    if (p.startsWith("/movie/") || p.startsWith("/tv/") || p.startsWith("/details/")) return "details";
    return "default";
  });

  return (
    <aside
      class="desktop-utility-panel"
      role="complementary"
      aria-label="Contextual information"
    >
      <Switch>
        {/* Discover context */}
        <Match when={pageContext() === "discover"}>
          <div class="desktop-utility-panel__section">
            <h3 class="desktop-utility-panel__heading">
              <span class="material-symbols-outlined" aria-hidden="true">trending_up</span>
              Trending
            </h3>
            <p class="desktop-utility-panel__text type-body-soft">
              Your trending picks appear here based on watch activity.
            </p>
          </div>
          <div class="desktop-utility-panel__section">
            <h3 class="desktop-utility-panel__heading">
              <span class="material-symbols-outlined" aria-hidden="true">filter_list</span>
              Quick Filters
            </h3>
            <p class="desktop-utility-panel__text type-body-soft">
              Use the Genre Explorer on the main page to filter by genre, year, or rating.
            </p>
          </div>
        </Match>

        {/* Watchlist context */}
        <Match when={pageContext() === "watchlist"}>
          <div class="desktop-utility-panel__section">
            <h3 class="desktop-utility-panel__heading">
              <span class="material-symbols-outlined" aria-hidden="true">library_books</span>
              Library
            </h3>
            <p class="desktop-utility-panel__text type-body-soft">
              Your vault stats and filters appear here. Use the filters on the main page to refine your library.
            </p>
          </div>
          <div class="desktop-utility-panel__section">
            <h3 class="desktop-utility-panel__heading">
              <span class="material-symbols-outlined" aria-hidden="true">shuffle</span>
              Random Pick
            </h3>
            <p class="desktop-utility-panel__text type-body-soft">
              Can't decide? Hit Shuffle on the main page for a surprise pick from your vault.
            </p>
          </div>
        </Match>

        {/* Collections context */}
        <Match when={pageContext() === "collections"}>
          <div class="desktop-utility-panel__section">
            <h3 class="desktop-utility-panel__heading">
              <span class="material-symbols-outlined" aria-hidden="true">folder</span>
              Collections
            </h3>
            <p class="desktop-utility-panel__text type-body-soft">
              Organize your titles into folders. Create new collections from the main page.
            </p>
          </div>
        </Match>

        {/* Upcoming context */}
        <Match when={pageContext() === "upcoming"}>
          <div class="desktop-utility-panel__section">
            <h3 class="desktop-utility-panel__heading">
              <span class="material-symbols-outlined" aria-hidden="true">calendar_today</span>
              Calendar
            </h3>
            <p class="desktop-utility-panel__text type-body-soft">
              Today's releases and upcoming episodes appear here. Set reminders to never miss a release.
            </p>
          </div>
        </Match>

        {/* Profile context */}
        <Match when={pageContext() === "profile"}>
          <div class="desktop-utility-panel__section">
            <h3 class="desktop-utility-panel__heading">
              <span class="material-symbols-outlined" aria-hidden="true">person</span>
              Profile
            </h3>
            <p class="desktop-utility-panel__text type-body-soft">
              Your cinematic identity — stats, achievements, and watch history.
            </p>
          </div>
        </Match>

        {/* Settings context */}
        <Match when={pageContext() === "settings"}>
          <div class="desktop-utility-panel__section">
            <h3 class="desktop-utility-panel__heading">
              <span class="material-symbols-outlined" aria-hidden="true">settings</span>
              Settings
            </h3>
            <p class="desktop-utility-panel__text type-body-soft">
              Configure your CineLog experience. Changes are saved automatically.
            </p>
          </div>
        </Match>

        {/* Detail page context */}
        <Match when={pageContext() === "details"}>
          <div class="desktop-utility-panel__section">
            <h3 class="desktop-utility-panel__heading">
              <span class="material-symbols-outlined" aria-hidden="true">info</span>
              Quick Actions
            </h3>
            <p class="desktop-utility-panel__text type-body-soft">
              Rate, track, and manage this title from the main content area.
            </p>
          </div>
        </Match>

        {/* Default context */}
        <Match when={true}>
          <div class="desktop-utility-panel__section">
            <h3 class="desktop-utility-panel__heading">
              <span class="material-symbols-outlined" aria-hidden="true">auto_awesome</span>
              CineLog
            </h3>
            <p class="desktop-utility-panel__text type-body-soft">
              Your premium movie, TV, and anime tracker.
            </p>
          </div>
        </Match>
      </Switch>
    </aside>
  );
};

export default DesktopUtilityPanel;
