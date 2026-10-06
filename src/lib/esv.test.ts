// @vitest-environment jsdom
// The ESV read online. Every "verse" here is made-up placeholder text: VerseLight never contains ESV text,
// and these tests never reach the real ESV API (fetch is a stand-in).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BOOK_NAMES, ensureChapter, ESV_BIBLE_ID, findBook, loadBible, parseReference } from "./bible";
import {
  BOOK_VERSES, CHAPTER_COUNTS, clearEsv, ESV_CACHE_LIMIT, ESV_COPYRIGHT, esvBible, EsvChapterCache, EsvError, fetchEsvChapter,
  isOnlineBible, loadEsvKey, parsePassageText, saveEsvKey, searchEsv, testEsvKey,
} from "./esv";
import { fakeEnglish, JOHN } from "../test/fakeBible";

const PSALMS = 18, OBADIAH = 30, HAGGAI = 36, RUTH = 7;
const fill = (n: number, tag = "v") => Array.from({ length: n }, (_, i) => `${tag} ${i + 1}`);

/** A stand-in for the ESV API: "[1] placeholder … [2] placeholder …" for any chapter, and canned search results. */
function fakeApi(status = 200) {
  return vi.fn(async (url: string, _init?: RequestInit) => {
    const u = new URL(url);
    const q = u.searchParams.get("q") ?? "";
    const body = u.pathname.includes("/search/")
      ? { total_results: 2, results: [{ reference: "John 3:16", content: "placeholder search hit" }, { reference: "Psalm 23:1", content: "placeholder psalm hit" }] }
      : { passages: [`[1] placeholder ${q} one\n\n  [2] placeholder ${q} two [4] placeholder ${q} four`] };
    return { ok: status === 200, status, json: async () => body } as Response;
  });
}

beforeEach(async () => {
  localStorage.clear();
  await clearEsv();
});

describe("ESV text from the API", () => {
  it("splits a passage into verses by number, keeping omitted verses as empty gaps", () => {
    expect(parsePassageText("[1] In one.\n\n  [2] Two,\n    still two. [4] Four.")).toEqual(["In one.", "Two, still two.", "", "Four."]);
    expect(parsePassageText("")).toEqual([]);
  });

  it("fetches one chapter with the key, without headings, footnotes or references, and keeps it in memory", async () => {
    await saveEsvKey("  test-key  ");
    const api = fakeApi();
    const verses = await fetchEsvChapter(JOHN, 3, api as unknown as typeof fetch, new EsvChapterCache());
    expect(verses).toEqual(["placeholder John 3 one", "placeholder John 3 two", "", "placeholder John 3 four"]);
    const [url, init] = api.mock.calls[0];
    const params = new URL(url).searchParams;
    expect(url.startsWith("https://api.esv.org/v3/passage/text/")).toBe(true);
    expect(init?.headers).toEqual({ Authorization: "Token test-key" });
    expect(params.get("q")).toBe("John 3");
    for (const p of ["include-headings", "include-footnotes", "include-passage-references", "include-short-copyright"]) expect(params.get(p)).toBe("false");
  });

  it("asks the API once per chapter while the chapter is in memory", async () => {
    await saveEsvKey("k");
    const api = fakeApi();
    const cache = new EsvChapterCache();
    await fetchEsvChapter(JOHN, 3, api as unknown as typeof fetch, cache);
    await fetchEsvChapter(JOHN, 3, api as unknown as typeof fetch, cache);
    expect(api).toHaveBeenCalledTimes(1);
  });

  it("explains a missing key, a refused key, no internet and throttling", async () => {
    const cache = new EsvChapterCache();
    await expect(fetchEsvChapter(JOHN, 3, fakeApi() as unknown as typeof fetch, cache)).rejects.toThrow(/needs your ESV API key/);
    await saveEsvKey("bad");
    await expect(fetchEsvChapter(JOHN, 3, fakeApi(403) as unknown as typeof fetch, cache)).rejects.toThrow(/key was refused/);
    await expect(fetchEsvChapter(JOHN, 3, fakeApi(429) as unknown as typeof fetch, cache)).rejects.toThrow(/busy/);
    const offline = vi.fn(async () => { throw new TypeError("Failed to fetch"); });
    await expect(fetchEsvChapter(JOHN, 3, offline as unknown as typeof fetch, cache)).rejects.toBeInstanceOf(EsvError);
    expect(cache.size()).toBe(0);
  });

  it("checks a new key without replacing the saved one", async () => {
    await saveEsvKey("saved");
    await expect(testEsvKey("wrong", fakeApi(401) as unknown as typeof fetch)).rejects.toThrow(/refused/);
    expect(await loadEsvKey()).toBe("saved");
  });

  it("searches with the API and maps references to books (Psalm → Psalms)", async () => {
    await saveEsvKey("k");
    const { hits, total } = await searchEsv("placeholder", fakeApi() as unknown as typeof fetch);
    expect(total).toBe(2);
    expect(hits.map((h) => [h.bookIndex, h.chapter, h.verse])).toEqual([[JOHN, 3, 16], [PSALMS, 23, 1]]);
  });
});

describe("Crossway's storage limits", () => {
  it("never holds more than 500 verses, dropping the least recently used chapters", () => {
    const cache = new EsvChapterCache();
    for (let c = 1; c <= 30; c++) cache.put(PSALMS, c, fill(30)); // Psalms is long enough that only the 500 limit applies
    expect(cache.size()).toBeLessThanOrEqual(ESV_CACHE_LIMIT);
    expect(cache.get(PSALMS, 30)).toBeDefined();
    expect(cache.get(PSALMS, 1)).toBeUndefined();
  });

  it("keeps a chapter that was read again, since it is the most recently used", () => {
    const cache = new EsvChapterCache(100);
    cache.put(PSALMS, 1, fill(40));
    cache.put(PSALMS, 2, fill(40));
    cache.get(PSALMS, 1);
    cache.put(PSALMS, 3, fill(40));
    expect(cache.get(PSALMS, 1)).toBeDefined();
    expect(cache.get(PSALMS, 2)).toBeUndefined();
  });

  it("never holds more than half of a book", () => {
    const cache = new EsvChapterCache();
    for (let c = 1; c <= 4; c++) cache.put(RUTH, c, fill(22));
    expect(cache.bookSize(RUTH)).toBeLessThanOrEqual(Math.floor(BOOK_VERSES[RUTH] / 2));
  });

  it("holds one chapter at most of a one- or two-chapter book", () => {
    const cache = new EsvChapterCache();
    cache.put(HAGGAI, 1, fill(15));
    cache.put(HAGGAI, 2, fill(23));
    expect(cache.entries().filter(([b]) => b === HAGGAI).map(([, c]) => c)).toEqual([2]);
    cache.put(OBADIAH, 1, fill(21));
    expect(cache.get(OBADIAH, 1)).toHaveLength(21);
  });

  it("forgets the key and every verse when the ESV is removed", async () => {
    await saveEsvKey("k");
    await fetchEsvChapter(JOHN, 3, fakeApi() as unknown as typeof fetch);
    await clearEsv();
    expect(await loadEsvKey()).toBeNull();
    expect(esvBible().books[JOHN].chapters[2]).toEqual([]);
    expect(localStorage.getItem("verselight:esv-api-key.json")).toBeNull();
  });
});

describe("the ESV as a Bible", () => {
  it("has all 66 books and 1,189 chapters, and no text until a chapter is fetched", async () => {
    expect(CHAPTER_COUNTS).toHaveLength(66);
    expect(CHAPTER_COUNTS.reduce((a, b) => a + b)).toBe(1189);
    expect(BOOK_VERSES.reduce((a, b) => a + b)).toBe(31102);
    const esv = (await loadBible(ESV_BIBLE_ID))!;
    expect(isOnlineBible(esv)).toBe(true);
    expect(esv).toMatchObject({ abbreviation: "ESV", license: ESV_COPYRIGHT });
    expect(esv.books.map((b) => b.name)).toEqual(BOOK_NAMES);
    expect(esv.books[JOHN].chapters).toHaveLength(21);
    expect(esv.books.every((b) => b.chapters.every((c) => c.length === 0))).toBe(true);
  });

  it("parses references before the chapter is fetched, without losing the verse", async () => {
    const esv = (await loadBible(ESV_BIBLE_ID))!;
    expect(parseReference(esv, "John 3:16-18")).toEqual({ bookIndex: JOHN, chapter: 3, from: 16, to: 18 });
    expect(parseReference(esv, "jn 30")).toMatchObject({ chapter: 21, adjusted: "chapter" });
    expect(findBook(esv, "Ps")).toBe(PSALMS);
  });

  it("ensureChapter fetches an ESV chapter but leaves an imported Bible exactly as it was", async () => {
    const kjvLike = fakeEnglish();
    expect(await ensureChapter(kjvLike, JOHN, 3)).toBe(kjvLike);
    await saveEsvKey("k");
    const real = globalThis.fetch;
    globalThis.fetch = fakeApi() as unknown as typeof fetch;
    try {
      const esv = await ensureChapter((await loadBible(ESV_BIBLE_ID))!, JOHN, 3);
      expect(esv.books[JOHN].chapters[2][0]).toBe("placeholder John 3 one");
    } finally {
      globalThis.fetch = real;
    }
  });

  it("keeps the API key out of the library file", async () => {
    await saveEsvKey("secret-key");
    expect(localStorage.getItem("verselight:esv-api-key.json")).toContain("secret-key");
    expect(localStorage.getItem("verselight:library.json")).toBeNull();
  });
});
