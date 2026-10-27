/**
 * The language folders on the Songs screen. They only sort songs for browsing: a song is never moved, copied or
 * changed by being listed in a folder, and one song can be in several (a Kannada song with an English translation
 * is in Kannada and in English).
 */
import { songLanguages } from "./malayalam";
import type { Song, SongLanguage } from "./types";

export type SongFolder = "en" | "ml" | "ta" | "kn";

export interface FolderInfo {
  id: SongFolder;
  /** English name, e.g. "Kannada" */
  name: string;
  /** The name in its own script, e.g. "ಕನ್ನಡ" (same as `name` for English) */
  native: string;
  /** The language a new song written in this folder gets */
  language: SongLanguage;
}

/** Always shown in this order, even when a folder is empty. */
export const SONG_FOLDERS: FolderInfo[] = [
  { id: "en", name: "English", native: "English", language: "en" },
  { id: "ml", name: "Malayalam", native: "മലയാളം", language: "ml" },
  { id: "ta", name: "Tamil", native: "தமிழ்", language: "ta" },
  { id: "kn", name: "Kannada", native: "ಕನ್ನಡ", language: "kn" },
];

/** The folder for a language: words in Latin letters belong with their base language (Manglish, ml-Latn, is Malayalam). */
export const folderOf = (lang: SongLanguage): SongFolder | null =>
  SONG_FOLDERS.find((f) => f.id === lang.replace(/-latn$/i, "").toLowerCase())?.id ?? null;

/**
 * The folders a song is listed in, from the languages of its lyrics and of its translation (when it has one).
 * Songs only in other languages are in no folder (they are listed under All).
 */
export function songFolders(song: Song): SongFolder[] {
  const out = new Set(songLanguages(song).map(folderOf));
  return SONG_FOLDERS.map((f) => f.id).filter((id) => out.has(id));
}

/** How many songs each folder lists. */
export function folderCounts(songs: Song[]): Map<SongFolder, number> {
  const counts = new Map<SongFolder, number>(SONG_FOLDERS.map((f) => [f.id, 0]));
  for (const s of songs) for (const f of songFolders(s)) counts.set(f, (counts.get(f) ?? 0) + 1);
  return counts;
}

export const folderInfo = (id: SongFolder) => SONG_FOLDERS.find((f) => f.id === id)!;
