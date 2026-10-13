import { describe, expect, it } from "vitest";
import { BOOK_NAMES, ESV_BIBLE_ID } from "./bible";
import { FEATURED, featuredBibleId, featuredPosition } from "./featuredVerse";

describe("Home's featured verse", () => {
  it("stays the same all day and changes the next day", () => {
    const morning = featuredPosition(new Date(2026, 9, 13, 7));
    expect(featuredPosition(new Date(2026, 9, 13, 23, 59))).toBe(morning);
    expect(featuredPosition(new Date(2026, 9, 14, 7))).not.toBe(morning);
  });

  it("goes through every listed verse", () => {
    const seen = new Set(Array.from({ length: FEATURED.length }, (_, i) => featuredPosition(new Date(2026, 0, 1 + i))));
    expect(seen.size).toBe(FEATURED.length);
  });

  it("lists only real book positions and verse ranges", () => {
    for (const p of FEATURED) {
      expect(BOOK_NAMES[p.book]).toBeTruthy();
      expect(p.chapter).toBeGreaterThan(0);
      expect(p.to).toBeGreaterThanOrEqual(p.from);
    }
  });

  it("reads from the translation being read, but never waits on the online ESV", () => {
    const bibles = [{ id: ESV_BIBLE_ID }, { id: "kjv" }, { id: "ml" }];
    expect(featuredBibleId(bibles, "ml")).toBe("ml");
    expect(featuredBibleId(bibles, ESV_BIBLE_ID)).toBe("kjv");
    expect(featuredBibleId([{ id: ESV_BIBLE_ID }], ESV_BIBLE_ID)).toBeNull();
    expect(featuredBibleId([], "")).toBeNull();
  });
});
