import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@solidjs/router", () => ({
  useNavigate: () => vi.fn()
}));

vi.mock("~/shared/hooks/useAuth", () => ({
  useAuth: () => ({
    isSignedIn: () => true,
    user: null
  })
}));

vi.mock("~/shared/hooks/useAuthModal", () => ({
  useAuthModal: () => ({
    openAuthModal: vi.fn()
  })
}));

vi.mock("~/features/upcoming/hooks/useNotifications", () => ({
  useNotifications: () => ({
    unreadCount: () => 0,
    notifications: [],
    markRead: vi.fn(),
    markAllRead: vi.fn(),
    clearRead: vi.fn(),
    snooze: vi.fn(),
    dismiss: vi.fn()
  })
}));

vi.mock("~/features/upcoming/components/HeaderNotificationBell", () => ({
  default: (props: { onClick: () => void }) => (
    <button type="button" aria-label="Notifications" onClick={props.onClick}>
      Notifications
    </button>
  )
}));

vi.mock("~/features/upcoming/components/NotificationCenter", () => ({
  default: () => null
}));

vi.mock("~/shared/ui/glass", () => ({
  GlassIconButton: (props: { label: string; onClick?: () => void }) => (
    <button type="button" aria-label={props.label} onClick={props.onClick}>
      {props.label}
    </button>
  )
}));

const { default: AppHeader } = await import("../AppHeader");

describe("AppHeader", () => {
  afterEach(cleanup);

  it("keeps the Discover header and notification control without a search affordance", () => {
    render(() => <AppHeader />);

    expect(screen.getByRole("banner")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Notifications" })).toBeTruthy();
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Search" })).toBeNull();
  });
});
