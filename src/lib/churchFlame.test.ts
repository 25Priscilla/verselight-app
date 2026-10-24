import { describe, expect, it } from "vitest";
import { churchFlameLayout, FLAME_MAX_WIDTH, FLAME_RIGHT, FLAME_W, flameBaseOnScreen, waveTopOnScreen } from "./churchFlame";

const screens: [string, number, number][] = [
  ["16:9", 1920, 1080],
  ["16:9 laptop", 1280, 720],
  ["16:10", 1920, 1200],
  ["4:3", 1024, 768],
  ["21:9", 2560, 1080],
];

describe("churchFlameLayout", () => {
  it("waits for the frame to have a size", () => {
    expect(churchFlameLayout(0, 0)).toBeNull();
  });

  it("is 15% larger than in the artwork on a 16:9 screen, just below the top edge", () => {
    const l = churchFlameLayout(1920, 1080)!;
    expect(l.width / FLAME_W).toBeCloseTo(1.15, 2);
    expect(l.top).toBe(16);
  });

  it.each(screens)("on %s the whole flame shows, leaving the centre for the words", (_, w, h) => {
    const l = churchFlameLayout(w, h)!;
    const reach = (l.width * FLAME_RIGHT) / FLAME_W;
    // The tip is on screen and the flame reaches no further in than its share of the width.
    expect(l.top).toBeGreaterThanOrEqual(0);
    expect(reach).toBeLessThanOrEqual(w * FLAME_MAX_WIDTH + 0.5);
    // It never shrinks to the old sliver: at least about a fifth of the width (or full artwork size on wide screens).
    expect(reach).toBeGreaterThan(Math.min(w * 0.2, (h / 1080) * FLAME_RIGHT));
  });

  it.each(screens)("on %s the flame's base sits behind the wave, never floating above it", (_, w, h) => {
    const l = churchFlameLayout(w, h)!;
    const f = l.width / FLAME_W;
    for (let x = 196; x <= 304; x += 4) {
      const frameX = x * f;
      expect(flameBaseOnScreen(l, frameX)).toBeGreaterThanOrEqual(waveTopOnScreen(w, h, frameX) - 0.5);
    }
  });
});
