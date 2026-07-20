// src/core/preferences/hideRatingsScreenshots.ts
// Hide Ratings in Screenshots
// When on, listen for `visibilitychange` to a hidden state (likely
// screenshot / app switcher) and add a CSS class that blurs ratings.

import { createSignal, createEffect } from "solid-js";
import { isServer } from "solid-js/web";
import { readStored, writeStored, applyDataAttr } from "./_storage";

const HIDE_RATINGS_KEY = "cinelog_hide_ratings_screenshots";

const storedHR = readStored<string>(HIDE_RATINGS_KEY, "false");

export const [hideRatingsInScreenshots, setHideRatingsInScreenshots] = createSignal<boolean>(
  storedHR === "true"
);

createEffect(() => {
  const v = hideRatingsInScreenshots();
  writeStored(HIDE_RATINGS_KEY, String(v));
  applyDataAttr("data-hide-ratings-ss", String(v));
});

// Install the visibility listener once on the client.
if (!isServer && typeof window !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && hideRatingsInScreenshots()) {
      document.documentElement.setAttribute("data-ss-hidden", "true");
    } else {
      document.documentElement.removeAttribute("data-ss-hidden");
    }
  });
}
