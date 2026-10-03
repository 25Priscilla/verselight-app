// @vitest-environment jsdom
// The projector window: only the slide, drawn from what the control window sends.
import { act, fireEvent, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveState, Slide } from "../lib/types";
import { DEFAULT_THEME } from "../state/library";
import { PresentationView } from "./PresentationView";

// The messages between the control window and the projector window, in memory.
const bus = vi.hoisted(() => ({ handlers: new Map<string, (payload: unknown) => void>(), sent: [] as { event: string; payload: unknown }[] }));
vi.mock("../lib/bridge", () => ({
  send: async (event: string, payload: unknown) => { bus.sent.push({ event, payload }); },
  on: (event: string, h: (payload: unknown) => void) => { bus.handlers.set(event, h); return () => bus.handlers.delete(event); },
}));
const control = (state: LiveState) => act(() => bus.handlers.get("live-state")!(state));

const slide: Slide = { key: "v:42.3.16", itemId: "bible", kind: "scripture", label: "John 3:16", lines: ["placeholder words"], footer: "John 3:16 (TEN)" };
const live: LiveState = { slide, theme: { ...DEFAULT_THEME, backgroundKind: "color", backgroundColor: "#0000ff" }, blackout: false, clear: false };

beforeEach(() => { bus.handlers.clear(); bus.sent = []; });

describe("PresentationView (the projector window)", () => {
  it("asks for the current slide when it opens, then shows only that slide", () => {
    const { container } = render(<PresentationView />);
    expect(bus.sent).toEqual([{ event: "request-state", payload: null }]);
    control(live);
    expect(container.textContent).toContain("placeholder words");
    expect(container.textContent).toContain("John 3:16 (TEN)");
    // Nothing but the slide: no buttons, links, inputs or menus.
    expect(container.querySelectorAll("button, a, input, select, nav, aside, [role=menu]")).toHaveLength(0);
    expect(container.querySelector(".projector > .slide")).toBeTruthy();
    expect(container.querySelector(".projector")!.innerHTML).toMatch(/0000ff|0, 0, 255/i);
  });

  it("goes black and comes back when told to", () => {
    const { container } = render(<PresentationView />);
    control({ ...live, blackout: true });
    expect(container.textContent).not.toContain("placeholder words");
    control(live);
    expect(container.textContent).toContain("placeholder words");
  });

  it("blocks the browser's right-click menu and page scrolling", () => {
    const { unmount } = render(<PresentationView />);
    expect(document.documentElement.classList.contains("projector-window")).toBe(true);
    const e = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    document.body.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    unmount();
    expect(document.documentElement.classList.contains("projector-window")).toBe(false);
  });

  it("passes clicker keys to the control window rather than changing the slide itself", () => {
    render(<PresentationView />);
    fireEvent.keyDown(window, { key: "PageDown" });
    fireEvent.keyDown(window, { key: "b" });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(bus.sent.filter((m) => m.event === "nav").map((m) => m.payload)).toEqual(["next", "blackout", "exit"]);
  });
});

describe("a song slide with its translation", () => {
  const song: Slide = { key: "b1/Verse 1/0#0", itemId: "b1", kind: "song", label: "Verse 1", footer: "",
    lines: ["വരി ഒന്ന്", "വരി രണ്ട്"], lang: "ml", parallelLines: ["Line one", "Line two"], parallelLang: "en" };

  it("shows each language as a whole block, marked with its language, never mixed line by line", () => {
    const { container } = render(<PresentationView />);
    control({ ...live, slide: song });
    const blocks = [...container.querySelectorAll(".song-pair > .slide-lines")];
    expect(blocks.map((b) => [b.getAttribute("lang"), [...b.children].map((l) => l.textContent)])).toEqual([
      ["ml", ["വരി ഒന്ന്", "വരി രണ്ട്"]],
      ["en", ["Line one", "Line two"]],
    ]);
    expect(container.querySelector(".song-pair.stack .bilingual-rule")).toBeTruthy();
  });

  it("puts them side by side when the look says so", () => {
    const { container } = render(<PresentationView />);
    control({ ...live, slide: song, theme: { ...live.theme, bilingualLayout: "columns" } });
    expect(container.querySelector(".song-pair.cols")).toBeTruthy();
  });

  it("shows a song slide in one language exactly as before", () => {
    const { container } = render(<PresentationView />);
    control({ ...live, slide: { ...song, parallelLines: undefined, parallelLang: undefined } });
    expect(container.querySelector(".song-pair")).toBeNull();
    expect([...container.querySelectorAll(".slide-lines > div")].map((l) => l.textContent)).toEqual(["വരി ഒന്ന്", "വരി രണ്ട്"]);
  });
});

describe("the church logo", () => {
  const logo = (c: HTMLElement) => c.querySelector<HTMLImageElement>(".projector > .slide > img.slide-logo");
  const song: Slide = { key: "b1/Verse 1/0#0", itemId: "b1", kind: "song", label: "Verse 1", footer: "",
    lines: ["വരി ഒന്ന്"], lang: "ml", parallelLines: ["Line one"], parallelLang: "en" };

  it("shows the bundled logo in the corner of the slide when it is on", () => {
    const { container } = render(<PresentationView />);
    control({ ...live, logo: true });
    expect(logo(container)!.getAttribute("src")).toMatch(/church-logo.*\.webp/);
    // Decorative: screen readers and the audience's view are not interrupted, and it can't be dragged away.
    expect(logo(container)!.getAttribute("alt")).toBe("");
    expect(container.querySelector(".slide.has-logo")).toBeTruthy();
  });

  it("is not drawn when the setting is off", () => {
    const { container } = render(<PresentationView />);
    control({ ...live, logo: false });
    expect(logo(container)).toBeNull();
    expect(container.querySelector(".slide.has-logo")).toBeNull();
    expect(container.textContent).toContain("placeholder words");
  });

  it("hides with Black and comes back with Show", () => {
    const { container } = render(<PresentationView />);
    control({ ...live, logo: true, blackout: true });
    expect(logo(container)).toBeNull();
    control({ ...live, logo: true });
    expect(logo(container)).toBeTruthy();
  });

  it("stays on while moving between Bible and songs, languages, backgrounds and Clear", () => {
    const { container } = render(<PresentationView />);
    const states: LiveState[] = [
      { ...live, logo: true },
      { ...live, logo: true, slide: { ...slide, lines: ["വാക്യം"], lang: "ml" } },
      { ...live, logo: true, slide: song },
      { ...live, logo: true, slide: { ...song, lang: "ta", lines: ["வரி"] }, theme: { ...live.theme, backgroundKind: "gallery", galleryId: "dawn" } },
      { ...live, logo: true, slide: { ...song, lang: "kn", lines: ["ಸಾಲು"] }, theme: { ...live.theme, bilingualLayout: "columns" } },
      { ...live, logo: true, clear: true },
    ];
    for (const s of states) {
      control(s);
      expect(logo(container)).toBeTruthy();
    }
  });

  it("keeps the reference clear of the logo, and the words above it when there is no reference", () => {
    const { container } = render(<PresentationView />);
    control({ ...live, logo: true });
    expect(container.querySelector(".slide[data-footer] .slide-footer")).toBeTruthy();
    control({ ...live, logo: true, slide: song });
    expect(container.querySelector(".slide.has-logo:not([data-footer])")).toBeTruthy();
  });
});
