// src/shared/ui/__tests__/SafeImage.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@solidjs/testing-library";
import SafeImage from "../SafeImage";

/**
 * SafeImage — defensive <img> wrapper with built-in load-error fallback.
 *
 * Test coverage:
 *   1. Renders the <img> when src is provided and no error has occurred.
 *   2. Renders the fallback when src is empty.
 *   3. Swaps to the fallback when the <img> fires onError.
 *   4. Calls the optional onError callback after the internal state flips.
 *   5. Renders the fallback as null when no fallback prop is provided.
 *   6. Passes through alt, class, loading, decoding attributes.
 */
describe("SafeImage", () => {
  it("renders the <img> when src is provided", () => {
    const { container } = render(() => (
      <SafeImage
        src="https://example.com/poster.jpg"
        alt="A movie poster"
        fallback={<div data-testid="fallback">No image</div>}
      />
    ));
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img!.getAttribute("src")).toBe("https://example.com/poster.jpg");
    expect(img!.getAttribute("alt")).toBe("A movie poster");
  });

  it("renders the fallback when src is empty", () => {
    const { container, getByTestId } = render(() => (
      <SafeImage
        src=""
        alt=""
        fallback={<div data-testid="fallback">No image</div>}
      />
    ));
    expect(container.querySelector("img")).toBeNull();
    expect(getByTestId("fallback")).toBeTruthy();
  });

  it("swaps to the fallback when onError fires", () => {
    const { container, getByTestId } = render(() => (
      <SafeImage
        src="https://example.com/broken.jpg"
        alt=""
        fallback={<div data-testid="fallback">No image</div>}
      />
    ));
    // Initially the img is rendered
    const img = container.querySelector("img");
    expect(img).not.toBeNull();

    // Simulate an image load error
    fireEvent.error(img!);

    // Now the img should be gone and the fallback visible
    expect(container.querySelector("img")).toBeNull();
    expect(getByTestId("fallback")).toBeTruthy();
  });

  it("calls the optional onError callback after the internal state flips", () => {
    const onErrorSpy = vi.fn();
    const { container } = render(() => (
      <SafeImage
        src="https://example.com/broken.jpg"
        alt=""
        fallback={<div>No image</div>}
        onError={onErrorSpy}
      />
    ));
    const img = container.querySelector("img");
    fireEvent.error(img!);
    expect(onErrorSpy).toHaveBeenCalledTimes(1);
  });

  it("renders null fallback when no fallback prop is provided and src is empty", () => {
    const { container } = render(() => <SafeImage src="" alt="" />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("div")).toBeNull();
  });

  it("passes through loading and decoding attributes", () => {
    const { container } = render(() => (
      <SafeImage
        src="https://example.com/poster.jpg"
        alt=""
        loading="eager"
        decoding="sync"
        fallback={<div>No image</div>}
      />
    ));
    const img = container.querySelector("img");
    expect(img!.getAttribute("loading")).toBe("eager");
    expect(img!.getAttribute("decoding")).toBe("sync");
  });

  it("defaults loading to lazy and decoding to async", () => {
    const { container } = render(() => (
      <SafeImage
        src="https://example.com/poster.jpg"
        alt=""
        fallback={<div>No image</div>}
      />
    ));
    const img = container.querySelector("img");
    expect(img!.getAttribute("loading")).toBe("lazy");
    expect(img!.getAttribute("decoding")).toBe("async");
  });

  it("applies the class prop to the img element", () => {
    const { container } = render(() => (
      <SafeImage
        src="https://example.com/poster.jpg"
        alt=""
        class="my-poster-class"
        fallback={<div>No image</div>}
      />
    ));
    const img = container.querySelector("img");
    expect(img!.className).toBe("my-poster-class");
  });
});
