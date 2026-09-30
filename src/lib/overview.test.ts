import { describe, expect, it } from "vitest";
import { verseId, type CrossRefData } from "./crossrefs";
import { chapterSections, keyVerses, loadSections, neighbour, relatedChapters, type SectionsData } from "./overview";

const JOHN = 42;

describe("chapter overview data", () => {
  it("has section headings for every chapter of the Bible but one, each keyed by its own chapter", async () => {
    const data = await loadSections();
    expect(Object.keys(data.sections)).toHaveLength(1188);
    // Different chapters of the same book have different headings, so the overview is per chapter.
    const g1 = chapterSections(data, 0, 1, 31).map((s) => s.title);
    const g2 = chapterSections(data, 0, 2, 25).map((s) => s.title);
    expect(g1.length).toBeGreaterThan(0);
    expect(g2.length).toBeGreaterThan(0);
    expect(g1).not.toEqual(g2);
    const j3 = chapterSections(data, JOHN, 3, 36).map((s) => s.title);
    const j4 = chapterSections(data, JOHN, 4, 54).map((s) => s.title);
    expect(j3).not.toEqual(j4);
    // Lamentations 2 has no heading in the source; the overview says so rather than making one up.
    expect(chapterSections(data, 24, 2, 22)).toEqual([]);
  });

  it("gives each section a verse range that ends before the next heading", () => {
    const data: SectionsData = { format: "verselight-sections", credit: "", source: "", count: 3,
      sections: { "0.1": [[1, "A", "", 1], [3, "A.1", "", 2], [6, "B", "See also X", 1]] } };
    expect(chapterSections(data, 0, 1, 8)).toEqual([
      { from: 1, to: 5, title: "A", parallel: "", level: 1 },
      { from: 3, to: 5, title: "A.1", parallel: "", level: 2 },
      { from: 6, to: 8, title: "B", parallel: "See also X", level: 1 },
    ]);
  });
});

describe("chapter navigation", () => {
  const perBook = [50, 40, 21, 28];
  it("moves between chapters and across books", () => {
    expect(neighbour(perBook, 0, 3, 1)).toEqual({ book: 0, chapter: 4 });
    expect(neighbour(perBook, 2, 21, 1)).toEqual({ book: 3, chapter: 1 });
    expect(neighbour(perBook, 3, 1, -1)).toEqual({ book: 2, chapter: 21 });
  });
  it("stops at the start and end of the Bible", () => {
    expect(neighbour(perBook, 0, 1, -1)).toBeNull();
    expect(neighbour(perBook, 3, 28, 1)).toBeNull();
  });
});

describe("key verses and related chapters from cross references", () => {
  const xr: CrossRefData = {
    format: "verselight-xrefs", credit: "", license: "", source: "", changes: "", count: 3,
    refs: {
      [verseId(JOHN, 3, 16)]: [verseId(44, 5, 8), verseId(44, 5, 8), 40, verseId(61, 4, 9), verseId(61, 4, 10), 30],
      [verseId(JOHN, 3, 3)]: [verseId(JOHN, 1, 13), verseId(JOHN, 1, 13), 5],
      [verseId(44, 5, 8)]: [verseId(JOHN, 3, 16), verseId(JOHN, 3, 16), 20],
    },
  };
  it("ranks the chapter's most connected verses", () => {
    expect(keyVerses(xr, JOHN, 3, 36).map((k) => k.verse)).toEqual([3, 16]);
    expect(keyVerses(xr, JOHN, 3, 36)[1]).toMatchObject({ verse: 16, score: 90, references: 2 });
  });
  it("lists chapters elsewhere connected to this one", () => {
    expect(relatedChapters(xr, JOHN, 3).map((r) => [r.book, r.chapter])).toEqual([[44, 5], [61, 4]]);
  });
});
