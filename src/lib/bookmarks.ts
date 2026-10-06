/**
 * Saved verses and passages ("Bible Study"). A bookmark stores a position (book in the standard 66-book
 * order, chapter, first and last verse), never text, so it opens in whichever translation is chosen.
 */
import { BOOK_NAMES, type BibleData } from "./bible";
import { newId } from "./id";
import type { Bookmark } from "./types";

/** The last verse of a bookmark (a single verse ends where it starts). */
export const lastVerse = (b: Pick<Bookmark, "verse" | "to">) => Math.max(b.verse, b.to ?? b.verse);

/** "John 3:16" or "John 3:16–18", with the book name of the given Bible when it has one. */
export function bookmarkLabel(b: Pick<Bookmark, "book" | "chapter" | "verse" | "to">, bible?: BibleData | null): string {
  const name = bible?.books[b.book]?.name ?? BOOK_NAMES[b.book] ?? `Book ${b.book + 1}`;
  const to = lastVerse(b);
  return `${name} ${b.chapter}:${b.verse}${to > b.verse ? `–${to}` : ""}`;
}

/** The bookmark for exactly this verse or passage, if it is saved. */
export function findBookmark(list: Bookmark[], book: number, chapter: number, from: number, to = from): Bookmark | undefined {
  return list.find((b) => b.book === book && b.chapter === chapter && b.verse === from && lastVerse(b) === to);
}

/** Saves a verse or passage at the top of the list (newest first). Saving the same passage twice keeps one. */
export function addBookmark(list: Bookmark[], p: { book: number; chapter: number; from: number; to?: number; translation: string }, now = Date.now()): Bookmark[] {
  const to = Math.max(p.from, p.to ?? p.from);
  if (findBookmark(list, p.book, p.chapter, p.from, to)) return list;
  const bm: Bookmark = { id: newId(), book: p.book, chapter: p.chapter, verse: p.from, translation: p.translation, savedAt: now };
  if (to > p.from) bm.to = to;
  return [bm, ...list];
}

export const removeBookmark = (list: Bookmark[], id: string) => list.filter((b) => b.id !== id);

/**
 * The saved verses in a given translation. Verses that translation doesn't have (for example a verse
 * the Malayalam Bible omits) are left out, and `missing` says whether any were.
 */
export function bookmarkVerses(bible: BibleData | null | undefined, b: Bookmark): { verses: { verse: number; text: string }[]; missing: boolean } {
  const chapter = bible?.books[b.book]?.chapters[b.chapter - 1] ?? [];
  const verses: { verse: number; text: string }[] = [];
  let missing = false;
  for (let v = b.verse; v <= lastVerse(b); v++) {
    const text = chapter[v - 1];
    if (text) verses.push({ verse: v, text });
    else missing = true;
  }
  return { verses, missing };
}
