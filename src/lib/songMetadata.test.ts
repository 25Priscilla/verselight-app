// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { normalizeLibrary } from "../state/library";
import { songSlidesAll } from "./slides";
import { parseSongFile, planSongImport, songsWithoutLicense, toSong } from "./songImport";
import type { Library, Song } from "./types";

// Placeholder words only: VerseLight never ships song lyrics.
const song = (over: Partial<Song> = {}): Song => ({
  kind: "song", id: "s1", title: "Test Song", artist: "Writer", copyright: "© Test", ccli: "42", language: "en",
  linesPerSlide: 0, updatedAt: 0, lyrics: "[Verse 1]\nV1 a\n\n[Chorus]\nC a", arrangement: [], hidden: [],
  ...over,
});
const songFile = (extra: object, songs: object[]) => JSON.stringify({ format: "verselight-songs", name: "Test", ...extra, songs });

describe("song licence, source and translator", () => {
  it("keeps each song's own translator, licence and source exactly as given", () => {
    const f = parseSongFile(songFile({ license: "File licence", source: "File source" }, [{
      title: "മലയാളം", altTitle: "Malayalam", language: "ml", lyrics: "[Verse 1]\nവരി", translation: "[Verse 1]\nLine",
      translationLanguage: "en", translator: "Translator Name", license: "Permission from the writer", source: "Songbook p. 12",
    }]));
    const s = toSong(f.songs[0]);
    expect(s).toMatchObject({
      title: "മലയാളം", altTitle: "Malayalam", lyrics: "[Verse 1]\nവരി", translation: "[Verse 1]\nLine", translationLanguage: "en",
      translator: "Translator Name", license: "Permission from the writer", source: "Songbook p. 12",
    });
  });

  it("uses the file's licence and source for songs that don't give their own", () => {
    const f = parseSongFile(songFile({ license: "File licence", source: "File source" }, [
      { title: "A", lyrics: "x" },
      { title: "B", lyrics: "x", license: "  ", source: "" },
      { title: "C", lyrics: "x", sourceUrl: "https://example.org/c" },
    ]));
    expect(f.songs.map(toSong).map((s) => [s.license, s.source])).toEqual([
      ["File licence", "File source"],
      ["File licence", "File source"],
      ["File licence", "https://example.org/c"],
    ]);
  });

  it("keeps a song's sourceUrl as its source", () => {
    expect(toSong({ title: "A", lyrics: "x", sourceUrl: "https://example.org/a" }).source).toBe("https://example.org/a");
  });

  it("adds no empty fields to songs with no licence, source or translator", () => {
    const s = toSong(parseSongFile(songFile({}, [{ title: "A", lyrics: "x" }])).songs[0]);
    expect(s).not.toHaveProperty("license");
    expect(s).not.toHaveProperty("source");
    expect(s).not.toHaveProperty("translator");
  });

  it("lists songs with no licence recorded, so the import window can warn (without blocking)", () => {
    const f = parseSongFile(songFile({}, [{ title: "A", lyrics: "x", license: "Permission" }, { title: "B", lyrics: "x" }]));
    expect(songsWithoutLicense(f.songs).map((s) => s.title)).toEqual(["B"]);
    expect(planSongImport(f, []).fresh).toHaveLength(2);
    expect(songsWithoutLicense(parseSongFile(songFile({ license: "All covered" }, [{ title: "B", lyrics: "x" }])).songs)).toEqual([]);
  });

  it("never replaces a song already in the library, even when the file has new licence details for it", () => {
    const existing = song();
    const before = structuredClone(existing);
    const f = parseSongFile(songFile({ license: "New licence" }, [
      { title: "Test Song", artist: "Writer", lyrics: "[Verse 1]\nDifferent", translator: "T", source: "S" },
    ]));
    const plan = planSongImport(f, [existing]);
    expect(plan.fresh).toEqual([]);
    expect(plan.duplicates).toBe(1);
    expect(existing).toEqual(before);
  });

  it("loads songs saved without these fields exactly as they were", () => {
    const saved = song();
    const lib = normalizeLibrary({ items: [structuredClone(saved)], services: [] } as unknown as Library);
    expect(lib.items).toEqual([saved]);
  });

  it("doesn't change what the projector shows: the credit stays artist, copyright and CCLI", () => {
    const plain = song();
    const withMeta = song({ translator: "Translator Name", license: "Permission", source: "Songbook" });
    expect(songSlidesAll(withMeta)).toEqual(songSlidesAll(plain));
    expect(songSlidesAll(withMeta)[0].footer).toBe("Writer  |  © Test  |  CCLI 42");
  });
});
