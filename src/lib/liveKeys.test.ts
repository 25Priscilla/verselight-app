import { describe, expect, it } from "vitest";
import { liveKeyAction, type LiveKeyContext } from "./liveKeys";

const ctx: LiveKeyContext = { typing: false, modal: false, menu: false, session: true, projectorOn: true };
const key = (k: string, over: Partial<LiveKeyContext> = {}, mods: Partial<KeyboardEvent> = {}) =>
  liveKeyAction({ key: k, metaKey: false, ctrlKey: false, altKey: false, ...mods }, { ...ctx, ...over });

describe("presentation keys", () => {
  it("moves with Space, arrows and Page Up/Down (clickers)", () => {
    for (const k of [" ", "ArrowRight", "ArrowDown", "PageDown"]) expect(key(k)).toBe("next");
    for (const k of ["ArrowLeft", "ArrowUp", "PageUp"]) expect(key(k)).toBe("prev");
  });

  it("B toggles the black screen", () => {
    expect(key("b")).toBe("blackout");
    expect(key("B")).toBe("blackout");
  });

  it("Esc stops the presentation only while the projector is on", () => {
    expect(key("Escape")).toBe("exit");
    expect(key("Escape", { projectorOn: false })).toBeNull();
  });

  it("does nothing to slides when nothing is loaded", () => {
    expect(key("ArrowRight", { session: false })).toBeNull();
    expect(key("b", { session: false })).toBeNull();
  });

  it("leaves an open menu's keys to the menu: Esc closes the menu and does not stop the presentation", () => {
    expect(key("Escape", { menu: true })).toBeNull();
    expect(key("ArrowDown", { menu: true })).toBeNull();
    expect(key(" ", { modal: true })).toBeNull();
  });

  it("lets text boxes keep their keys, and Esc leaves the box first", () => {
    expect(key("ArrowRight", { typing: true })).toBeNull();
    expect(key(" ", { typing: true })).toBeNull();
    expect(key("Escape", { typing: true })).toBe("blur");
  });

  it("ignores shortcuts with Ctrl, Alt or Cmd", () => {
    expect(key("ArrowRight", {}, { ctrlKey: true })).toBeNull();
    expect(key("b", {}, { metaKey: true })).toBeNull();
    expect(key("ArrowLeft", {}, { altKey: true })).toBeNull();
  });

  it("ignores other keys", () => {
    expect(key("x")).toBeNull();
    expect(key("Enter")).toBeNull();
  });
});
