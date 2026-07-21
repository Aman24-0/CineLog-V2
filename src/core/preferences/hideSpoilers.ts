// src/core/preferences/hideSpoilers.ts
// Hide Spoilers — boolean toggle
// When on, elements with [data-spoiler] blur until tapped.

import { createSignal, createEffect } from "solid-js";
import { readStored, writeStored, applyDataAttr } from "./_storage";

const HIDE_SPOILERS_KEY = "cinelog_hide_spoilers";

const storedHide = readStored<string>(HIDE_SPOILERS_KEY, "false");

export const [hideSpoilers, setHideSpoilers] = createSignal<boolean>(
  storedHide === "true"
);

createEffect(() => {
  const v = hideSpoilers();
  writeStored(HIDE_SPOILERS_KEY, String(v));
  applyDataAttr("data-hide-spoilers", String(v));
});
