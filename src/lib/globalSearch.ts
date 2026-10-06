/**
 * Global Quick Search: one box that finds Bible references, Bible words and songs.
 * It builds nothing of its own: references use parseReference, Bible words use searchBible (and its cached
 * per-Bible index), songs use songMatches/songRank, so it finds exactly what the Bible and Songs screens find.
 * Everything runs on the Bibles and songs already on this computer.
 */
import { BOOK_NAMES, bibleLang, parseReference, searchBible, searchWords, type BibleData, type MatchMode } from "./bible";
import { languageName } from "./languages";
import { searchKey, songLanguage, songMatches, songRank } from "./malayalam";
import type { BibleMeta, Song, SongLanguage } from "./types";

export interface BibleSource { meta: BibleMeta; data: BibleData }

export interface BibleResult {
  bibleId: string;
  book: number;
  chapter: number;
  verse: number;
  to: number;
  /** "John 3:16", "Psalms 23" */
  label: string;
  /** The first verse's text */
  text: string;
  lang: "en" | "ml";
  /** The translation it is from, e.g. "KJV" */
  translation: string;
  /** True for a reference typed in (John 3:16), false for a verse found by its words */
  reference: boolean;
}

export interface SongSnippet {
  text: string;
  lang: SongLanguage;
  /** Where the words were found */
  part: "lyrics" | "translation";
}

export interface SongResult {
  song: Song;
  /** A line containing the search words, when they were found in the words of the song rather than its title */
  snippet: SongSnippet | null;
}

export interface GlobalResults {
  query: string;
  bible: BibleResult[];
  /** Verses containing the words in the translation being read (for "see them all in Bible Study") */
  bibleTotal: number;
  songs: SongResult[];
}

/** Bible words match the start of a word: "love" finds "love" and "loved" (not "glove"); Malayalam endings are joined on. */
export const BIBLE_MATCH: MatchMode = "prefix";
const BIBLE_LIMIT = 6;
const BIBLE_LIMIT_WITH_SONGS = 4;
const SONG_LIMIT = 8;

const collator = new Intl.Collator(["ml", "en"], { sensitivity: "base", numeric: true });

/**
 * A typed reference, tried in the translation being read first and then the others, so English and
 * Malayalam book names both work. Chapter-only references select the whole chapter.
 */
export function findReference(sources: BibleSource[], query: string): BibleResult | null {
  const bare = !/\d/.test(query);
  for (const { meta, data } of sources) {
    const ref = parseReference(data, query);
    if (!ref) continue;
    const book = data.books[ref.bookIndex];
    // Words without a number are a book only when they start its name ("Job", "Acts", "Revel…"), so a word
    // being typed (like "an", inside "Daniel") isn't taken for a book.
    if (bare && !bookNameStarts(data, ref.bookIndex, query)) continue;
    const verses = book.chapters[ref.chapter - 1] ?? [];
    if (!verses.length) continue;
    const from = ref.from ?? 1;
    const to = ref.to ?? (ref.from ? from : verses.length);
    const label = ref.from ? `${book.name} ${ref.chapter}:${from}${to > from ? `–${to}` : ""}` : `${book.name} ${ref.chapter}`;
    return { bibleId: meta.id, book: ref.bookIndex, chapter: ref.chapter, verse: from, to, label, text: verses[from - 1] ?? "", lang: bibleLang(meta), translation: meta.abbreviation, reference: true };
  }
  return null;
}

const nameKey = (s: string) => searchKey(s).replace(/ /g, "");
function bookNameStarts(data: BibleData, bookIndex: number, query: string): boolean {
  const q = nameKey(query);
  if (q.length < 3) return false;
  const names = [data.books[bookIndex].name, data.books.length === 66 ? BOOK_NAMES[bookIndex] : ""];
  return names.some((n) => n && nameKey(n).startsWith(q));
}

/** Verses containing every word, from the translation being read first, then verses only another translation matches. */
export function findVerses(sources: BibleSource[], query: string, limit = BIBLE_LIMIT): { hits: BibleResult[]; total: number } {
  const hits: BibleResult[] = [];
  const seen = new Set<string>();
  let total = 0;
  sources.forEach(({ meta, data }, i) => {
    const found = searchBible(data, query, { limit, mode: BIBLE_MATCH });
    if (i === 0) total = found.total;
    for (const h of found.hits) {
      const key = `${h.bookIndex}.${h.chapter}.${h.verse}`;
      if (hits.length >= limit || seen.has(key)) continue;
      seen.add(key);
      hits.push({ bibleId: meta.id, book: h.bookIndex, chapter: h.chapter, verse: h.verse, to: h.verse,
        label: `${data.books[h.bookIndex].name} ${h.chapter}:${h.verse}`, text: h.text, lang: bibleLang(meta), translation: meta.abbreviation, reference: false });
    }
  });
  return { hits, total };
}

/** Lyrics lines without the [Verse 1] style tags. */
const sungLines = (text: string) => text.split("\n").map((l) => l.trim()).filter((l) => l && !/^\[[^\]]+\]$/.test(l));

/** The line of the lyrics or translation with the most search words in it. */
export function songSnippet(song: Song, query: string): SongSnippet | null {
  const words = searchWords(query);
  if (!words.length) return null;
  let best: SongSnippet | null = null;
  let bestCount = 0;
  const parts: [SongSnippet["part"], string, SongLanguage][] = [
    ["lyrics", song.lyrics, songLanguage(song)],
    ["translation", song.translation ?? "", song.translationLanguage ?? "und"],
  ];
  for (const [part, text, lang] of parts) {
    for (const line of sungLines(text)) {
      const key = searchKey(line);
      const count = words.filter((w) => key.includes(w)).length;
      if (count > bestCount) { best = { text: line, lang, part }; bestCount = count; }
      if (count === words.length) return best;
    }
  }
  return best;
}

/** Songs whose title, writer, lyrics or translation contain every word; titles first. */
export function findSongs(songs: Song[], query: string, limit = SONG_LIMIT): SongResult[] {
  if (!searchWords(query).length) return [];
  return songs
    .filter((s) => songMatches(s, query))
    .map((s) => ({ s, rank: songRank(s, query) }))
    .sort((a, b) => a.rank - b.rank || collator.compare(a.s.title || a.s.altTitle || "", b.s.title || b.s.altTitle || ""))
    .slice(0, limit)
    .map(({ s, rank }) => ({ song: s, snippet: rank < 2 ? null : songSnippet(s, query) }));
}

/**
 * Everything the box finds for a query. `sources` lists the Bibles with the translation being read first.
 * A reference (John 3:16) is shown first; words without a number also search the verses, so "Job" or "Acts"
 * finds the book and the verses that use the word.
 */
export function globalSearch(query: string, sources: BibleSource[], songs: Song[]): GlobalResults {
  const q = query.trim();
  const empty: GlobalResults = { query: q, bible: [], bibleTotal: 0, songs: [] };
  if (!searchWords(q).length) return empty;
  const ref = findReference(sources, q);
  const songResults = findSongs(songs, q);
  // Fewer verses when songs match too, so the songs are in view without scrolling ("See all" lists the rest).
  const room = (songResults.length ? BIBLE_LIMIT_WITH_SONGS : BIBLE_LIMIT) - (ref ? 1 : 0);
  const words = /\d/.test(q) ? { hits: [], total: 0 } : findVerses(sources, q, room);
  return { query: q, bible: ref ? [ref, ...words.hits] : words.hits, bibleTotal: words.total, songs: songResults };
}

/** "Translation · English", for showing where a lyric match was found. */
export function snippetPlace(snippet: SongSnippet): string {
  return snippet.part === "translation" ? `Translation · ${languageName(snippet.lang)}` : "Lyrics";
}
