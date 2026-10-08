/**
 * The Service Planner: one order of service made of songs and Bible passages.
 *
 * Entries only point at things (a song id, a passage by book, chapter and verse in a chosen translation), so a song
 * edited in the Songs screen is presented as it is now, and nothing is copied. The plan is kept in the library's
 * existing `services` list (the active service), so it is saved, backed up and restored with everything else.
 */
import { BOOK_NAMES } from "./bible";
import { slidesFor } from "./slides";
import type { BibleMeta, Library, PlanEntry, PlanPassage, Service, Song } from "./types";

/** The service the Planner shows. normalizeLibrary makes sure there is always one. */
export function activeService(lib: Library): Service | null {
  return lib.services.find((s) => s.id === lib.activeServiceId) ?? lib.services[0] ?? null;
}

export const planEntries = (lib: Library): PlanEntry[] => activeService(lib)?.entries ?? [];

/** Changes the active service, leaving every other part of the library as it was. */
export function updateService(lib: Library, fn: (s: Service) => Partial<Service>): Library {
  const current = activeService(lib);
  if (!current) return lib;
  return { ...lib, services: lib.services.map((s) => (s.id === current.id ? { ...s, ...fn(s), updatedAt: Date.now() } : s)) };
}

export const setEntries = (lib: Library, fn: (entries: PlanEntry[]) => PlanEntry[]) =>
  updateService(lib, (s) => ({ entries: fn(s.entries ?? []) }));

/** Moves the entry at `from` to `to` (both positions in the list before the move). */
export function moveEntry(entries: PlanEntry[], from: number, to: number): PlanEntry[] {
  if (from === to || from < 0 || to < 0 || from >= entries.length || to >= entries.length) return entries;
  const out = [...entries];
  const [e] = out.splice(from, 1);
  out.splice(to, 0, e);
  return out;
}

/** The role shown above the title: what the operator named it, or "Song" / "Bible Reading". */
export const entryLabel = (e: PlanEntry) => e.label?.trim() || (e.kind === "song" ? "Song" : "Bible Reading");

/** "John 3:16", "Psalm 23:1–6", "Psalm 23" (a whole chapter). */
export function passageReference(p: PlanPassage, bookName?: string): string {
  const name = bookName ?? BOOK_NAMES[p.book] ?? "Bible";
  if (p.from <= 1 && p.to >= WHOLE_CHAPTER) return `${name} ${p.chapter}`;
  return `${name} ${p.chapter}:${p.from}${p.to > p.from ? `–${p.to}` : ""}`;
}

/** `to` for a whole chapter, when its verse count isn't known yet (the ESV before the chapter is fetched). No chapter is longer. */
export const WHOLE_CHAPTER = 176;

/** "KJV", or "KJV · MAL" for a reading shown in two translations. */
export function passageTranslations(p: PlanPassage, bibles: BibleMeta[]): string {
  const abbr = (id?: string) => bibles.find((b) => b.id === id)?.abbreviation;
  const first = abbr(p.primaryId);
  const second = p.secondId ? abbr(p.secondId) : undefined;
  if (p.onScreen === "second" && second) return second;
  return [first, p.onScreen === "both" ? second : undefined].filter(Boolean).join(" · ");
}

export interface EntryInfo {
  label: string;
  title: string;
  /** Small text after a reading's reference: its translation */
  tag: string;
  lang?: string;
  /** Why it can't be presented (the song was deleted, the Bible removed, no slides), or null */
  problem: string | null;
}

/** What a Planner row shows for an entry. */
export function entryInfo(e: PlanEntry, songs: Map<string, Song>, bibles: BibleMeta[]): EntryInfo {
  const label = entryLabel(e);
  if (e.kind === "song") {
    const song = songs.get(e.songId);
    if (!song) return { label, title: "Song not found", tag: "", problem: "This song was deleted." };
    const title = song.title || song.altTitle || "Untitled song";
    return { label, title, tag: "", lang: song.language, problem: slidesFor(song).length ? null : "This song has no slides." };
  }
  const p = e.passage;
  const problem = bibles.some((b) => b.id === p.primaryId) ? null : "This Bible translation was removed.";
  return { label, title: e.reference || passageReference(p), tag: passageTranslations(p, bibles), problem };
}

/**
 * The entries Next or Previous can move to from position `from` (exclusive), nearest first.
 * Returns positions, so the caller can try each in turn and skip any that can't be shown.
 */
export function entriesToward(count: number, from: number, delta: number): number[] {
  const out: number[] = [];
  for (let i = from + delta; i >= 0 && i < count; i += delta) out.push(i);
  return out;
}
