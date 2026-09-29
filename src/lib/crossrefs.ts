/**
 * Bible cross references from OpenBible.info (https://www.openbible.info/labs/cross-references/).
 *
 * License: Creative Commons Attribution 4.0 (CC BY 4.0), stated on the dataset page and in the
 * file's own header line. The data draws mainly on the public-domain Treasury of Scripture Knowledge.
 * CC BY requires credit, a link to the license, and an indication of changes. VerseLight shows
 * the credit in the cross-reference panel. The only change is the storage format: every reference
 * and vote count is kept, and results are ordered by votes.
 *
 * The file contains verse references and vote counts only, no Scripture text. VerseLight shows
 * verse text from the user's own imported Bibles.
 */
import { readData, writeData } from "./storage";

export const XREF_CREDIT = "Cross references: OpenBible.info, CC BY 4.0";
export const XREF_LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/";
export const XREF_SOURCE_URL = "https://www.openbible.info/labs/cross-references/";
export const XREF_CHANGES = "Converted to VerseLight's storage format; all references and votes kept; listed by votes.";

/** OpenBible (OSIS-style) book codes in the standard 66-book order. */
export const OSIS_BOOKS = [
  "Gen", "Exod", "Lev", "Num", "Deut", "Josh", "Judg", "Ruth", "1Sam", "2Sam", "1Kgs", "2Kgs", "1Chr", "2Chr",
  "Ezra", "Neh", "Esth", "Job", "Ps", "Prov", "Eccl", "Song", "Isa", "Jer", "Lam", "Ezek", "Dan", "Hos", "Joel",
  "Amos", "Obad", "Jonah", "Mic", "Nah", "Hab", "Zeph", "Hag", "Zech", "Mal", "Matt", "Mark", "Luke", "John",
  "Acts", "Rom", "1Cor", "2Cor", "Gal", "Eph", "Phil", "Col", "1Thess", "2Thess", "1Tim", "2Tim", "Titus", "Phlm",
  "Heb", "Jas", "1Pet", "2Pet", "1John", "2John", "3John", "Jude", "Rev",
];
const BOOK_INDEX = new Map(OSIS_BOOKS.map((b, i) => [b, i]));

/** A verse as one number: book (0-based) × 1,000,000 + chapter × 1,000 + verse. */
export const verseId = (book: number, chapter: number, verse: number) => book * 1_000_000 + chapter * 1000 + verse;
export const splitId = (id: number) => ({ book: Math.floor(id / 1_000_000), chapter: Math.floor(id / 1000) % 1000, verse: id % 1000 });

export interface CrossRefData {
  format: "verselight-xrefs";
  credit: string;
  license: string;
  source: string;
  changes: string;
  count: number;
  /** from-verse id → flat list of [startId, endId, votes, …], highest votes first */
  refs: Record<string, number[]>;
}

export interface CrossRef {
  start: number;
  end: number;
  votes: number;
}

function parseOsis(ref: string): number | null {
  const m = ref.trim().match(/^([1-3]?[A-Za-z]+)\.(\d+)\.(\d+)$/);
  if (!m) return null;
  const book = BOOK_INDEX.get(m[1]);
  return book === undefined ? null : verseId(book, Number(m[2]), Number(m[3]));
}

/** Reads OpenBible's cross_references.txt (tab-separated: From Verse, To Verse, Votes). */
export function parseOpenBibleTsv(text: string): CrossRefData {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (!/^From Verse\tTo Verse\tVotes/i.test(lines[0] ?? "")) {
    throw new Error("this isn't OpenBible's cross_references.txt (the first line should start with From Verse, To Verse, Votes).");
  }
  const groups = new Map<number, number[][]>();
  let count = 0;
  let skipped = 0;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const [from, to, votes] = line.split("\t");
    const f = parseOsis(from ?? "");
    const [a, b] = (to ?? "").split("-");
    const start = parseOsis(a ?? "");
    const end = b ? parseOsis(b) : start;
    if (f === null || start === null || end === null) { skipped++; continue; }
    const list = groups.get(f) ?? [];
    list.push([start, end, Number(votes) || 0]);
    groups.set(f, list);
    count++;
  }
  if (count === 0) throw new Error("the file has no cross references in it.");
  const refs: Record<string, number[]> = {};
  for (const [f, list] of groups) refs[f] = list.sort((x, y) => y[2] - x[2]).flat();
  if (skipped) console.warn(`Cross references: ${skipped} lines could not be read and were skipped.`);
  return { format: "verselight-xrefs", credit: XREF_CREDIT, license: XREF_LICENSE_URL, source: XREF_SOURCE_URL, changes: XREF_CHANGES, count, refs };
}

export function parseCrossRefFile(raw: string): CrossRefData {
  const trimmed = raw.trimStart();
  if (trimmed.startsWith("{")) {
    const json = JSON.parse(trimmed) as CrossRefData;
    if (json.format !== "verselight-xrefs" || !json.refs) throw new Error("this isn't a cross-reference file.");
    return json;
  }
  return parseOpenBibleTsv(raw);
}

const FILE = "crossrefs.json";
let cache: CrossRefData | null = null;

export async function saveCrossRefs(data: CrossRefData) {
  await writeData(FILE, JSON.stringify(data));
  cache = data;
}

export async function loadCrossRefs(): Promise<CrossRefData | null> {
  if (cache) return cache;
  const raw = await readData(FILE);
  cache = raw ? (JSON.parse(raw) as CrossRefData) : null;
  return cache;
}

/**
 * Cross references for a selected verse or passage. For a passage, references from every verse
 * are merged (the highest vote wins for duplicates) and references back into the passage are dropped.
 */
export function crossRefsFor(data: CrossRefData, book: number, chapter: number, from: number, to: number): CrossRef[] {
  const inside = (id: number) => id >= verseId(book, chapter, from) && id <= verseId(book, chapter, to);
  const best = new Map<string, CrossRef>();
  for (let v = from; v <= to; v++) {
    const flat = data.refs[verseId(book, chapter, v)];
    if (!flat) continue;
    for (let i = 0; i < flat.length; i += 3) {
      const ref = { start: flat[i], end: flat[i + 1], votes: flat[i + 2] };
      if (inside(ref.start) && inside(ref.end)) continue;
      const key = `${ref.start}-${ref.end}`;
      const prev = best.get(key);
      if (!prev || prev.votes < ref.votes) best.set(key, ref);
    }
  }
  return [...best.values()].sort((a, b) => b.votes - a.votes || a.start - b.start);
}
