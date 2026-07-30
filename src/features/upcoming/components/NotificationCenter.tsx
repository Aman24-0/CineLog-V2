// src/features/upcoming/components/NotificationCenter.tsx
//
// NotificationCenter — a sheet/modal showing the user's notification feed.
// Notifications are grouped by relative date bucket (Today / Yesterday /
// This Week / Earlier). Each notification shows an icon (varied by type),
// title, message, and relative timestamp. The user can:
//   • Tap a notification → mark as read + open the related title.
//   • "Mark all as read" button at the top.
//   • "Clear read" button at the bottom (deletes read notifications).

import { type Component, For, Show, createMemo, type Accessor } from "solid-js";
import { GlassModal } from "~/shared/ui/glass";
import { useToast } from "~/shared/hooks/useToast";
import type { NotificationRow } from "~/lib/supabase/repositories/upcoming";

interface NotificationCenterProps {
  open: boolean;
  onClose: () => void;
  notifications: Accessor<NotificationRow[]>;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onClearRead: () => void;
  onOpenTitle?: (relatedId: string, relatedType: string | null) => void;
}

type BucketKey = "today" | "yesterday" | "this_week" | "earlier";

const BUCKET_LABELS: Record<BucketKey, string> = {
  today: "Today",
  yesterday: "Yesterday",
  this_week: "This Week",
  earlier: "Earlier"
};

const TYPE_ICON: Record<NotificationRow["type"], string> = {
  reminder: "notifications_active",
  watchlist_added: "add_circle",
  season_available: "new_releases",
  info: "info"
};

function bucketFor(iso: string): BucketKey {
  const d = new Date(iso);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const todayMs = now.getTime();
  const dMs = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayMs = 86400000;
  if (dMs === todayMs) return "today";
  if (dMs === todayMs - dayMs) return "yesterday";
  if (dMs >= todayMs - 6 * dayMs) return "this_week";
  return "earlier";
}

function relativeTime(iso: string): string {
  const d = new Date(iso).getTime();
  const now = Date.now();
  const diff = now - d;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(iso).toLocaleDateString();
}

const NotificationCenter: Component<NotificationCenterProps> = (props) => {
  const toast = useToast();

  const grouped = createMemo<
    { key: BucketKey; label: string; items: NotificationRow[] }[]
  >(() => {
    const buckets: Record<BucketKey, NotificationRow[]> = {
      today: [],
      yesterday: [],
      this_week: [],
      earlier: []
    };
    for (const n of props.notifications()) {
      buckets[bucketFor(n.created_at)].push(n);
    }
    return (Object.keys(buckets) as BucketKey[])
      .map((k) => ({ key: k, label: BUCKET_LABELS[k], items: buckets[k] }))
      .filter((g) => g.items.length > 0);
  });

  const hasUnread = createMemo(() =>
    props.notifications().some((n) => !n.is_read)
  );

  const handleClick = (n: NotificationRow) => {
    if (!n.is_read) props.onMarkRead(n.id);
    if (n.related_title_id) {
      props.onOpenTitle?.(n.related_title_id, n.related_title_type);
    }
    props.onClose();
  };

  const handleMarkAll = async () => {
    await props.onMarkAllRead();
    toast.showToast("All notifications marked as read", "success");
  };

  const handleClearRead = async () => {
    await props.onClearRead();
    toast.showToast("Read notifications cleared", "info");
  };

  return (
    <GlassModal
      open={props.open}
      onClose={props.onClose}
      size="md"
      title="Notifications"
      icon="notifications"
      headerRight={
        <Show when={hasUnread()}>
          <button
            type="button"
            class="upcoming-notif-mark-all focus-ring"
            onClick={handleMarkAll}
          >
            Mark all read
          </button>
        </Show>
      }
    >
      <Show
        when={props.notifications().length > 0}
        fallback={
          <div class="upcoming-notif-empty">
            <span
              class="material-symbols-outlined"
              style={{ "font-size": "40px", color: "var(--text-dim)" }}
              aria-hidden="true"
            >
              notifications_off
            </span>
            <p>No notifications yet.</p>
            <p class="upcoming-notif-empty-hint">
              Tap the bell icon on any upcoming title to set a release-day
              reminder.
            </p>
          </div>
        }
      >
        <div class="upcoming-notif-list">
          <For each={grouped()}>
            {(group) => (
              <div class="upcoming-notif-group">
                <h4 class="upcoming-notif-group-label">{group.label}</h4>
                <For each={group.items}>
                  {(n) => (
                    <button
                      type="button"
                      class={`upcoming-notif-item ${n.is_read ? "is-read" : "is-unread"}`}
                      onClick={() => handleClick(n)}
                    >
                      <span class="upcoming-notif-icon-wrap">
                        <span
                          class="material-symbols-outlined upcoming-notif-icon"
                          aria-hidden="true"
                        >
                          {TYPE_ICON[n.type]}
                        </span>
                        <Show when={!n.is_read}>
                          <span
                            class="upcoming-notif-unread-dot"
                            aria-hidden="true"
                          />
                        </Show>
                      </span>
                      <span class="upcoming-notif-content">
                        <span class="upcoming-notif-title">{n.title}</span>
                        <Show when={n.message}>
                          <span class="upcoming-notif-message">
                            {n.message}
                          </span>
                        </Show>
                        <span class="upcoming-notif-time">
                          {relativeTime(n.created_at)}
                        </span>
                      </span>
                    </button>
                  )}
                </For>
              </div>
            )}
          </For>
        </div>
        <div class="upcoming-notif-footer">
          <button
            type="button"
            class="btn-ghost focus-ring"
            onClick={handleClearRead}
          >
            Clear read
          </button>
        </div>
      </Show>
    </GlassModal>
  );
};

export default NotificationCenter;
