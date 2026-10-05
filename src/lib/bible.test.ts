import { describe, expect, it } from "vitest";
import { fakeEnglish, fakeMalayalam, EPHESIANS, GENESIS, JOHN, ROMANS } from "../test/fakeBible";
import { alignedVerses, detectBibleLanguage, findBook, forDisplay, getVerses, matchRanges, parseReference, searchBible, searchWords, versesBetween } from "./bible";

const en = fakeEnglish();
const ml = fakeMalayalam();

describe("reference search", () => {
  it("finds the examples by full name", () => {
    expect(parseReference(en, "John 3:16")).toEqual({ bookIndex: JOHN, chapter: 3, from: 16, to: 16 });
    expect(parseReference(en, "Genesis 1:1")).toEqual({ bookIndex: GENESIS, chapter: 1, from: 1, to: 1 });
    expect(parseReference(en, "Romans 8:28")).toEqual({ bookIndex: ROMANS, chapter: 8, from: 28, to: 28 });
  });

  it("understands abbreviations, spaces, dots and ranges", () => {
    expect(parseReference(en, "jn 3:16-18")).toEqual({ bookIndex: JOHN, chapter: 3, from: 16, to: 18 });
    expect(parseReference(en, "john 3 16")).toMatchObject({ bookIndex: JOHN, chapter: 3, from: 16 });
    expect(parseReference(en, "Rom 8.28")).toMatchObject({ bookIndex: ROMANS, chapter: 8, from: 28 });
    expect(parseReference(en, "Eph 2")).toEqual({ bookIndex: EPHESIANS, chapter: 2 });
    expect(parseReference(en, "Genesis")).toEqual({ bookIndex: GENESIS, chapter: 1 });
  });

  it("reads a verse number after a single-chapter book", () => {
    expect(parseReference(en, "Jude 2")).toMatchObject({ bookIndex: 64, chapter: 1, from: 2, to: 2 });
  });

  it("finds Malayalam book names", () => {
    expect(parseReference(ml, "യോഹന്നാൻ 3:16")).toMatchObject({ bookIndex: JOHN, chapter: 3, from: 16 });
  });

  it("opens the nearest chapter or verse and says so when the one asked for doesn't exist", () => {
    expect(parseReference(en, "John 30:1")).toMatchObject({ bookIndex: JOHN, chapter: 4, adjusted: "chapter" });
    expect(parseReference(en, "John 30")).toMatchObject({ chapter: 4, adjusted: "chapter" });
    expect(parseReference(en, "John 3:99")).toMatchObject({ chapter: 3, from: 18, to: 18, adjusted: "verse" });
    expect(parseReference(en, "John 3:16")?.adjusted).toBeUndefined();
  });

  it("returns nothing when no book matches", () => {
    expect(parseReference(en, "Zzz 1:1")).toBeNull();
    expect(findBook(en, "faith")).toBe(-1);
  });
});

describe("keyword search", () => {
  it("finds every verse containing the word, with its book, chapter and verse", () => {
    const grace = searchBible(en, "grace");
    expect(grace.hits.map((h) => [h.bookIndex, h.chapter, h.verse])).toEqual([[GENESIS, 2, 3], [EPHESIANS, 2, 8]]);
    expect(grace.hits[1].text).toBe("placeholder grace and faith words");
    expect(searchBible(en, "love").total).toBe(2);
    expect(searchBible(en, "faith").hits.map((h) => h.bookIndex)).toEqual([JOHN, EPHESIANS]);
  });

  it("needs every word, ignores case and counts occurrences", () => {
    expect(searchBible(en, "GRACE faith").hits).toHaveLength(1);
    expect(searchBible(en, "love faith").hits[0]).toMatchObject({ bookIndex: JOHN, chapter: 3, verse: 16, occurrences: 2 });
  });

  it("matches whole words, word starts or anywhere", () => {
    expect(searchBible(en, "plac", { mode: "word" }).total).toBe(0);
    expect(searchBible(en, "plac", { mode: "prefix" }).total).toBe(5);
    expect(searchBible(en, "lace", { mode: "anywhere" }).total).toBe(5);
    expect(searchBible(en, "lace", { mode: "prefix" }).total).toBe(0);
  });

  it("searches Malayalam text", () => {
    expect(searchBible(ml, "സ്നേഹം").hits.map((h) => [h.bookIndex, h.chapter, h.verse])).toEqual([[JOHN, 3, 16]]);
  });

  it("highlights the same words it matched", () => {
    const text = "placeholder grace and faith words";
    expect(matchRanges(text, searchWords("grace"), "word").map(([a, b]) => text.slice(a, b))).toEqual(["grace"]);
  });
});

describe("verses and translations", () => {
  it("returns a selected passage with references", () => {
    expect(getVerses(en, JOHN, 3, 16, 17).map((v) => v.ref)).toEqual(["John 3:16", "John 3:17"]);
    expect(getVerses(en, JOHN, 3, 17, 99)).toHaveLength(2);
  });

  it("keeps verse numbers aligned when a translation lacks a verse", () => {
    const verses = alignedVerses(ml, JOHN, 3, 17, 18);
    expect(verses.map((v) => v.text === "")).toEqual([false, true]);
  });

  it("runs a range into the next chapter", () => {
    expect(versesBetween(en, JOHN, 3, 18, 4, 1).map((v) => v.ref)).toEqual(["John 3:18", "John 4:1"]);
  });

  it("tells English and Malayalam Bibles apart", () => {
    expect(detectBibleLanguage(en)).toBe("en");
    expect(detectBibleLanguage(ml)).toBe("ml");
  });
});

describe("KJV brace markup", () => {
  const marked = () => {
    const b = fakeEnglish();
    b.books[GENESIS].chapters[0][0] = "Blessed {is} the man in whose spirit {there is} no guile. {guile: Heb. deceit}";
    return b;
  };

  it("shows an English Bible's verses as printed, wherever they are read or searched", () => {
    const shown = forDisplay(marked());
    expect(getVerses(shown, GENESIS, 1, 1, 1)[0].text).toBe("Blessed is the man in whose spirit there is no guile.");
    expect(searchBible(shown, "there is").total).toBe(1);
    expect(searchBible(shown, "Heb").total).toBe(0);
    expect(searchBible(shown, "deceit").total).toBe(0);
  });

  it("leaves Bibles without the markup, and Malayalam Bibles, untouched", () => {
    const plain = fakeEnglish();
    expect(forDisplay(plain)).toBe(plain);
    const mal = fakeMalayalam();
    mal.books[GENESIS].chapters[0][0] = "ആദിയിൽ {ദൈവം} ആകാശവും ഭൂമിയും സൃഷ്ടിച്ചു. {x: Heb. y}";
    expect(forDisplay(mal)).toBe(mal);
    expect(mal.books[GENESIS].chapters[0][0]).toBe("ആദിയിൽ {ദൈവം} ആകാശവും ഭൂമിയും സൃഷ്ടിച്ചു. {x: Heb. y}");
  });
});
