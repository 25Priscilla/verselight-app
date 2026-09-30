// Placeholder Bibles for tests. VerseLight never ships Bible text, so every verse is made-up filler
// with a few search words planted where the tests expect them.
import { BOOK_NAMES, type BibleData } from "../lib/bible";

export const GENESIS = 0, JOHN = 42, ACTS = 43, ROMANS = 44, EPHESIANS = 48;

/** Chapters (and their verse counts) for the books the tests use; every other book has one short chapter. */
const SHAPE: Record<number, number[]> = {
  [GENESIS]: [5, 4],
  [JOHN]: [4, 3, 18, 6],
  [ACTS]: [5, 3],
  [ROMANS]: [3, 3, 3, 3, 10, 3, 3, 30],
  [EPHESIANS]: [3, 10],
};

const PLANTED: Record<string, string> = {
  "0.1.1": "first words of the placeholder book",
  "42.3.16": "placeholder love and faith words",
  "44.8.28": "placeholder love words",
  "48.2.8": "placeholder grace and faith words",
  "0.2.3": "placeholder grace words",
};

export function fakeEnglish(): BibleData {
  return {
    format: "verselight-bible", name: "Test English", abbreviation: "TEN", license: "Test licence line",
    books: BOOK_NAMES.map((name, b) => ({
      name,
      chapters: (SHAPE[b] ?? [2]).map((count, c) =>
        Array.from({ length: count }, (_, v) => PLANTED[`${b}.${c + 1}.${v + 1}`] ?? `filler ${b}.${c + 1}.${v + 1}`)),
    })),
  };
}

/** Malayalam-script placeholder with Malayalam book names; John 3 lacks its last verse, like a translation that omits one. */
export function fakeMalayalam(): BibleData {
  const en = fakeEnglish();
  return {
    format: "verselight-bible", name: "പരീക്ഷണ ബൈബിൾ", abbreviation: "TML", license: "Test Malayalam licence",
    books: en.books.map((book, b) => ({
      name: b === JOHN ? "യോഹന്നാൻ" : b === GENESIS ? "ഉല്പത്തി" : `പുസ്തകം ${b + 1}`,
      chapters: book.chapters.map((verses, c) => {
        const list = verses.map((_, v) => (b === JOHN && c === 2 && v === 15 ? "സ്നേഹം വാക്കുകൾ" : `മലയാളം ${b}.${c + 1}.${v + 1}`));
        return b === JOHN && c === 2 ? list.slice(0, -1) : list;
      }),
    })),
  };
}
