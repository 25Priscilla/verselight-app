// @vitest-environment jsdom
// Lyrics are sized by measuring them, so the slide must measure again once a late font (often Malayalam) arrives.
import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Slide } from "../lib/types";
import { DEFAULT_THEME } from "../state/library";
import { SlideRenderer } from "./SlideRenderer";

const song: Slide = { key: "s", itemId: "song", kind: "song", label: "Verse", lines: ["നിൻ വഴികളിൽ"], lang: "ml", footer: "" };

/** A stand-in for document.fonts whose `ready` has already settled, as it can before the Malayalam face loads. */
class Fonts extends EventTarget {
  ready = Promise.resolve();
  listeners = 0;
  addEventListener(...args: Parameters<EventTarget["addEventListener"]>) { this.listeners++; super.addEventListener(...args); }
  removeEventListener(...args: Parameters<EventTarget["removeEventListener"]>) { this.listeners--; super.removeEventListener(...args); }
}

// jsdom has no document.fonts, so each test brings its own.
afterEach(() => { vi.restoreAllMocks(); delete (document as { fonts?: unknown }).fonts; });

describe("SlideRenderer font loading", () => {
  it("measures the words again whenever a font finishes loading, and stops listening when it goes away", async () => {
    const fonts = new Fonts();
    Object.defineProperty(document, "fonts", { value: fonts, configurable: true });
    const { container, unmount } = render(<SlideRenderer slide={song} theme={DEFAULT_THEME} />);
    await act(async () => {});
    const body = container.querySelector<HTMLElement>(".slide-body")!;
    const fitWrites = vi.spyOn(body.style, "setProperty");

    act(() => { fonts.dispatchEvent(new Event("loadingdone")); });
    expect(fitWrites).toHaveBeenCalledWith("--fit", "1");

    unmount();
    expect(fonts.listeners).toBe(0);
    fitWrites.mockClear();
    fonts.dispatchEvent(new Event("loadingdone"));
    expect(fitWrites).not.toHaveBeenCalled();
  });
});
