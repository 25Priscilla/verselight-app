import { describe, expect, it } from "vitest";
import { languageLabel, languageName } from "./languages";
import { folderCounts, songFolders, SONG_FOLDERS } from "./songFolders";
import type { Song } from "./types";

// Placeholder words only: VerseLight never ships song lyrics.
const song = (over: Partial<Song> = {}): Song => ({
  kind: "song", id: "s", title: "Song", artist: "", copyright: "", ccli: "", linesPerSlide: 0, updatedAt: 0,
  language: "en", lyrics: "[Verse 1]\nline", arrangement: [], hidden: [],
  ...over,
});

describe("song language folders", () => {
  it("are always the same four, Kannada separate from the others, and no Manglish folder", () => {
    expect(SONG_FOLDERS.map((f) => f.name)).toEqual(["English", "Malayalam", "Tamil", "Kannada"]);
    expect(SONG_FOLDERS.find((f) => f.id === "kn")!.native).toBe("ಕನ್ನಡ");
    expect(folderCounts([])).toEqual(new Map([["en", 0], ["ml", 0], ["ta", 0], ["kn", 0]]));
  });

  it("list a song in one language in that folder only", () => {
    expect(songFolders(song())).toEqual(["en"]);
    expect(songFolders(song({ language: "ml", lyrics: "[Verse 1]\nവരി" }))).toEqual(["ml"]);
    expect(songFolders(song({ language: "ta", lyrics: "[Verse 1]\nவரி" }))).toEqual(["ta"]);
    expect(songFolders(song({ language: "kn", lyrics: "[Verse 1]\nಸಾಲು" }))).toEqual(["kn"]);
  });

  it("list a song with a translation in both its languages", () => {
    expect(songFolders(song({ language: "ml", lyrics: "[Verse 1]\nവരി", translation: "[Verse 1]\nline", translationLanguage: "en" }))).toEqual(["en", "ml"]);
    expect(songFolders(song({ language: "kn", lyrics: "[Verse 1]\nಸಾಲು", translation: "[Verse 1]\nline", translationLanguage: "en" }))).toEqual(["en", "kn"]);
    expect(songFolders(song({ language: "ml", lyrics: "[Verse 1]\nവരി", translation: "[Verse 1]\nவரி", translationLanguage: "ta" }))).toEqual(["ml", "ta"]);
  });

  it("put Manglish lyrics and Malayalam songs with a Manglish translation in Malayalam", () => {
    expect(songFolders(song({ language: "ml-Latn", lyrics: "[Verse 1]\nvari" }))).toEqual(["ml"]);
    expect(songFolders(song({ language: "ml", lyrics: "[Verse 1]\nവരി", translation: "[Verse 1]\nvari", translationLanguage: "ml-Latn" }))).toEqual(["ml"]);
  });

  it("list a song with a Manglish title, or an empty translation box, by its lyrics only", () => {
    expect(songFolders(song({ language: "ml", title: "പാട്ട്", altTitle: "Paattu", lyrics: "[Verse 1]\nവരി" }))).toEqual(["ml"]);
    expect(songFolders(song({ language: "ml", lyrics: "[Verse 1]\nവരി", translation: "  ", translationLanguage: "ml-Latn" }))).toEqual(["ml"]);
  });

  it("count Tamil and Kannada in Latin letters as Tamil and Kannada, with no folder of their own", () => {
    expect(songFolders(song({ language: "ta", lyrics: "[Verse 1]\nவரி", translation: "[Verse 1]\nvari", translationLanguage: "ta-Latn" }))).toEqual(["ta"]);
    expect(songFolders(song({ language: "kn", lyrics: "[Verse 1]\nಸಾಲು", translation: "[Verse 1]\nsaalu", translationLanguage: "kn-Latn" }))).toEqual(["kn"]);
  });

  it("leave songs in other languages for All only", () => {
    expect(songFolders(song({ language: "es", lyrics: "[Verse 1]\nCantad" }))).toEqual([]);
  });

  it("count every song in each of its folders, without changing any song", () => {
    const songs = [
      song({ id: "a" }),
      song({ id: "b", language: "ml", lyrics: "[Verse 1]\nവരി", translation: "[Verse 1]\nvari", translationLanguage: "ml-Latn" }),
      song({ id: "c", language: "kn", lyrics: "[Verse 1]\nಸಾಲು", translation: "[Verse 1]\nline", translationLanguage: "en" }),
    ];
    const before = JSON.stringify(songs);
    expect(Object.fromEntries(folderCounts(songs))).toEqual({ en: 2, ml: 1, ta: 0, kn: 1 });
    expect(JSON.stringify(songs)).toBe(before);
  });

  it("name Manglish in words, never as its code", () => {
    expect(languageName("ml-Latn")).toBe("Manglish");
    expect(languageLabel("ml-Latn")).toBe("Manglish");
  });
});
