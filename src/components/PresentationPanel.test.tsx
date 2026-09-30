// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Slide } from "../lib/types";
import { DEFAULT_THEME } from "../state/library";
import { placeMenu } from "./LookPicker";
import { PresentationPanel } from "./PresentationPanel";

const slides: Slide[] = Array.from({ length: 12 }, (_, i) => ({
  key: `v:0.1.${i + 1}`, itemId: "bible", kind: "scripture", label: `Genesis 1:${i + 1}`, lines: [`Text ${i + 1}`], footer: "",
}));

function setup(over: Partial<Parameters<typeof PresentationPanel>[0]> = {}) {
  const props = {
    title: "Genesis 1", kind: "scripture" as const, slides, index: 2, selectionKeys: new Set<string>(),
    neighbours: { before: null, after: "Genesis 2" }, blackout: false, projector: "live" as const, displayName: "Projector",
    onGoto: vi.fn(), onPrev: vi.fn(), onNext: vi.fn(), onBlackout: vi.fn(), onStart: vi.fn(), onStop: vi.fn(), onEnd: vi.fn(),
    defaultTheme: DEFAULT_THEME, lookFor: () => ({ id: "default", theme: DEFAULT_THEME, source: "default" as const }),
    looks: [], slideLook: () => null, onSlideLook: vi.fn(),
    ...over,
  };
  render(<PresentationPanel {...props} />);
  return props;
}

describe("PresentationPanel", () => {
  it("shows the current slide, its position and the next slide", () => {
    setup();
    expect(screen.getByText("Slide 3 of 12")).toBeTruthy();
    expect(screen.getByText("On screen now")).toBeTruthy();
    const next = screen.getByLabelText("Next slide");
    expect(within(next).getByText("Genesis 1:4")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Slide 3: Genesis 1:3 \(showing now\)/ }).getAttribute("aria-current")).toBe("true");
  });

  it("runs Previous, Next, Black, Stop and Close", () => {
    const p = setup();
    fireEvent.click(screen.getByRole("button", { name: /Previous/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Next/ }));
    fireEvent.click(screen.getByRole("button", { name: /Black/ }));
    fireEvent.click(screen.getByRole("button", { name: /Stop presentation/ }));
    fireEvent.click(screen.getByRole("button", { name: "Close presentation" }));
    expect([p.onPrev, p.onNext, p.onBlackout, p.onStop, p.onEnd].map((f) => vi.mocked(f).mock.calls.length)).toEqual([1, 1, 1, 1, 1]);
  });

  it("shows a slide at once when it is clicked in the list", () => {
    const p = setup();
    fireEvent.click(screen.getByRole("button", { name: /Slide 7: Genesis 1:7/ }));
    expect(p.onGoto).toHaveBeenCalledWith(6);
  });

  it("offers Start presenting while the projector is off", () => {
    const p = setup({ projector: "off" });
    expect(screen.getByText("Preview only")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Start presenting/ }));
    expect(p.onStart).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /Stop presentation/ })).toBeNull();
  });

  it("switches Black to Show while the screen is black", () => {
    setup({ blackout: true });
    expect(screen.getByRole("button", { name: /Show/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Screen is black")).toBeTruthy();
  });

  it("disables Previous on the first slide and Next on the last, unless another chapter follows", () => {
    setup({ index: 0 });
    expect((screen.getByRole("button", { name: /Previous/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("says the next chapter comes after the last verse", () => {
    setup({ index: 11 });
    expect(screen.getByText("Genesis 2 (next chapter)")).toBeTruthy();
    expect((screen.getByRole("button", { name: /^Next/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("ends a song on its last slide", () => {
    setup({ kind: "song", index: 11, neighbours: { before: null, after: null } });
    expect(screen.getByText("End of song")).toBeTruthy();
    expect((screen.getByRole("button", { name: /^Next/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("opens a slide's background menu outside the slide list, and Esc closes only the menu", () => {
    const p = setup();
    const button = screen.getByRole("button", { name: "Background for Genesis 1:5" });
    fireEvent.click(button);
    const menu = screen.getByRole("menu", { name: "Background for Genesis 1:5" });
    expect(menu.parentElement).toBe(document.body);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(p.onStop).not.toHaveBeenCalled();
  });

  it("sets a slide's background from the menu", () => {
    const p = setup();
    fireEvent.click(screen.getByRole("button", { name: "Background for Genesis 1:5" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: /Default look/ }));
    expect(p.onSlideLook).toHaveBeenCalledWith("v:0.1.5", "default");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("explains what to do when nothing is loaded", () => {
    setup({ slides: [], index: 0, projector: "off" });
    expect(screen.getByText("Nothing is loaded to present.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close presentation" })).toBeTruthy();
  });
});

describe("placeMenu", () => {
  const win = { width: 900, height: 700 };
  it("opens below the button when there is room", () => {
    expect(placeMenu({ top: 100, bottom: 126, right: 800 }, 300, win)).toEqual({ top: 132, left: 550, maxHeight: 300 });
  });
  it("opens above the button near the bottom of the window", () => {
    const p = placeMenu({ top: 640, bottom: 666, right: 800 }, 300, win);
    expect(p.top + p.maxHeight).toBeLessThanOrEqual(640);
  });
  it("always stays inside a short window, scrolling instead", () => {
    const p = placeMenu({ top: 200, bottom: 226, right: 120 }, 900, { width: 900, height: 300 });
    expect(p.top).toBeGreaterThanOrEqual(8);
    expect(p.top + p.maxHeight).toBeLessThanOrEqual(292);
    expect(p.left).toBe(8);
  });
});
