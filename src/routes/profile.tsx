// src/routes/profile.tsx
import { clientOnly } from "@solidjs/start";
import { Title } from "@solidjs/meta";

// clientOnly prevents SSR hydration mismatches — the Profile page
// depends on Supabase auth state and profile data that are only
// available on the client.
const ProfilePage = clientOnly(() => import("~/features/profile/ProfilePage"));

export default function ProfileRoute() {
  return (
    <>
      <Title>CineLog — Profile</Title>
      <ProfilePage />
    </>
  );
}
