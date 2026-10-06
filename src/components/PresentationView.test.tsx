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
