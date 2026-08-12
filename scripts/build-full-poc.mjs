// Build the full POC
import { build } from "esbuild";

await build({
  entryPoints: ["scripts/test-full-poc.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile: "/tmp/full-poc.mjs",
  alias: { "~": "./src" },
  external: ["@supabase/supabase-js", "@supabase/ssr"],
  logLevel: "info"
});
console.log("built /tmp/full-poc.mjs");
