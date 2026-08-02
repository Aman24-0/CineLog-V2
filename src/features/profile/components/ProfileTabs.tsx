// src/features/profile/components/ProfileTabs.tsx
//
// ProfileTabs — the underline-style tab strip for the Profile page.
//
// Four tabs: Activity · Favorites · Lists · Achievements. The
// underline variant matches the spec ("Underline style; active state").
// The active tab is controlled by the parent via `activeTab` +
// `onTabChange` — the parent owns the state so it can persist it
// across page refreshes via the useProfileTabs hook.

import { For, type Component } from "solid-js";
import { PROFILE_TABS, type ProfileTab } from "../hooks/useProfileTabs";

export interface ProfileTabsProps {
  activeTab: ProfileTab;
  onTabChange: (tab: ProfileTab) => void;
}

const ProfileTabs: Component<ProfileTabsProps> = (props) => {
  /**
   * Arrow-key navigation for the roving-tabindex tabs pattern.
   * See GlassTabs.onKeyDown for the full pattern explanation.
   * Auto-activates the tab the user arrows to (matches click behavior).
   */
  const onKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    const container = e.currentTarget as HTMLElement;
    if (!target || target.getAttribute("role") !== "tab") return;

    const tabs = Array.from(
      container.querySelectorAll<HTMLButtonElement>('button[role="tab"]')
    );
    if (tabs.length === 0) return;
    const currentIndex = tabs.indexOf(target as HTMLButtonElement);

    let nextIndex: number | null = null;
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        nextIndex = currentIndex < tabs.length - 1 ? currentIndex + 1 : 0;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        nextIndex = currentIndex > 0 ? currentIndex - 1 : tabs.length - 1;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = tabs.length - 1;
        break;
      default:
        return;
    }
    if (nextIndex === null) return;
    e.preventDefault();
    const nextTab = tabs[nextIndex];
    nextTab.focus();
    const nextValue = nextTab.dataset.value as ProfileTab | undefined;
    if (nextValue !== undefined) props.onTabChange(nextValue);
  };

  return (
    <div
      class="profile-tabs-v3"
      role="tablist"
      aria-label="Profile sections"
      onKeyDown={onKeyDown}
    >
      <For each={PROFILE_TABS}>
        {(tab) => (
          <button
            type="button"
            role="tab"
            aria-selected={props.activeTab === tab.id}
            // Roving tabindex: only the active tab is in the tab order.
            tabindex={props.activeTab === tab.id ? 0 : -1}
            // aria-controls points at the tab panel id so AT users can
            // jump directly to the panel content from the tab.
            aria-controls="profile-tab-panel"
            id={`profile-tab-${tab.id}`}
            data-value={tab.id}
            class={`profile-tab-v3${props.activeTab === tab.id ? " is-active" : ""}`}
            onClick={() => props.onTabChange(tab.id)}
          >
            <span
              class="material-symbols-outlined profile-tab-v3-icon"
              aria-hidden="true"
            >
              {tab.icon}
            </span>
            <span class="profile-tab-v3-label">{tab.label}</span>
          </button>
        )}
      </For>
    </div>
  );
};

export default ProfileTabs;
