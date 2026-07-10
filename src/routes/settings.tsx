// src/routes/settings.tsx
import { clientOnly } from "@solidjs/start";
import { Title } from "@solidjs/meta";

const SettingsPage = clientOnly(() => import("~/features/settings/SettingsPage"));

export default function SettingsRoute() {
  return (
    <>
      <Title>CineLog — Settings</Title>
      <SettingsPage />
    </>
  );
}
