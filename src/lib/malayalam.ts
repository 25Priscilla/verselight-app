/**
 * Malayalam text helpers: script detection and search normalisation.
 * Malayalam song text is typed in many ways. Older keyboards produce chillu letters as
 * consonant + virama + ZWJ, newer ones use the atomic chillu code points (U+0D7A–U+0D7F),
 * and invisible joiners appear inconsistently. Searching must treat all of these the same.
 */
import type { Song, SongLanguage } from "./types";

const MALAYALAM = /[\u0D00-\u0D7F]/;
export const hasMalayalam = (text: string) => MALAYALAM.test(text);

/** Atomic chillu → the consonant it is based on + virama. */
const CHILLU: Record<string, string> = {
  "\u0D7A": "\u0D23\u0D4D", // ൺ ← ണ്
  "\u0D7B": "\u0D28\u0D4D", // ൻ ← ന്
  "\u0D7C": "\u0D30\u0D4D", // ർ ← ര്
  "\u0D7D": "\u0D32\u0D4D", // ൽ ← ല്
  "\u0D7E": "\u0D33\u0D4D", // ൾ ← ള്
  "\u0D7F": "\u0D15\u0D4D", // ൿ ← ക്
  "\u0D54": "\u0D2E\u0D4D", // ൔ ← മ്
  "\u0D55": "\u0D2F\u0D4D", // ൕ ← യ്
  "\u0D56": "\u0D34\u0D4D", // ൖ ← ഴ്
};

/** Normalises text for matching only; stored and projected text is never changed. */
export function searchKey(text: string): string {
  return text
    .normalize("NFC")
    .replace(/[\u0D54-\u0D56\u0D7A-\u0D7F]/g, (c) => CHILLU[c] ?? c)
    .replace(/[\u200B-\u200D\uFEFF]/g, "") // zero-width space, ZWNJ, ZWJ, BOM
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ")
    .trim();
}

export function detectLanguage(song: Pick<Song, "title" | "lyrics">): SongLanguage {
  return hasMalayalam(song.title) || hasMalayalam(song.lyrics) ? "ml" : "en";
}

export const songLanguage = (song: Song): SongLanguage => song.language ?? detectLanguage(song);

/** Every word of the query must appear in the title, English title, artist or lyrics. */
export function songMatches(song: Song, query: string): boolean {
  const words = searchKey(query).split(" ").filter(Boolean);
  if (words.length === 0) return true;
  const hay = searchKey([song.title, song.altTitle ?? "", song.artist, song.lyrics].join(" "));
  return words.every((w) => hay.includes(w));
}

/** Title matches rank above lyric matches. */
export function songRank(song: Song, query: string): number {
  const q = searchKey(query);
  if (!q) return 0;
  const titles = searchKey(`${song.title} ${song.altTitle ?? ""}`);
  if (titles.startsWith(q)) return 0;
  if (titles.includes(q)) return 1;
  return 2;
}
