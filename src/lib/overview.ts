/**
 * Chapter Overview: facts about a chapter derived only from data stored in VerseLight.
 * No AI and no summaries:
 *  - sections: Berean Standard Bible section headings (public domain), bundled in src/data/sections.json
 *  - key verses and related chapters: OpenBible.info cross-reference votes (CC BY 4.0), already imported
 */
import { splitId, verseId, type CrossRefData } from "./crossrefs";

export interface SectionsData {
  format: "verselight-sections";
  credit: string;
  source: string;
  count: number;
  /** "book.chapter" → [startVerse, heading, parallelRefs, level] */
  sections: Record<string, [number, string, string, number][]>;
}

export interface Section { from: number; to: number; title: string; parallel: string; level: number }

let sectionsPromise: Promise<SectionsData> | null = null;
/** The headings file is loaded on first use, as its own small chunk, so it never slows app start-up. */
export function loadSections(): Promise<SectionsData> {
  sectionsPromise ??= import("../data/sections.json").then((m) => (m.default ?? m) as unknown as SectionsData);
  return sectionsPromise;
}

/** Sections of a chapter with their verse ranges. A section runs to the verse before the next heading of the same or a higher level. */
export function chapterSections(data: SectionsData, book: number, chapter: number, verseCount: number): Section[] {
  const list = (data.sections[`${book}.${chapter}`] ?? []).filter(([v]) => v >= 1 && v <= verseCount);
  return list.map(([from, title, parallel, level], i) => {
    const next = list.slice(i + 1).find(([, , , l]) => l <= level);
    return { from, to: next ? Math.max(from, next[0] - 1) : verseCount, title, parallel, level };
  });
}

// ---- cross-reference statistics, built once per data set ----

interface XrefStats {
  /** verse id → total positive votes of references to it from elsewhere */
  incoming: Map<number, number>;
  /** chapter key (book*1000+chapter) → other chapter key → total positive votes, both directions */
  chapters: Map<number, Map<number, number>>;
}

const statsCache = new WeakMap<CrossRefData, XrefStats>();
const chapterKey = (id: number) => Math.floor(id / 1000);

function statsFor(data: CrossRefData): XrefStats {
  let s = statsCache.get(data);
  if (s) return s;
  const incoming = new Map<number, number>();
  const chapters = new Map<number, Map<number, number>>();
  const link = (a: number, b: number, votes: number) => {
    const m = chapters.get(a) ?? new Map<number, number>();
    m.set(b, (m.get(b) ?? 0) + votes);
    chapters.set(a, m);
  };
  for (const [from, flat] of Object.entries(data.refs)) {
    const f = Number(from);
    for (let i = 0; i < flat.length; i += 3) {
      const votes = flat[i + 2];
      if (votes <= 0) continue;
      // A range such as 1 John 4:9–10 counts for each of its verses (capped, so long ranges don't dominate).
      const start = flat[i], end = flat[i + 1];
      if (chapterKey(start) === chapterKey(end)) {
        for (let v = start; v <= Math.min(end, start + 9); v++) incoming.set(v, (incoming.get(v) ?? 0) + votes);
      } else incoming.set(start, (incoming.get(start) ?? 0) + votes);
      if (chapterKey(f) !== chapterKey(start)) {
        link(chapterKey(f), chapterKey(start), votes);
        link(chapterKey(start), chapterKey(f), votes);
      }
    }
  }
  s = { incoming, chapters };
  statsCache.set(data, s);
  return s;
}

export interface KeyVerse { verse: number; score: number; references: number }

/**
 * The most-referenced verses of a chapter: votes for its references to other passages plus votes for
 * other passages' references to it, from OpenBible.info. Higher means more widely connected and cited.
 */
export function keyVerses(data: CrossRefData, book: number, chapter: number, verseCount: number, limit = 5): KeyVerse[] {
  const { incoming } = statsFor(data);
  const out: KeyVerse[] = [];
  for (let v = 1; v <= verseCount; v++) {
    const id = verseId(book, chapter, v);
    const flat = data.refs[id] ?? [];
    let outgoing = 0, refs = 0;
    for (let i = 0; i < flat.length; i += 3) if (flat[i + 2] > 0) { outgoing += flat[i + 2]; refs++; }
    const score = outgoing + (incoming.get(id) ?? 0);
    if (score > 0) out.push({ verse: v, score, references: refs });
  }
  // Short chapters get fewer key verses, so the list stays meaningful.
  const n = Math.max(1, Math.min(limit, Math.ceil(verseCount / 5)));
  return out.sort((a, b) => b.score - a.score || a.verse - b.verse).slice(0, n).sort((a, b) => a.verse - b.verse);
}

export interface RelatedChapter { book: number; chapter: number; votes: number }

/** Chapters in other places most strongly connected to this one by cross references (either direction). */
export function relatedChapters(data: CrossRefData, book: number, chapter: number, limit = 6): RelatedChapter[] {
  const { chapters } = statsFor(data);
  const links = chapters.get(book * 1000 + chapter);
  if (!links) return [];
  return [...links.entries()]
    .map(([key, votes]) => { const { book: b, chapter: c } = splitId(key * 1000); return { book: b, chapter: c, votes }; })
    .filter((r) => !(r.book === book && Math.abs(r.chapter - chapter) <= 2)) // nearby chapters are listed separately
    .sort((a, b) => b.votes - a.votes)
    .slice(0, limit);
}

/** Previous/next chapter across book boundaries (John 21 → Acts 1). */
export function neighbour(chaptersPerBook: number[], book: number, chapter: number, delta: 1 | -1): { book: number; chapter: number } | null {
  if (delta > 0) {
    if (chapter < chaptersPerBook[book]) return { book, chapter: chapter + 1 };
    return book + 1 < chaptersPerBook.length ? { book: book + 1, chapter: 1 } : null;
  }
  if (chapter > 1) return { book, chapter: chapter - 1 };
  return book > 0 ? { book: book - 1, chapter: chaptersPerBook[book - 1] } : null;
}
