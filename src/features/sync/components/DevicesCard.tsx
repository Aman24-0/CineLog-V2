// src/features/sync/components/DevicesCard.tsx
//
// DevicesCard — shows the current device + last active time.
//
// FUTURE: multiple devices, recent sessions, device rename, remote
// sign-out. The architecture supports these but they're not implemented
// yet — the card renders the current device only and a "coming soon"
// hint for multi-device features.

import { createMemo, type Component } from "solid-js";

const DevicesCard: Component = () => {

  const deviceName = createMemo(() => {
    if (typeof navigator === "undefined") return "This device";
    const ua = navigator.userAgent;
    if (/iphone|ipad|ipod/i.test(ua)) return "iPhone";
    if (/android/i.test(ua)) return "Android device";
    if (/mac/i.test(ua)) return "Mac";
    if (/win/i.test(ua)) return "Windows PC";
    if (/linux/i.test(ua)) return "Linux PC";
    return "This device";
  });

  const lastActive = createMemo(() => "Now");

  return (
    <div class="sync-devices-card">
      <div class="sync-devices-current">
        <div class="sync-devices-icon" aria-hidden="true">
          <span class="material-symbols-outlined" style={{ "font-size": "20px", color: "var(--p)" }} aria-hidden="true">devices</span>
        </div>
        <div class="sync-devices-text">
          <p class="sync-devices-name">{deviceName()}</p>
          <p class="sync-devices-meta">Last active {lastActive()}</p>
        </div>
        <span class="sync-devices-badge">This device</span>
      </div>
      <div class="sync-devices-future">
        <span class="material-symbols-outlined" style={{ "font-size": "14px", color: "var(--text-dim)" }} aria-hidden="true">lock_clock</span>
        <span>Multi-device management, remote sign-out, and session history are coming soon.</span>
      </div>
    </div>
  );
};

export default DevicesCard;
