import { afterEach, describe, expect, it, vi } from "vitest";
import { createSignal } from "solid-js";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@solidjs/testing-library";
import BannerEditor from "../BannerEditor";

const { compressBannerImageMock, uploadBannerMock, getAuthHeadersMock } =
  vi.hoisted(() => ({
    compressBannerImageMock: vi.fn(),
    uploadBannerMock: vi.fn(),
    getAuthHeadersMock: vi.fn()
  }));

vi.mock("~/shared/utils/imageCompress", () => ({
  compressBannerImage: compressBannerImageMock,
  uploadBannerToSupabase: uploadBannerMock
}));
vi.mock("~/lib/supabase/session", () => ({
  getAuthHeaders: getAuthHeadersMock
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function renderEditor() {
  return render(() => (
    <BannerEditor
      open={true}
      currentBannerType="favorite_movie"
      currentBannerUrl={null}
      data={null}
      userId="user-1"
      onClose={vi.fn()}
      onSave={vi.fn().mockResolvedValue(true)}
    />
  ));
}

describe("BannerEditor progress and failure feedback", () => {
  it("shows URL fetching state and closes only after the profile apply succeeds", async () => {
    let resolveFetch!: (value: unknown) => void;
    const pendingFetch = new Promise((resolve) => {
      resolveFetch = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() => pendingFetch)
    );
    getAuthHeadersMock.mockResolvedValue({});

    const onSave = vi.fn().mockResolvedValue(true);
    const onClose = vi.fn();
    render(() => (
      <BannerEditor
        open={true}
        currentBannerType="favorite_movie"
        currentBannerUrl={null}
        data={null}
        userId="user-1"
        onClose={onClose}
        onSave={onSave}
      />
    ));

    fireEvent.click(screen.getByRole("button", { name: "Image URL" }));
    fireEvent.input(screen.getByLabelText("Banner image URL"), {
      target: { value: "https://images.example.com/banner.jpg" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Banner" }));

    expect(screen.getByRole("status").textContent).toContain("Fetching image");
    expect(onClose).not.toHaveBeenCalled();

    resolveFetch({
      ok: true,
      json: async () => ({
        url: "https://project.supabase.co/storage/v1/object/public/banners/user-1/banner.jpg"
      })
    });

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith("upload", expect.any(String))
    );
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("shows processing readiness after a file is selected", async () => {
    const blob = new Blob(["compressed"], { type: "image/jpeg" });
    compressBannerImageMock.mockResolvedValue(blob);
    uploadBannerMock.mockResolvedValue(
      "https://project.supabase.co/storage/v1/object/public/banners/user-1/banner.jpg"
    );

    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    const file = new File(["image"], "banner.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Upload banner image"), {
      target: { files: [file] }
    });

    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("Image ready")
    );
  });

  it("surfaces the Storage upload error instead of reporting a false success", async () => {
    const blob = new Blob(["compressed"], { type: "image/jpeg" });
    compressBannerImageMock.mockResolvedValue(blob);
    uploadBannerMock.mockRejectedValue(
      new Error("new row violates RLS policy")
    );

    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    const file = new File(["image"], "banner.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Upload banner image"), {
      target: { files: [file] }
    });
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("Image ready")
    );
    fireEvent.click(screen.getByRole("button", { name: "Save Banner" }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("RLS policy")
    );
  });

  it("does not silently switch an empty Upload tab to Automatic", async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    render(() => (
      <BannerEditor
        open={true}
        currentBannerType="favorite_movie"
        currentBannerUrl={null}
        data={null}
        userId="user-1"
        onClose={vi.fn()}
        onSave={onSave}
      />
    ));

    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    fireEvent.click(screen.getByRole("button", { name: "Save Banner" }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "Choose an image to upload first."
      )
    );
    expect(onSave).not.toHaveBeenCalled();
  });

  it("updates the preview when a stable Storage URL receives a new version", async () => {
    const stableUrl =
      "https://project.supabase.co/storage/v1/object/public/banners/user-1/banner.jpg";
    const [version, setVersion] = createSignal("stranger-things");

    render(() => (
      <BannerEditor
        open={true}
        currentBannerType="upload"
        currentBannerUrl={stableUrl}
        currentBannerVersion={version()}
        data={null}
        userId="user-1"
        onClose={vi.fn()}
        onSave={vi.fn().mockResolvedValue(true)}
      />
    ));

    const preview = () =>
      screen.getByAltText("Banner preview") as HTMLImageElement;
    expect(preview().src).toContain("v=stranger-things");

    setVersion("venom");
    await waitFor(() => expect(preview().src).toContain("v=venom"));
  });

  it("preserves an existing uploaded banner when no replacement file is selected", async () => {
    const existingUrl =
      "https://project.supabase.co/storage/v1/object/public/banners/user-1/banner.jpg";
    const onSave = vi.fn().mockResolvedValue(true);
    render(() => (
      <BannerEditor
        open={true}
        currentBannerType="upload"
        currentBannerUrl={existingUrl}
        data={null}
        userId="user-1"
        onClose={vi.fn()}
        onSave={onSave}
      />
    ));

    fireEvent.click(screen.getByRole("button", { name: "Save Banner" }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith("upload", existingUrl)
    );
    expect(uploadBannerMock).not.toHaveBeenCalled();
  });
});
