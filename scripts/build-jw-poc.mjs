// Build the JustWatch-only POC
import { build } from "esbuild";

await build({
  entryPoints: ["scripts/test-justwatch-poc.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile: "/tmp/jw-poc.mjs",
  alias: { "~": "./src" },
  external: ["@supabase/supabase-js", "@supabase/ssr"],
  logLevel: "info"
});
console.log("built /tmp/jw-poc.mjs");
