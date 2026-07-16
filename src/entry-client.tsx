import { mount, StartClient } from "@solidjs/start/client";
import { injectSpeedInsights } from "@vercel/speed-insights";

// Initialize Vercel Speed Insights for production Core Web Vitals
// collection. injectSpeedInsights() is a no-op in development and during
// SSR — it only activates on the deployed Vercel preview/production URL.
// This call must happen AFTER the app mounts so the SDK can hook into
// the correct navigation/route-change events.
injectSpeedInsights();

mount(() => <StartClient />, document.getElementById("app")!);
