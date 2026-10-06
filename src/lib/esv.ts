/**
 * The ESV (English Standard Version), read online from Crossway's ESV API (https://api.esv.org).
 *
 * The ESV is copyrighted by Crossway, so VerseLight contains no ESV text and never saves any to disk. Each church
 * uses its own free API key (for non-commercial church use), which is kept on this computer only, outside the
 * library and its backups. Chapters are fetched as they are read or presented, and only a few are kept in memory,
 * within Crossway's terms (https://api.esv.org/#conditions):
 *  - "You may not locally store more than 500 verses or one-half of any book of the Bible (whichever is less)."
 *  - "You may request up to 500 verses per query, or half a book, whichever is less (excepting single-chapter and
 *    double-chapter books)." One chapter per query is always within this.
 *  - "Each page on which you use the text must include a link to www.esv.org", plus the copyright notice and "ESV".
 * A licensed ESV file (from Crossway, by written permission) can instead be imported like any other Bible file.
 */
import { BOOK_NAMES, type BibleData } from "./bible";
import { deleteData, readData, writeData } from "./storage";

export const ESV_SOURCE = "esv-api";
export const ESV_NAME = "English Standard Version";
export const ESV_ABBREVIATION = "ESV";
export const ESV_SITE_URL = "https://www.esv.org";
export const ESV_TERMS_URL = "https://api.esv.org/#conditions";
export const ESV_KEY_URL = "https://api.esv.org/account/create-application/";
export const ESV_API_URL = "https://api.esv.org/v3/passage/";
/** Crossway's standard notice, word for word, from the ESV API terms. */
export const ESV_COPYRIGHT =
  "Scripture quotations are from the ESV® Bible (The Holy Bible, English Standard Version®), © 2001 by Crossway, " +
  "a publishing ministry of Good News Publishers. Used by permission. All rights reserved.";

/** The most verses kept in memory at once (Crossway's limit). */
export const ESV_CACHE_LIMIT = 500;

/** Chapters in each book (standard 66-book order). */
export const CHAPTER_COUNTS = [
  50, 40, 27, 36, 34, 24, 21, 4, 31, 24, 22, 25, 29, 36, 10, 13, 10, 42, 150, 31, 12, 8, 66, 52, 5, 48, 12, 14, 3, 9, 1, 4, 7,
  3, 3, 3, 2, 14, 4, 28, 16, 24, 21, 28, 16, 16, 13, 6, 6, 4, 4, 5, 3, 6, 4, 3, 1, 13, 5, 5, 3, 5, 1, 1, 1, 22,
];

/** Verses in each book (standard English numbering), for the "one-half of any book" storage limit. */
export const BOOK_VERSES = [
  1533, 1213, 859, 1288, 959, 658, 618, 85, 810, 695, 816, 719, 942, 822, 280, 406, 167, 1070, 2461, 915, 222, 117, 1292,
  1364, 154, 1273, 357, 197, 73, 146, 21, 48, 105, 47, 56, 53, 38, 211, 55, 1071, 678, 1151, 879, 1007, 433, 437, 257,
  149, 155, 104, 95, 89, 47, 113, 83, 46, 25, 303, 108, 105, 61, 105, 13, 14, 25, 404,
];

/** A problem reaching the ESV, worded for the operator. */
export class EsvError extends Error {}

export const isOnlineBible = (bible: Pick<BibleData, "source"> | null | undefined) => bible?.source === ESV_SOURCE;

// ---------- the API key (kept on this computer only, never in the library or a backup) ----------

const KEY_FILE = "esv-api-key.json";
let keyCache: string | null | undefined;

export async function loadEsvKey(): Promise<string | null> {
  if (keyCache !== undefined) return keyCache;
  const raw = await readData(KEY_FILE).catch(() => null);
  try {
    keyCache = raw ? String((JSON.parse(raw) as { key?: unknown }).key ?? "") || null : null;
  } catch {
    keyCache = null;
  }
  return keyCache;
}

export async function saveEsvKey(key: string): Promise<void> {
  await writeData(KEY_FILE, JSON.stringify({ key: key.trim() }));
  keyCache = key.trim();
}

/** Forgets the key and every ESV verse held in memory. */
export async function clearEsv(): Promise<void> {
  await deleteData(KEY_FILE).catch(() => undefined);
  keyCache = null;
  esvCache.clear();
}

// ---------- the in-memory chapter cache ----------

/**
 * The ESV chapters held in memory, least recently used first. Adding a chapter drops the oldest ones until it fits
 * both limits: 500 verses in all, and no more than half of any book. Single- and two-chapter books, which Crossway
 * allows to be fetched a chapter at a time, keep one chapter at most.
 */
export class EsvChapterCache {
  private chapters = new Map<string, { book: number; verses: string[] }>();
  constructor(private limit = ESV_CACHE_LIMIT) {}

  get(book: number, chapter: number): string[] | undefined {
    const key = `${book}.${chapter}`;
    const hit = this.chapters.get(key);
    if (hit) { this.chapters.delete(key); this.chapters.set(key, hit); } // most recently used
    return hit?.verses;
  }

  put(book: number, chapter: number, verses: string[]) {
    const key = `${book}.${chapter}`;
    this.chapters.delete(key);
    const size = count(verses);
    const shortBook = CHAPTER_COUNTS[book] <= 2;
    const bookLimit = Math.floor(BOOK_VERSES[book] / 2);
    for (const [k, c] of [...this.chapters]) {
      const sameBook = c.book === book;
      const over = this.size() + size > this.limit || (sameBook && (shortBook || this.bookSize(book) + size > bookLimit));
      if (over) this.chapters.delete(k);
    }
    this.chapters.set(key, { book, verses });
  }

  /** Verses held, in all or for one book (verses the ESV omits, kept as empty slots, don't count). */
  size(): number { return [...this.chapters.values()].reduce((n, c) => n + count(c.verses), 0); }
  bookSize(book: number): number {
    return [...this.chapters.values()].filter((c) => c.book === book).reduce((n, c) => n + count(c.verses), 0);
  }
  entries(): [number, number, string[]][] {
    return [...this.chapters].map(([k, c]) => { const [b, ch] = k.split(".").map(Number); return [b, ch, c.verses]; });
  }
  clear() { this.chapters.clear(); }
}
const count = (verses: string[]) => verses.filter(Boolean).length;

const esvCache = new EsvChapterCache();

/** The ESV as VerseLight reads it: every book and chapter, with text only for the chapters held in memory. */
export function esvBible(cache = esvCache): BibleData {
  const books: BibleData["books"] = BOOK_NAMES.map((name, i) => ({ name, chapters: Array.from({ length: CHAPTER_COUNTS[i] }, () => []) }));
  for (const [b, c, verses] of cache.entries()) books[b].chapters[c - 1] = verses;
  return { format: "verselight-bible", name: ESV_NAME, abbreviation: ESV_ABBREVIATION, license: ESV_COPYRIGHT, source: ESV_SOURCE, books };
}

// ---------- the API ----------

type Fetch = typeof fetch;

async function call(path: string, params: Record<string, string>, fetchImpl: Fetch): Promise<unknown> {
  const key = await loadEsvKey();
  if (!key) throw new EsvError("The ESV needs your ESV API key. Add it under Settings → Bibles → Import a Bible.");
  let res: Response;
  try {
    res = await fetchImpl(`${ESV_API_URL}${path}/?${new URLSearchParams(params)}`, { headers: { Authorization: `Token ${key}` } });
  } catch {
    throw new EsvError("The ESV couldn't be reached. It is read online, so this computer needs an internet connection.");
  }
  if (res.status === 401 || res.status === 403) throw new EsvError("The ESV API key was refused. Check it under Settings → Bibles → Import a Bible.");
  if (res.status === 429) throw new EsvError("The ESV API is busy (too many requests). Wait a minute and try again.");
  if (!res.ok) throw new EsvError(`The ESV API couldn't give that passage (error ${res.status}).`);
  return res.json();
}

/**
 * Plain verse text from the API's "[1] In the beginning… [2] The earth…" layout. A verse the ESV omits
 * (such as Matthew 17:21, given only in a footnote) keeps its number with empty text, so later verses stay in place.
 */
export function parsePassageText(passage: string): string[] {
  const verses: string[] = [];
  const parts = passage.split(/\[(\d+)\]/);
  for (let i = 1; i < parts.length; i += 2) {
    const n = Number(parts[i]);
    const text = parts[i + 1].replace(/\s+/g, " ").trim();
    while (verses.length < n - 1) verses.push("");
    verses[n - 1] = verses[n - 1] ? `${verses[n - 1]} ${text}` : text;
  }
  return verses;
}

/** One chapter's verses, from memory or from the API. */
export async function fetchEsvChapter(book: number, chapter: number, fetchImpl: Fetch = fetch, cache = esvCache): Promise<string[]> {
  const hit = cache.get(book, chapter);
  if (hit) return hit;
  const json = (await call("text", {
    q: `${BOOK_NAMES[book]} ${chapter}`,
    "include-passage-references": "false",
    "include-verse-numbers": "true",
    "include-first-verse-numbers": "true",
    "include-footnotes": "false",
    "include-headings": "false",
    "include-short-copyright": "false",
    "include-copyright": "false",
    "include-passage-horizontal-lines": "false",
    "include-heading-horizontal-lines": "false",
    "include-selahs": "true",
    "indent-paragraphs": "0",
    "indent-poetry": "false",
    "indent-declares": "0",
    "indent-psalm-doxology": "0",
  }, fetchImpl)) as { passages?: string[] };
  const verses = parsePassageText((json.passages ?? []).join(" "));
  if (!verses.length) throw new EsvError(`The ESV API sent no verses for ${BOOK_NAMES[book]} ${chapter}.`);
  cache.put(book, chapter, verses);
  return verses;
}

export interface EsvSearchHit { bookIndex: number; chapter: number; verse: number; text: string; occurrences: number }

/** A keyword search, done by the ESV API (the full text isn't on this computer to search). First 100 verses. */
export async function searchEsv(query: string, fetchImpl: Fetch = fetch): Promise<{ hits: EsvSearchHit[]; total: number }> {
  const json = (await call("search", { q: query, "page-size": "100" }, fetchImpl)) as {
    total_results?: number; results?: { reference: string; content: string }[];
  };
  const hits: EsvSearchHit[] = [];
  for (const r of json.results ?? []) {
    const m = r.reference.match(/^(.+?) (\d+):(\d+)/);
    const bookIndex = m ? BOOK_NAMES.findIndex((n) => n.toLowerCase() === m[1].toLowerCase().replace(/^psalm$/, "psalms")) : -1;
    if (m && bookIndex >= 0) hits.push({ bookIndex, chapter: Number(m[2]), verse: Number(m[3]), text: r.content.trim(), occurrences: 1 });
  }
  return { hits, total: json.total_results ?? hits.length };
}

/** Checks a key with a one-verse request before it is saved. */
export async function testEsvKey(key: string, fetchImpl: Fetch = fetch): Promise<void> {
  const saved = keyCache;
  keyCache = key.trim();
  try {
    await call("text", { q: "John 1:1", "include-short-copyright": "false" }, fetchImpl);
  } finally {
    keyCache = saved;
  }
}
