// scripts/migrate_data_url_banners.ts
//
// CineLog V2 — One-time script to migrate data-URL banners to Storage
// ---------------------------------------------------------------------
// Before the banners Storage bucket was created (migration
// 20260805_create_banners_bucket.sql), banner uploads fell back to
// storing a ~180KB base64 data URL in profiles.banner_url. This caused:
//   • Slow profile page loads (the browser has to decode 180KB of
//     base64 + render it as a background image, freezing the main thread).
//   • Bloated profiles table rows.
//
// This script finds all profiles with a data: URL banner, decodes the
// blob, uploads it to the `banners` Storage bucket at `<uid>/banner.jpg`,
// and updates profiles.banner_url to the Storage public URL.
//
// Run with: npx tsx scripts/migrate_data_url_banners.ts
//
// Idempotent: if a profile's banner_url is already a Storage URL
// (starts with "http"), it's skipped.

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://vyckwoivdmlvbvsufuus.supabase.co";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error(
    "ERROR: Set SUPABASE_SERVICE_ROLE_KEY env var first.\n" +
      "You can find it in your Supabase project settings → API → service_role key."
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

interface ProfileRow {
  id: string;
  username: string | null;
  banner_url: string | null;
  avatar_url: string | null;
}

async function migrateDataUrlToStorage(
  profile: ProfileRow,
  column: "banner_url" | "avatar_url",
  bucket: "banners" | "avatars"
): Promise<boolean> {
  const dataUrl = profile[column];
  if (!dataUrl || !dataUrl.startsWith("data:")) return false;

  // Parse the data URL: data:<mime>;base64,<payload>
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    console.warn(
      `  [skip] ${profile.username}: malformed data URL in ${column}`
    );
    return false;
  }
  const [, mime, base64] = match;
  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  const filePath = `${profile.id}/${column === "banner_url" ? "banner" : "avatar"}.${ext}`;

  // Decode base64 → Blob
  const buffer = Buffer.from(base64, "base64");
  const blob = new Blob([buffer], { type: mime });

  // Upload to Storage
  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(filePath, blob, { contentType: mime, upsert: true });

  if (uploadError) {
    console.error(
      `  [error] ${profile.username}: upload failed for ${column}:`,
      uploadError.message
    );
    return false;
  }

  // Get the public URL
  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(filePath);
  const publicUrl = urlData.publicUrl;

  // Update the profile row
  const { error: updateError } = await supabase
    .from("profiles")
    .update({ [column]: publicUrl })
    .eq("id", profile.id);

  if (updateError) {
    console.error(
      `  [error] ${profile.username}: profile update failed for ${column}:`,
      updateError.message
    );
    return false;
  }

  console.log(
    `  [ok] ${profile.username}: ${column} migrated (${Math.round(buffer.length / 1024)}KB → ${publicUrl})`
  );
  return true;
}

async function main() {
  console.log("CineLog — data-URL banner/avatar migration");
  console.log("============================================");
  console.log(`Supabase: ${SUPABASE_URL}`);
  console.log("");

  // Fetch ALL profiles (we filter client-side because Supabase's .or()
  // with .like() on data: URLs has quoting issues).
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, username, banner_url, avatar_url");

  if (error) {
    console.error("Failed to fetch profiles:", error.message);
    process.exit(1);
  }

  if (!profiles || profiles.length === 0) {
    console.log("No profiles found.");
    return;
  }

  // Filter to only rows with data: URLs.
  const withDataUrls = (profiles as ProfileRow[]).filter(
    (p) =>
      (p.banner_url && p.banner_url.startsWith("data:")) ||
      (p.avatar_url && p.avatar_url.startsWith("data:"))
  );

  if (withDataUrls.length === 0) {
    console.log("No profiles with data: URLs found. Nothing to migrate.");
    return;
  }

  console.log(`Found ${withDataUrls.length} profile(s) with data: URLs.`);
  console.log("");

  let bannerMigrated = 0;
  let avatarMigrated = 0;

  for (const profile of withDataUrls) {
    console.log(`Processing: ${profile.username ?? profile.id}`);
    if (profile.banner_url?.startsWith("data:")) {
      if (await migrateDataUrlToStorage(profile, "banner_url", "banners")) {
        bannerMigrated++;
      }
    }
    if (profile.avatar_url?.startsWith("data:")) {
      if (await migrateDataUrlToStorage(profile, "avatar_url", "avatars")) {
        avatarMigrated++;
      }
    }
  }

  console.log("");
  console.log("Migration complete.");
  console.log(`  Banners migrated: ${bannerMigrated}`);
  console.log(`  Avatars migrated: ${avatarMigrated}`);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
