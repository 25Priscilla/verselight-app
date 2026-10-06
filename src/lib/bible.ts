/**
 * Bible file import. VerseLight never generates or edits Bible text:
 * every verse shown comes from a file the user imports, stored as-is.
 * The one exception is display: the KJV brace markup (italic supplied words, margin notes) is
 * tidied when a Bible is loaded; see kjvText.ts. The stored file is unchanged.
 */
import { ESV_SOURCE, esvBible, fetchEsvChapter, isOnlineBible } from "./esv";
import { newId } from "./id";
import { cleanKjvVerse, hasKjvMarkup } from "./kjvText";
import { hasMalayalam, searchKey } from "./malayalam";
import { readData, writeData } from "./storage";
import type { BibleMeta, ScriptureVerse } from "./types";

export const BOOK_NAMES = [
  "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy", "Joshua", "Judges", "Ruth",
  "1 Samuel", "2 Samuel", "1 Kings", "2 Kings", "1 Chronicles", "2 Chronicles", "Ezra",
  "Nehemiah", "Esther", "Job", "Psalms", "Proverbs", "Ecclesiastes", "Song of Solomon",
  "Isaiah", "Jeremiah", "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel", "Amos",
  "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah", "Haggai", "Zechariah",
  "Malachi", "Matthew", "Mark", "Luke", "John", "Acts", "Romans", "1 Corinthians",
  "2 Corinthians", "Galatians", "Ephesians", "Philippians", "Colossians", "1 Thessalonians",
  "2 Thessalonians", "1 Timothy", "2 Timothy", "Titus", "Philemon", "Hebrews", "James",
  "1 Peter", "2 Peter", "1 John", "2 John", "3 John", "Jude", "Revelation",
];

/** Normalized form stored on disk. chapters[c][v] = verse text. */
export interface BibleData {
  format: "verselight-bible";
  name: string;
  abbreviation: string;
  license: string;
  books: { name: string; chapters: string[][] }[];
  /**
   * Only for a Bible read online (the ESV, see esv.ts): never saved, and only the chapters held in memory have text.
   * Absent for every imported Bible file.
   */
  source?: typeof ESV_SOURCE;
}

type Unknown = Record<string, unknown>;
const isObj = (v: unknown): v is Unknown => typeof v === "object" && v !== null && !Array.isArray(v);
const isStrMatrix = (v: unknown): v is string[][] =>
  Array.isArray(v) && v.every((c) => Array.isArray(c) && c.every((x) => typeof x === "string"));

/**
 * Accepts:
 *  1. VerseLight format (above)
 *  2. [{ name?, abbrev?, chapters: string[][] }, ...]  (common open-data layout)
 *  3. { books: [{ name, chapters: [{ verses: [{ verse, text }] }] }] }
 */
export function parseBibleFile(raw: string): Omit<BibleData, "license"> & { license: string } {
  const json: unknown = JSON.parse(raw.replace(/^\uFEFF/, ""));

  const toBooks = (list: unknown[]): BibleData["books"] =>
    list.map((b, i) => {
      if (!isObj(b)) throw new Error(`Book ${i + 1} is not an object.`);
      const name = typeof b.name === "string" && b.name ? b.name : BOOK_NAMES[i] ?? `Book ${i + 1}`;
      const ch = b.chapters;
      if (isStrMatrix(ch)) return { name, chapters: ch };
      if (Array.isArray(ch)) {
        return {
          name,
          chapters: ch.map((c, ci) => {
            const verses = isObj(c) ? c.verses : undefined;
            if (!Array.isArray(verses)) throw new Error(`${name} chapter ${ci + 1} has no verses.`);
            return verses.map((v) => (isObj(v) && typeof v.text === "string" ? v.text : String(v)));
          }),
        };
      }
      throw new Error(`${name} has no chapters.`);
    });

  if (isObj(json) && json.format === "verselight-bible" && Array.isArray(json.books)) {
    return {
      format: "verselight-bible",
      name: String(json.name ?? "Imported Bible"),
      abbreviation: String(json.abbreviation ?? ""),
      license: String(json.license ?? ""),
      books: toBooks(json.books),
    };
  }
  if (Array.isArray(json)) {
    return { format: "verselight-bible", name: "", abbreviation: "", license: "", books: toBooks(json) };
  }
  if (isObj(json) && Array.isArray(json.books)) {
    return {
      format: "verselight-bible",
      name: String(json.name ?? json.translation ?? ""),
      abbreviation: String(json.abbreviation ?? ""),
      license: String(json.license ?? json.copyright ?? ""),
      books: toBooks(json.books),
    };
  }
  throw new Error("This file isn't a Bible format VerseLight recognizes. See README for supported formats.");
}

const fileName = (id: string) => `bible-${id}.json`;
const cache = new Map<string, BibleData>();

/**
 * The Bible as it is shown: English Bibles with KJV brace markup read as printed
 * ("Blessed is the man", not "Blessed {is} the man"). Other Bibles, including Malayalam, are untouched.
 */
export function forDisplay(data: BibleData): BibleData {
  if (detectBibleLanguage(data) !== "en" || !hasKjvMarkup(data.books)) return data;
  return { ...data, books: data.books.map((b) => ({ ...b, chapters: b.chapters.map((c) => c.map(cleanKjvVerse)) })) };
}

export async function saveBible(data: BibleData): Promise<BibleMeta> {
  const id = newId();
  await writeData(fileName(id), JSON.stringify(data));
  cache.set(id, forDisplay(data));
  return {
    id,
    name: data.name,
    abbreviation: data.abbreviation,
    license: data.license,
    language: detectBibleLanguage(data),
    bookCount: data.books.length,
    importedAt: Date.now(),
  };
}

/** The library id of the ESV read online. Imported Bible files have random ids, so they never clash with it. */
export const ESV_BIBLE_ID = ESV_SOURCE;

export async function loadBible(id: string): Promise<BibleData | null> {
  if (id === ESV_BIBLE_ID) return esvBible();
  const hit = cache.get(id);
  if (hit) return hit;
  const raw = await readData(fileName(id));
  if (!raw) return null;
  const data = forDisplay(JSON.parse(raw) as BibleData);
  cache.set(id, data);
  return data;
}

export const bibleFileName = fileName;

/**
 * The Bible with this chapter's text in it. An imported Bible already has every chapter, so it comes back unchanged
 * (the same object). The ESV fetches the chapter if it isn't in memory and returns a fresh copy that includes it.
 */
export async function ensureChapter(bible: BibleData, bookIndex: number, chapter: number): Promise<BibleData> {
  if (!isOnlineBible(bible) || !bible.books[bookIndex]?.chapters[chapter - 1]) return bible;
  await fetchEsvChapter(bookIndex, chapter);
  return esvBible();
}

export function getVerses(
  bible: BibleData,
  bookIndex: number,
  chapter: number,
  from: number,
  to: number,
): ScriptureVerse[] {
  const book = bible.books[bookIndex];
  const verses = book?.chapters[chapter - 1] ?? [];
  const out: ScriptureVerse[] = [];
  for (let v = from; v <= Math.min(to, verses.length); v++) {
    out.push({ ref: `${book.name} ${chapter}:${v}`, text: verses[v - 1] });
  }
  return out;
}

// ---------- reference parsing ----------

/** Book-name key: lower case, letters/marks/digits only in any script, Malayalam spellings normalised. */
const norm = (s: string) => searchKey(s).replace(/\s+/g, "");

/** Common abbreviations -> canonical book index (standard 66-book order). */
const ALIASES: Record<string, number> = {};
[
  [0, "gen ge gn"], [1, "ex exo exod"], [2, "lev lv"], [3, "num nm nb"], [4, "deut dt de"],
  [5, "josh jos"], [6, "judg jdg jg"], [7, "ruth rth ru"], [8, "1sam 1sa 1s"], [9, "2sam 2sa 2s"],
  [10, "1kgs 1ki 1k"], [11, "2kgs 2ki 2k"], [12, "1chr 1ch"], [13, "2chr 2ch"], [14, "ezr"],
  [15, "neh ne"], [16, "est esth"], [17, "jb"], [18, "ps psa pss psalm"], [19, "prov prv pr"],
  [20, "eccl ecc qoh"], [21, "song sos sng songofsongs canticles"], [22, "isa is"], [23, "jer je"],
  [24, "lam la"], [25, "ezek eze ezk"], [26, "dan dn da"], [27, "hos ho"], [28, "jl"], [29, "am"],
  [30, "obad ob"], [31, "jon jnh"], [32, "mic mi"], [33, "nah na"], [34, "hab hb"], [35, "zeph zep"],
  [36, "hag hg"], [37, "zech zec"], [38, "mal ml"], [39, "mt matt"], [40, "mk mrk mr"], [41, "lk luk"],
  [42, "jn jhn joh"], [43, "ac"], [44, "rom rm ro"], [45, "1cor 1co"], [46, "2cor 2co"], [47, "gal ga"],
  [48, "eph ep"], [49, "phil php pp"], [50, "col"], [51, "1thess 1th"], [52, "2thess 2th"],
  [53, "1tim 1ti 1tm"], [54, "2tim 2ti 2tm"], [55, "tit"], [56, "phlm phm philem"], [57, "heb"],
  [58, "jas jm"], [59, "1pet 1pe 1pt"], [60, "2pet 2pe 2pt"], [61, "1jn 1jo 1jhn"], [62, "2jn 2jo 2jhn"],
  [63, "3jn 3jo 3jhn"], [64, "jud jd"], [65, "rev re rv revelations"],
].forEach(([i, list]) => (list as string).split(" ").forEach((a) => (ALIASES[a] = i as number)));

export function findBook(bible: BibleData, query: string): number {
  const q = norm(query.replace(/^(i{1,3})\s+/i, (m) => String(m.trim().length) + " "));
  if (!q) return -1;
  const names = bible.books.map((b, i) => [norm(b.name), bible.books.length === 66 ? norm(BOOK_NAMES[i]) : ""]);
  let hit = names.findIndex((n) => n.includes(q));
  if (hit >= 0) return hit;
  hit = names.findIndex((n) => n.some((x) => x && x.startsWith(q)));
  if (hit >= 0) return hit;
  if (q in ALIASES && ALIASES[q] < bible.books.length) return ALIASES[q];
  // Letters in order, same first character: "jhn" -> John
  const subseq = (name: string) => {
    if (!name || name[0] !== q[0]) return false;
    let j = 0;
    for (const c of name) if (c === q[j]) j++;
    return j === q.length;
  };
  return names.findIndex((n) => n.some(subseq));
}

export interface ParsedRef {
  bookIndex: number;
  chapter: number;
  from?: number;
  to?: number;
  /** Set when the chapter or verse asked for doesn't exist in this Bible and the nearest one was used */
  adjusted?: "chapter" | "verse";
}

/** "john 3:16-18", "john 3 16", "1 cor 13", "ps 23:1", "jude 3", "Genesis" */
export function parseReference(bible: BibleData, input: string): ParsedRef | null {
  const m = input
    .trim()
    .match(/^((?:[1-3]\.?|i{1,3})?\s*[\p{L}\p{M}][\p{L}\p{M} .]*?)\s*(?:(\d+)(?:(?:\s*[:.]\s*|\s+)(\d+))?(?:\s*[-–]\s*(\d+))?)?$/iu);
  if (!m) return null;
  const bookIndex = findBook(bible, m[1]);
  if (bookIndex < 0) return null;
  const book = bible.books[bookIndex];
  let [chapterStr, fromStr, toStr]: (string | undefined)[] = [m[2], m[3], m[4]];
  // Single-chapter books are cited by verse: "Jude 3" means Jude 1:3.
  if (book.chapters.length === 1 && chapterStr && !fromStr) {
    [chapterStr, fromStr] = ["1", chapterStr];
  } else if (!fromStr) {
    toStr = undefined; // "Ps 23-24" opens Psalm 23
  }
  const asked = Number(chapterStr ?? 1);
  const chapter = Math.min(Math.max(1, asked), book.chapters.length);
  // An online chapter not fetched yet has no verse count to check against.
  const count = book.chapters[chapter - 1]?.length || (isOnlineBible(bible) ? Infinity : 0);
  const adjusted = chapter !== asked ? { adjusted: "chapter" as const } : {};
  if (!fromStr) return { bookIndex, chapter, ...adjusted };
  const from = Math.min(Math.max(1, Number(fromStr)), count);
  const to = Math.min(Math.max(from, Number(toStr ?? fromStr)), count);
  return { bookIndex, chapter, from, to, ...(chapter !== asked ? adjusted : from !== Number(fromStr) ? { adjusted: "verse" as const } : {}) };
}

// ---------- keyword search ----------

export interface SearchHit {
  bookIndex: number;
  chapter: number;
  verse: number;
  text: string;
  /** How many times the search words appear in this verse */
  occurrences: number;
}

/**
 * How a search word must match a word in the verse:
 *  - "anywhere": inside any word ("grace" also finds "disgrace"); the Bible keyword search
 *  - "word": the whole word only ("grace", not "graces" or "disgrace")
 *  - "prefix": words that start with it ("grace" finds "grace" and "graces"; useful for Malayalam,
 *    where endings are joined to the word: കൃപ finds കൃപയാൽ)
 */
export type MatchMode = "anywhere" | "word" | "prefix";

export interface SearchOptions {
  /** Stop collecting hits after this many (the total is still counted). Default 300. */
  limit?: number;
  mode?: MatchMode;
}

const searchIndex = new WeakMap<BibleData, string[][][]>();
/** Normalised copy of every verse for searching (built once per Bible). Malayalam spellings match however they were typed. */
function indexFor(bible: BibleData): string[][][] {
  let idx = searchIndex.get(bible);
  if (!idx) {
    // Padded with spaces so whole-word and word-start checks are simple substring tests.
    idx = bible.books.map((b) => b.chapters.map((c) => c.map((t) => ` ${searchKey(t)} `)));
    searchIndex.set(bible, idx);
  }
  return idx;
}

/** Normalised search words for a query. */
export const searchWords = (query: string) => searchKey(query).split(" ").filter(Boolean);

function countIn(key: string, word: string, mode: MatchMode): number {
  const needle = mode === "word" ? ` ${word} ` : mode === "prefix" ? ` ${word}` : word;
  let n = 0;
  // A whole word shares its trailing space with the next word, so step back one after each hit.
  for (let i = key.indexOf(needle); i !== -1; i = key.indexOf(needle, i + Math.max(1, needle.length - 1))) n++;
  return n;
}

/**
 * Every word of the query must appear (case-insensitive, Malayalam spellings normalised).
 * Returns the total number of matching verses, the total occurrences, and up to `limit` hits.
 */
export function searchBible(bible: BibleData, query: string, options: number | SearchOptions = {}): { hits: SearchHit[]; total: number; occurrences: number } {
  const { limit = 300, mode = "anywhere" } = typeof options === "number" ? { limit: options } : options;
  const words = searchWords(query);
  const hits: SearchHit[] = [];
  let total = 0;
  let occurrences = 0;
  if (!words.length) return { hits, total, occurrences };
  const idx = indexFor(bible);
  bible.books.forEach((book, bookIndex) =>
    book.chapters.forEach((verses, c) =>
      verses.forEach((text, v) => {
        const key = idx[bookIndex][c][v];
        let count = 0;
        for (const w of words) {
          const n = countIn(key, w, mode);
          if (n === 0) return;
          count += n;
        }
        total++;
        occurrences += count;
        if (hits.length < limit) hits.push({ bookIndex, chapter: c + 1, verse: v + 1, text, occurrences: count });
      }),
    ),
  );
  return { hits, total, occurrences };
}

/**
 * Where the search words appear in a verse's original text, as [start, end) character ranges,
 * using the same normalisation and match mode as searchBible, so highlights always agree with results.
 */
export function matchRanges(text: string, words: string[], mode: MatchMode): [number, number][] {
  if (!words.length) return [];
  const ranges: [number, number][] = [];
  // Tokens keep joiners (ZWJ/ZWNJ) so Malayalam words are not split in two.
  for (const m of text.matchAll(/[\p{L}\p{M}\p{N}\u200C\u200D]+/gu)) {
    const token = m[0];
    const key = searchKey(token).replace(/ /g, "");
    const start = m.index ?? 0;
    for (const w of words) {
      if (mode === "word" ? key === w : mode === "prefix" ? key.startsWith(w) : key.includes(w)) {
        if (mode === "anywhere" && key !== w) {
          // Highlight just the matching part when it can be located in the original spelling.
          const at = token.toLowerCase().indexOf(w);
          ranges.push(at >= 0 ? [start + at, start + at + w.length] : [start, start + token.length]);
        } else ranges.push([start, start + token.length]);
        break;
      }
    }
  }
  return ranges;
}

/** "ml" when the Bible's text is in Malayalam script, otherwise "en". */
export function detectBibleLanguage(bible: BibleData): "en" | "ml" {
  const sample = bible.books.slice(0, 3).flatMap((b) => b.chapters[0] ?? []).slice(0, 20).join(" ") + bible.name;
  return hasMalayalam(sample) ? "ml" : "en";
}

/** A Bible's language: recorded at import, or guessed from its name until the text is loaded. */
export function bibleLang(meta: { language?: "en" | "ml"; name: string; abbreviation: string } | undefined): "en" | "ml" {
  if (!meta) return "en";
  return meta.language ?? (hasMalayalam(meta.name + meta.abbreviation) || /^mal/i.test(meta.abbreviation) ? "ml" : "en");
}

/** Verses from..to by number, keeping an entry (with empty text) for numbers this Bible doesn't have. */
export function alignedVerses(bible: BibleData, bookIndex: number, chapter: number, from: number, to: number): ScriptureVerse[] {
  const book = bible.books[bookIndex];
  const verses = book?.chapters[chapter - 1] ?? [];
  const out: ScriptureVerse[] = [];
  for (let v = from; v <= to; v++) out.push({ ref: `${book?.name ?? ""} ${chapter}:${v}`, text: verses[v - 1] ?? "" });
  return out;
}

/** Verses from c1:v1 to c2:v2 within one book (a range may run into the next chapter). */
export function versesBetween(bible: BibleData, bookIndex: number, c1: number, v1: number, c2: number, v2: number) {
  const book = bible.books[bookIndex];
  const out: { chapter: number; verse: number; ref: string; text: string }[] = [];
  if (!book) return out;
  for (let c = c1; c <= Math.min(c2, book.chapters.length); c++) {
    const verses = book.chapters[c - 1] ?? [];
    const first = c === c1 ? v1 : 1;
    const last = c === c2 ? Math.min(v2, verses.length) : verses.length;
    for (let v = first; v <= last; v++) out.push({ chapter: c, verse: v, ref: `${book.name} ${c}:${v}`, text: verses[v - 1] ?? "" });
  }
  return out;
}
