import { describe, expect, it } from "vitest";
import type { DisplayInfo } from "./display";
import { chooseDisplay, displayConnected, displayDescription, displayLabel, NO_SECOND_DISPLAY, sameDisplays } from "./projector";

const laptop: DisplayInfo = { id: "\\\\.\\DISPLAY1", index: 0, name: "\\\\.\\DISPLAY1", width: 1920, height: 1200, x: 0, y: 0, primary: true };
const projector: DisplayInfo = { id: "\\\\.\\DISPLAY2", index: 1, name: "\\\\.\\DISPLAY2", width: 1920, height: 1080, x: 1920, y: 0, primary: false };
const tv: DisplayInfo = { id: "\\\\.\\DISPLAY3", index: 2, name: "\\\\.\\DISPLAY3", width: 3840, height: 2160, x: -3840, y: 0, primary: false };
const auto = { id: null, index: null };

describe("choosing the projector screen", () => {
  it("automatic uses the first screen that isn't the laptop's main screen", () => {
    expect(chooseDisplay([laptop, projector, tv], auto)).toEqual({ ok: true, display: projector });
    // Windows can list the main screen anywhere.
    expect(chooseDisplay([projector, laptop], auto)).toEqual({ ok: true, display: projector });
  });

  it("never covers the operator's screen when there is only one screen", () => {
    expect(chooseDisplay([laptop], auto)).toEqual({ ok: false, reason: "no-second", message: NO_SECOND_DISPLAY });
  });

  it("reports when no screens are found at all", () => {
    expect(chooseDisplay([], auto)).toMatchObject({ ok: false, reason: "none" });
    expect(chooseDisplay([], { id: projector.id, index: null })).toMatchObject({ ok: false, reason: "none" });
  });

  it("uses the chosen screen by identity, even when the list order changes", () => {
    const choice = { id: tv.id, index: null };
    expect(chooseDisplay([laptop, projector, tv], choice)).toEqual({ ok: true, display: tv });
    expect(chooseDisplay([{ ...tv, index: 0 }, { ...laptop, index: 1 }], choice)).toMatchObject({ ok: true, display: { id: tv.id } });
  });

  it("says the chosen screen is unavailable rather than silently using another one", () => {
    const pick = chooseDisplay([laptop, projector], { id: tv.id, index: null });
    expect(pick).toMatchObject({ ok: false, reason: "unavailable" });
    expect(!pick.ok && pick.message).toMatch(/isn't connected/);
  });

  it("uses the main screen only when it is chosen on purpose (e.g. to rehearse)", () => {
    expect(chooseDisplay([laptop], { id: laptop.id, index: null })).toEqual({ ok: true, display: laptop });
  });

  it("honours a list position saved before display ids, but not one that points at the main screen", () => {
    expect(chooseDisplay([laptop, projector, tv], { id: null, index: 2 })).toEqual({ ok: true, display: tv });
    expect(chooseDisplay([laptop, projector], { id: null, index: 0 })).toEqual({ ok: true, display: projector });
    expect(chooseDisplay([laptop, projector], { id: null, index: 5 })).toEqual({ ok: true, display: projector });
    expect(chooseDisplay([laptop], { id: null, index: 0 })).toMatchObject({ ok: false, reason: "no-second" });
  });
});

describe("screen names and changes", () => {
  it("names screens readably", () => {
    expect(displayLabel(projector)).toBe("Display 2");
    expect(displayLabel({ name: "BenQ MW560", index: 1 })).toBe("BenQ MW560");
    expect(displayLabel({ name: "", index: 2 })).toBe("Display 3");
    expect(displayDescription(laptop)).toBe("Display 1 · 1920×1200 · this computer's main screen");
    expect(displayDescription(projector)).toBe("Display 2 · 1920×1080");
  });

  it("notices when the projector's screen is unplugged and plugged back in", () => {
    expect(displayConnected([laptop, projector], projector.id)).toBe(true);
    expect(displayConnected([laptop], projector.id)).toBe(false);
    expect(displayConnected([laptop, { ...projector, index: 1 }], projector.id)).toBe(true);
  });

  it("treats an unchanged screen list as the same (no needless re-render)", () => {
    expect(sameDisplays([laptop, projector], [{ ...laptop }, { ...projector }])).toBe(true);
    expect(sameDisplays([laptop, projector], [laptop])).toBe(false);
    expect(sameDisplays([laptop, projector], [laptop, { ...projector, width: 1280 }])).toBe(false);
  });
});
