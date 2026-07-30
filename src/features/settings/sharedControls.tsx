// src/features/settings/sharedControls.tsx
//
// Shared setting-row + segmented control + toggle renderers for the
// redesigned /settings/* sub-pages. Keeps every sub-page visually
// consistent and reduces duplication.

import { For, type JSX, type Component } from "solid-js";

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
