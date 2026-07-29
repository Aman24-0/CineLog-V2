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
  return (
    <div class="profile-tabs-v3" role="tablist" aria-label="Profile sections">
      <For each={PROFILE_TABS}>
        {(tab) => (
          <button
            type="button"
            role="tab"
            aria-selected={props.activeTab === tab.id}
            class={`profile-tab-v3${props.activeTab === tab.id ? " is-active" : ""}`}
            onClick={() => props.onTabChange(tab.id)}
          >
            <span class="material-symbols-outlined profile-tab-v3-icon" aria-hidden="true">
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
