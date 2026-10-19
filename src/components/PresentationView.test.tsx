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

  it("goes blank and comes back when told to", () => {
    const { container } = render(<PresentationView />);
    control({ ...live, blackout: true });
    expect(container.textContent).not.toContain("placeholder words");
    // Blank shows the church background, not black.
    expect(container.querySelector<HTMLElement>(".slide-blank")!.style.backgroundImage).toContain("church-background");
    // ...with the church's full-colour logo on it, whatever the corner-logo setting.
    expect(container.querySelector(".slide-blank > img.slide-blank-logo")!.getAttribute("src")).toMatch(/church-logo.*\.webp/);
    control(live);
    expect(container.textContent).toContain("placeholder words");
    expect(container.querySelector(".slide-blank")).toBeNull();
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

  it("hides with Blank and comes back with Show", () => {
    const { container } = render(<PresentationView />);
    control({ ...live, logo: true, blackout: true });
    expect(logo(container)).toBeNull();
    control({ ...live, logo: true });
    expect(logo(container)).toBeTruthy();
  });

  it("gives text on the church background its readable treatment, and leaves other backgrounds as they are", () => {
    const { container } = render(<PresentationView />);
    control({ ...live, theme: DEFAULT_THEME });
    expect(container.querySelector(".slide[data-bg=church]")).toBeTruthy();
    expect(container.querySelector(".slide-ref")!.textContent).toBe("John 3:16 (TEN)");
    control(live);
    expect(container.querySelector(".slide[data-bg]")).toBeNull();
    expect(container.querySelector(".slide-ref")!.textContent).toBe("John 3:16 (TEN)");
  });

  it("is left off the church background, which carries the logo as a watermark", () => {
    const { container } = render(<PresentationView />);
    control({ ...live, logo: true, theme: DEFAULT_THEME });
    expect(logo(container)).toBeNull();
    expect(container.textContent).toContain("placeholder words");
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
    // A song credit at the foot is kept between margins wider than the logo.
    control({ ...live, logo: true, slide: { ...song, footer: "Writer  |  © Test" } });
    expect(container.querySelector(".slide.has-logo[data-footer] .slide-footer")).toBeTruthy();
    // A Bible reference heads the slide, so the words stop above the logo.
    control({ ...live, logo: true });
    expect(container.querySelector(".slide.has-logo[data-ref=top]:not([data-footer]) > .slide-header")).toBeTruthy();
    control({ ...live, logo: true, slide: song });
    expect(container.querySelector(".slide.has-logo:not([data-footer])")).toBeTruthy();
  });
});

describe("the Bible reference at the top of the slide", () => {
  // The slide's parts from top to bottom, by class name.
  const order = (c: HTMLElement) => [...c.querySelector(".projector > .slide")!.children].map((el) => el.classList[0]);
  const header = (c: HTMLElement) => c.querySelector(".projector > .slide > .slide-header > .slide-ref");
  const verse = (c: HTMLElement) => [...c.querySelectorAll(".slide-body .slide-scripture")].map((p) => [p.getAttribute("lang"), p.textContent?.trim()]);

  it("heads an English verse and sits above the words, never at the foot", () => {
    const { container } = render(<PresentationView />);
    control(live);
    expect(header(container)!.textContent).toBe("John 3:16 (TEN)");
    expect(order(container)).toEqual(["slide-bg", "slide-header", "slide-body"]);
    expect(container.querySelector(".slide-footer")).toBeNull();
    expect(container.querySelector(".slide[data-footer]")).toBeNull();
    expect(verse(container)).toEqual([[null, "placeholder words"]]);
  });

  it("heads a Malayalam verse in Malayalam, with the slide marked as Malayalam", () => {
    const { container } = render(<PresentationView />);
    control({ ...live, slide: { ...slide, lines: ["വാക്യം"], lang: "ml", footer: "യോഹന്നാൻ 3:16 (TML)" } });
    expect(header(container)!.textContent).toBe("യോഹന്നാൻ 3:16 (TML)");
    expect(container.querySelector(".slide[lang=ml] > .slide-header")).toBeTruthy();
    expect(verse(container)).toEqual([["ml", "വാക്യം"]]);
    expect(container.querySelector(".slide-footer")).toBeNull();
  });

  it("heads both languages together, with each language kept whole and apart, stacked or side by side", () => {
    const { container } = render(<PresentationView />);
    const pair: Slide = { ...slide, lang: "en", parallelLines: ["സ്നേഹം വാക്കുകൾ"], parallelLang: "ml", footer: "John 3:16 (TEN · TML)" };
    for (const bilingualLayout of ["stacked", "columns"] as const) {
      control({ ...live, slide: pair, theme: { ...live.theme, bilingualLayout } });
      expect(header(container)!.textContent).toBe("John 3:16 (TEN · TML)");
      expect(order(container)).toEqual(["slide-bg", "slide-header", "slide-body"]);
      expect([...container.querySelector(".slide-body > .bilingual")!.children].map((el) => el.className)).toEqual(["slide-scripture", "bilingual-rule", "slide-scripture"]);
      expect(verse(container)).toEqual([["en", "placeholder words"], ["ml", "സ്നേഹം വാക്കുകൾ"]]);
      expect(container.querySelector(".slide-footer")).toBeNull();
    }
  });

  it("follows the verse as it moves on and back", () => {
    const { container } = render(<PresentationView />);
    control({ ...live, slide: { ...slide, key: "v:42.3.17", lines: ["next words"], footer: "John 3:17 (TEN)" } });
    expect(header(container)!.textContent).toBe("John 3:17 (TEN)");
    expect(verse(container)).toEqual([[null, "next words"]]);
    control(live);
    expect(header(container)!.textContent).toBe("John 3:16 (TEN)");
    expect(verse(container)).toEqual([[null, "placeholder words"]]);
  });

  it("keeps the church background's readable treatment", () => {
    const { container } = render(<PresentationView />);
    control({ ...live, theme: DEFAULT_THEME });
    expect(container.querySelector(".slide[data-bg=church][data-ref=top] > .slide-header > .slide-ref")!.textContent).toBe("John 3:16 (TEN)");
  });

  it("hides with the words under Blank, which keeps the church background and its full-colour logo", () => {
    const { container } = render(<PresentationView />);
    control({ ...live, logo: true, blackout: true });
    expect(container.querySelector(".slide-header")).toBeNull();
    expect(container.querySelector(".slide[data-ref]")).toBeNull();
    expect(container.textContent).not.toContain("John 3:16");
    expect(container.querySelector<HTMLElement>(".slide-blank")!.style.backgroundImage).toContain("church-background");
    expect(container.querySelector(".slide-blank > img.slide-blank-logo")!.getAttribute("src")).toMatch(/church-logo.*\.webp/);
    control(live);
    expect(header(container)!.textContent).toBe("John 3:16 (TEN)");
  });

  it("is left off when the look turns references off, and with Clear", () => {
    const { container } = render(<PresentationView />);
    control({ ...live, theme: { ...live.theme, showReference: false } });
    expect(container.querySelector(".slide-header, .slide-footer")).toBeNull();
    expect(verse(container)).toEqual([[null, "placeholder words"]]);
    control({ ...live, clear: true });
    expect(container.querySelector(".slide-header, .slide-footer")).toBeNull();
  });

  it("leaves song slides as they were: the credit stays at the foot and nothing heads the slide", () => {
    const { container } = render(<PresentationView />);
    const song: Slide = { key: "b1/Verse 1/0#0", itemId: "b1", kind: "song", label: "Verse 1", lines: ["Line one"], footer: "Writer  |  © Test" };
    control({ ...live, slide: song });
    expect(order(container)).toEqual(["slide-bg", "slide-body", "slide-footer"]);
    expect(container.querySelector(".slide[data-footer] > .slide-footer > .slide-ref")!.textContent).toBe("Writer  |  © Test");
    expect(container.querySelector(".slide-header, .slide[data-ref]")).toBeNull();
    control({ ...live, slide: { ...song, lines: ["വരി ഒന്ന്"], lang: "ml", parallelLines: ["Line one"], parallelLang: "en" } });
    expect(order(container)).toEqual(["slide-bg", "slide-body", "slide-footer"]);
    expect(container.querySelector(".slide-header")).toBeNull();
  });
});
