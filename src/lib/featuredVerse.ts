/**
 * The verse shown in Home's banner. Only the positions are listed here (book in the standard 66-book order,
 * chapter, verses); the words always come from a Bible the church has imported, so nothing is quoted from memory.
 */
import { ESV_BIBLE_ID } from "./bible";
import type { BibleMeta } from "./types";

export interface VersePosition { book: number; chapter: number; from: number; to: number }

export const FEATURED: VersePosition[] = [
  { book: 18, chapter: 119, from: 105, to: 105 }, // Psalm 119:105
  { book: 42, chapter: 3, from: 16, to: 16 },     // John 3:16
  { book: 22, chapter: 41, from: 10, to: 10 },    // Isaiah 41:10
  { book: 49, chapter: 4, from: 13, to: 13 },     // Philippians 4:13
  { book: 24, chapter: 3, from: 22, to: 23 },     // Lamentations 3:22–23
  { book: 5, chapter: 1, from: 9, to: 9 },        // Joshua 1:9
  { book: 39, chapter: 11, from: 28, to: 28 },    // Matthew 11:28
  { book: 44, chapter: 8, from: 28, to: 28 },     // Romans 8:28
  { book: 18, chapter: 46, from: 1, to: 1 },      // Psalm 46:1
  { book: 19, chapter: 3, from: 5, to: 6 },       // Proverbs 3:5–6
  { book: 18, chapter: 23, from: 1, to: 1 },      // Psalm 23:1
  { book: 42, chapter: 8, from: 12, to: 12 },     // John 8:12
  { book: 46, chapter: 5, from: 17, to: 17 },     // 2 Corinthians 5:17
  { book: 57, chapter: 11, from: 1, to: 1 },      // Hebrews 11:1
];

/** The same verse all day, a different one the next day. */
export function featuredPosition(date: Date): VersePosition {
  const day = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
  return FEATURED[((day % FEATURED.length) + FEATURED.length) % FEATURED.length];
}

/**
 * The Bible to read the banner verse from: the translation being read, unless it is the ESV (read online, so Home
 * never waits on the network for it); otherwise the first imported Bible. Null when only the ESV, or nothing, is there.
 */
export function featuredBibleId(bibles: Pick<BibleMeta, "id">[], readingBibleId: string): string | null {
  const imported = bibles.filter((b) => b.id !== ESV_BIBLE_ID);
  return imported.find((b) => b.id === readingBibleId)?.id ?? imported[0]?.id ?? null;
}
