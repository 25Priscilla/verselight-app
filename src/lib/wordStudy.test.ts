import { describe, expect, it } from "vitest";
import { fakeEnglish, EPHESIANS, GENESIS, JOHN } from "../test/fakeBible";
import { searchBible } from "./bible";
import { originalLanguage, registerLexicalSource, summarizeHits } from "./wordStudy";

const en = fakeEnglish();

describe("word study", () => {
  it("counts a word's occurrences, verses, books and testaments", () => {
    const { hits } = searchBible(en, "faith", { limit: Infinity, mode: "word" });
    expect(summarizeHits(hits, true)).toMatchObject({
      occurrences: 2, verses: 2, books: 2, oldTestament: 0, newTestament: 2,
      first: { bookIndex: JOHN, chapter: 3, verse: 16 }, last: { bookIndex: EPHESIANS, chapter: 2, verse: 8 },
    });
    const grace = summarizeHits(searchBible(en, "grace", { limit: Infinity }).hits, true);
    expect(grace).toMatchObject({ oldTestament: 1, newTestament: 1, first: { bookIndex: GENESIS } });
  });

  it("names the book where a word is most frequent", () => {
    const { hits } = searchBible(en, "placeholder", { limit: Infinity });
    expect(summarizeHits(hits, true).topBook).toEqual({ book: GENESIS, verses: 2 });
  });

  it("doesn't split testaments for a Bible without the standard 66 books", () => {
    const { hits } = searchBible(en, "faith", { limit: Infinity });
    expect(summarizeHits(hits, false)).toMatchObject({ oldTestament: 0, newTestament: 0, verses: 2 });
    expect(summarizeHits([], true)).toMatchObject({ verses: 0, first: null, topBook: null });
  });

  it("reports that no Hebrew or Greek data is installed, and shows only what a real dataset supplies", () => {
    expect(originalLanguage("grace")).toEqual({ available: false, entries: [] });
    const entry = { language: "greek" as const, lemma: "λέξις", transliteration: "lexis", strongs: "G0000", definition: "test entry", source: "Test data" };
    registerLexicalSource({ name: "Test", lookup: (w) => (w === "grace" ? [entry] : []) });
    expect(originalLanguage("grace")).toEqual({ available: true, entries: [entry] });
    expect(originalLanguage("love")).toEqual({ available: true, entries: [] });
  });
});
