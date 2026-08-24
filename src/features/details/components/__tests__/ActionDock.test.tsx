import { render, fireEvent } from "@solidjs/testing-library";
import { describe, expect, it, vi } from "vitest";
import ActionDock from "../ActionDock";
import type { WatchlistItem } from "~/shared/types";

const item: WatchlistItem = {
  id: "101",
  media_type: "movie",
  title: "House of the Dragon",
  status: "Watching"
};

function renderDock(overrides: Partial<Parameters<typeof ActionDock>[0]> = {}) {
  return render(() => (
    <ActionDock
      item={item}
      vaultItem={item}
      onEdit={vi.fn()}
      onStatusCycle={vi.fn()}
      onSetStatus={vi.fn()}
      onAddToVault={vi.fn()}
      onOpenFolders={vi.fn()}
      onRemove={vi.fn()}
      onShare={vi.fn()}
      {...overrides}
    />
  ));
}

describe("ActionDock", () => {
  it("keeps all four direct vault statuses and calls the selected status handler", () => {
    const onSetStatus = vi.fn();
    const { getByRole } = renderDock({ onSetStatus });

    for (const label of ["Planned", "Watching", "Completed", "Dropped"]) {
      expect(getByRole("button", { name: new RegExp(label) })).toBeTruthy();
    }

    expect(
      getByRole("button", { name: /Watching/ }).getAttribute("aria-pressed")
    ).toBe("true");
    fireEvent.click(getByRole("button", { name: /Completed/ }));
    expect(onSetStatus).toHaveBeenCalledWith("Completed");
  });

  it("preserves Folder, Share, Edit, and Delete actions for vault titles", () => {
    const onOpenFolders = vi.fn();
    const onShare = vi.fn();
    const onEdit = vi.fn();
    const onRemove = vi.fn();
    const { getByRole } = renderDock({
      onOpenFolders,
      onShare,
      onEdit,
      onRemove
    });

    fireEvent.click(getByRole("button", { name: /Folder/ }));
    fireEvent.click(getByRole("button", { name: /Share/ }));
    fireEvent.click(getByRole("button", { name: /Edit/ }));
    fireEvent.click(getByRole("button", { name: /Delete/ }));

    expect(onOpenFolders).toHaveBeenCalledTimes(1);
    expect(onShare).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(
      getByRole("button", { name: /Delete/ }).classList.contains(
        "action-dock-btn-danger"
      )
    ).toBe(true);
  });

  it("keeps the non-vault Add to Watchlist and Share actions", () => {
    const onAddToVault = vi.fn();
    const onShare = vi.fn();
    const { getByRole, queryByRole } = renderDock({
      vaultItem: null,
      onAddToVault,
      onShare
    });

    fireEvent.click(getByRole("button", { name: /Add to Watchlist/ }));
    fireEvent.click(getByRole("button", { name: /Share/ }));

    expect(onAddToVault).toHaveBeenCalledTimes(1);
    expect(onShare).toHaveBeenCalledTimes(1);
    expect(queryByRole("button", { name: /Planned/ })).toBeNull();
  });
});
