// src/features/settings/sharedControls.tsx
//
// Shared setting-row + segmented control + toggle renderers for the
// redesigned /settings/* sub-pages. Keeps every sub-page visually
// consistent and reduces duplication.

import { For, Show, createSignal, type JSX, type Component } from "solid-js";

interface SegmentedOption<T> {
  id: T;
  label: string;
  short?: string;
}

/**
 * Segmented control — a row of mutually-exclusive buttons.
 * Pass `current()` to read, `onChange(id)` to write.
 */
export function Segmented<T extends string | number>(props: {
  options: SegmentedOption<T>[];
  current: () => T;
  onChange: (id: T) => void;
  name: string;
}): JSX.Element {
  return (
    <div class="segmented" role="radiogroup" aria-label={props.name}>
      <For each={props.options}>
        {(opt) => (
          <button
            type="button"
            class="segmented-btn focus-ring"
            data-active={props.current() === opt.id}
            role="radio"
            aria-checked={props.current() === opt.id}
            onClick={() => props.onChange(opt.id)}
          >
            <span class="segmented-label-long">{opt.label}</span>
            {opt.short && (
              <span class="segmented-label-short">{opt.short}</span>
            )}
          </button>
        )}
      </For>
    </div>
  );
}

/**
 * Setting row with an inline control on the right (segmented, picker, etc.).
 */
export const ControlRow: Component<{
  icon: string;
  label: string;
  desc: string;
  children: JSX.Element;
}> = (props) => (
  <div class="setting-row-control">
    <div class="setting-row-control-header">
      <div class="setting-row-icon" aria-hidden="true">
        <span
          class="material-symbols-outlined"
          style={{ "font-size": "16px" }}
          aria-hidden="true"
        >
          {props.icon}
        </span>
      </div>
      <div class="setting-row-control-meta">
        <span class="setting-row-control-label">{props.label}</span>
        <span class="setting-row-control-desc">{props.desc}</span>
      </div>
    </div>
    {props.children}
  </div>
);

/**
 * Toggle switch (binary on/off). Keyboard-accessible via tabindex + keydown.
 */
export const Toggle: Component<{
  current: () => boolean;
  onChange: (v: boolean) => void;
  label: string;
}> = (props) => (
  <div
    class="toggle"
    data-on={props.current()}
    role="switch"
    aria-checked={props.current()}
    aria-label={props.label}
    onClick={() => props.onChange(!props.current())}
    onKeyDown={(e) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        props.onChange(!props.current());
      }
    }}
    tabindex={0}
  >
    <div class="toggle-knob" />
  </div>
);

/**
 * Inline toggle row — a setting row with a toggle on the right (no chevron).
 */
export const ToggleRow: Component<{
  icon: string;
  label: string;
  desc: string;
  current: () => boolean;
  onChange: (v: boolean) => void;
}> = (props) => (
  <div class="setting-row-control">
    <div class="setting-row-control-header">
      <div class="setting-row-icon" aria-hidden="true">
        <span
          class="material-symbols-outlined"
          style={{ "font-size": "16px" }}
          aria-hidden="true"
        >
          {props.icon}
        </span>
      </div>
      <div class="setting-row-control-meta">
        <span class="setting-row-control-label">{props.label}</span>
        <span class="setting-row-control-desc">{props.desc}</span>
      </div>
      <Toggle
        current={props.current}
        onChange={props.onChange}
        label={props.label}
      />
    </div>
  </div>
);

/**
 * Native select dropdown styled to match the design system.
 */
export const SelectRow: Component<{
  icon: string;
  label: string;
  desc: string;
  value: () => string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}> = (props) => (
  <div class="setting-row-control">
    <div class="setting-row-control-header">
      <div class="setting-row-icon" aria-hidden="true">
        <span
          class="material-symbols-outlined"
          style={{ "font-size": "16px" }}
          aria-hidden="true"
        >
          {props.icon}
        </span>
      </div>
      <div class="setting-row-control-meta">
        <span class="setting-row-control-label">{props.label}</span>
        <span class="setting-row-control-desc">{props.desc}</span>
      </div>
      <select
        class="settings-select"
        value={props.value()}
        onChange={(e) => props.onChange(e.currentTarget.value)}
        aria-label={props.label}
      >
        <For each={props.options}>
          {(opt) => <option value={opt.value}>{opt.label}</option>}
        </For>
      </select>
    </div>
  </div>
);

/**
 * Time input row — for "weekly digest time" / "quiet hours start/end".
 * Uses native <input type="time">.
 */
export const TimeRow: Component<{
  icon: string;
  label: string;
  desc: string;
  value: () => string;
  onChange: (v: string) => void;
}> = (props) => (
  <div class="setting-row-control">
    <div class="setting-row-control-header">
      <div class="setting-row-icon" aria-hidden="true">
        <span
          class="material-symbols-outlined"
          style={{ "font-size": "16px" }}
          aria-hidden="true"
        >
          {props.icon}
        </span>
      </div>
      <div class="setting-row-control-meta">
        <span class="setting-row-control-label">{props.label}</span>
        <span class="setting-row-control-desc">{props.desc}</span>
      </div>
      <input
        type="time"
        class="settings-time-input"
        value={props.value()}
        onChange={(e) => props.onChange(e.currentTarget.value)}
        aria-label={props.label}
      />
    </div>
  </div>
);

/**
 * CitySearchRow — a setting row with a searchable text input for
 * selecting a city. The user types a city name and sees matching
 * cities from the provided list. They can also enter a custom city
 * name not in the list.
 *
 * Behaves like BookMyShow's city search: type-ahead filter, no
 * state/province prerequisite. The filtered results appear in a
 * dropdown below the input; clicking a result saves it. Pressing
 * Enter saves the typed text as a custom city.
 */
export const CitySearchRow: Component<{
  icon: string;
  label: string;
  desc: string;
  value: () => string;
  onChange: (v: string) => void;
  cities: string[];
}> = (props) => {
  const [searchQuery, setSearchQuery] = createSignal("");
  const [showResults, setShowResults] = createSignal(false);

  const filteredCities = () => {
    const q = searchQuery().trim().toLowerCase();
    if (!q) return props.cities.slice(0, 20);
    return props.cities
      .filter((c) => c.toLowerCase().includes(q))
      .slice(0, 20);
  };

  const handleSelect = (city: string) => {
    setSearchQuery("");
    setShowResults(false);
    props.onChange(city);
  };

  const handleInput = (e: { currentTarget: { value: string } }) => {
    setSearchQuery(e.currentTarget.value);
    setShowResults(true);
  };

  const handleBlur = () => {
    // Delay to allow click events on dropdown items to fire first.
    setTimeout(() => setShowResults(false), 200);
    // If the user typed a custom city name (not in the list), save it
    // on blur. If they cleared the input, save empty.
    const typed = searchQuery().trim();
    if (typed && typed !== props.value()) {
      props.onChange(typed);
    }
  };

  return (
    <div class="setting-row-control" style={{ position: "relative" }}>
      <div class="setting-row-control-header">
        <div class="setting-row-icon" aria-hidden="true">
          <span
            class="material-symbols-outlined"
            style={{ "font-size": "16px" }}
            aria-hidden="true"
          >
            {props.icon}
          </span>
        </div>
        <div class="setting-row-control-meta">
          <span class="setting-row-control-label">{props.label}</span>
          <span class="setting-row-control-desc">{props.desc}</span>
        </div>
        <input
          type="text"
          class="settings-select"
          value={searchQuery() || props.value()}
          onInput={handleInput}
          onBlur={handleBlur}
          onFocus={() => {
            setShowResults(true);
            setSearchQuery("");
          }}
          placeholder="Search city…"
          aria-label={props.label}
          style={{ "min-width": "8rem" }}
        />
      </div>
      <Show when={showResults() && filteredCities().length > 0}>
        <div
          class="city-search-dropdown"
          style={{
            position: "absolute",
            top: "100%",
            right: "0",
            "z-index": "50",
            "max-height": "12rem",
            "overflow-y": "auto",
            "min-width": "10rem",
            "background": "var(--glass-bg-strong)",
            "border": "1px solid var(--hairline-2)",
            "border-radius": "0.5rem",
            "box-shadow": "0 4px 12px rgba(0,0,0,0.3)",
            "backdrop-filter": "blur(8px)"
          }}
        >
          <For each={filteredCities()}>
            {(city) => (
              <button
                type="button"
                class="city-search-option"
                onClick={() => handleSelect(city)}
                style={{
                  display: "block",
                  width: "100%",
                  "text-align": "left",
                  padding: "0.5rem 0.75rem",
                  background: "transparent",
                  border: "none",
                  color: "var(--text-strong)",
                  cursor: "pointer",
                  "font-size": "0.8125rem"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--glass-bg)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                {city}
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};
