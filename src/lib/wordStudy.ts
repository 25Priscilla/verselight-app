/**
 * Word Study facts, counted only from the Bible text the user imported.
 *
 * Original-language information (Hebrew or Greek word, transliteration, Strong's number, definition)
 * needs a tagged lexical dataset. VerseLight doesn't include one, so `originalLanguage` reports what is
 * available and the screen says plainly that it isn't. A future dataset only has to supply `LexicalEntry`
 * records through a `LexicalSource`; nothing is ever guessed from the English or Malayalam text.
 */
import type { SearchHit } from "./bible";

export interface WordSummary {
  occurrences: number;
  verses: number;
  books: number;
  /** Verses in the Old Testament (books 1–39) and New Testament (40–66) of a standard 66-book Bible */
  oldTestament: number;
  newTestament: number;
  first: SearchHit | null;
  last: SearchHit | null;
  /** The book with the most matching verses */
  topBook: { book: number; verses: number } | null;
}

/** Counts for a complete list of search hits (searchBible with limit: Infinity). */
export function summarizeHits(hits: SearchHit[], canonical: boolean): WordSummary {
  const perBook = new Map<number, number>();
  let occurrences = 0, oldTestament = 0, newTestament = 0;
  for (const h of hits) {
    occurrences += h.occurrences;
    perBook.set(h.bookIndex, (perBook.get(h.bookIndex) ?? 0) + 1);
    if (canonical) { if (h.bookIndex < 39) oldTestament++; else newTestament++; }
  }
  let topBook: WordSummary["topBook"] = null;
  for (const [book, verses] of perBook) if (!topBook || verses > topBook.verses) topBook = { book, verses };
  return {
    occurrences, verses: hits.length, books: perBook.size, oldTestament, newTestament,
    first: hits[0] ?? null, last: hits[hits.length - 1] ?? null, topBook,
  };
}

/** One original-language word, as a tagged lexical dataset would provide it. */
export interface LexicalEntry {
  language: "hebrew" | "aramaic" | "greek";
  lemma: string;
  transliteration: string;
  /** e.g. "H2580" or "G5485" */
  strongs: string;
  definition: string;
  /** Where the dataset's text credits it */
  source: string;
}

export interface LexicalSource {
  name: string;
  /** Entries for an English word as the dataset's own tagging links them; never inferred */
  lookup: (word: string) => LexicalEntry[];
}

/** Registered lexical datasets. Empty: VerseLight doesn't ship one. */
const sources: LexicalSource[] = [];

export function registerLexicalSource(source: LexicalSource) {
  sources.push(source);
}

export function originalLanguage(word: string): { available: boolean; entries: LexicalEntry[] } {
  if (!sources.length) return { available: false, entries: [] };
  return { available: true, entries: sources.flatMap((s) => s.lookup(word)) };
}
