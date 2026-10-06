// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { chunkSection, nextLabel, parseLyrics, songOrder, unusedSections } from "./lyrics";
import { songLanguage, songMatches, songRank } from "./malayalam";
import { migrateSongSlideKeys, slidesFor, songSlideKey, songSlidesAll } from "./slides";
import { findDuplicateSong, parseOpenLyrics, parseSongFile, planSongImport, toSong, type SongFile } from "./songImport";
import type { Song } from "./types";

// Placeholder words only: VerseLight never ships song lyrics.
const song = (over: Partial<Song> = {}): Song => ({
  kind: "song", id: "s1", title: "Test Song", artist: "Writer", copyright: "", ccli: "", linesPerSlide: 0, updatedAt: 0,
  lyrics: "[Verse 1]\nV1 a\nV1 b\n\nV1 c\n\n[Chorus]\nC a\nC b\n\n[Verse 2]\nV2 a\n\n[Chorus]\n\n[Bridge]\nB a",
  arrangement: [], hidden: [],
  ...over,
});
const labels = (s: Song) => slidesFor(s).map((x) => x.label);

describe("lyrics sections", () => {
  it("reads sections in written order, with bare tags repeating a section", () => {
    const { sections, written, duplicates } = parseLyrics(song().lyrics);
    expect([...sections.keys()]).toEqual(["Verse 1", "Chorus", "Verse 2", "Bridge"]);
    expect(written).toEqual(["Verse 1", "Chorus", "Verse 2", "Chorus", "Bridge"]);
    expect(duplicates).toEqual([]);
  });

  it("puts lines before the first tag in a Lyrics section", () => {
    expect(parseLyrics("Line one\nLine two").written).toEqual(["Lyrics"]);
  });

  it("reports a section written out twice, whose second words would not be shown", () => {
    expect(parseLyrics("[Verse]\nOne\n\n[Verse]\nTwo").duplicates).toEqual(["Verse"]);
  });

  it("numbers new sections after the ones already there", () => {
    expect(nextLabel(song().lyrics, "Verse")).toBe("Verse 3");
    expect(nextLabel(song().lyrics, "Bridge")).toBe("Bridge 2");
    expect(nextLabel(song().lyrics, "Pre-Chorus")).toBe("Pre-Chorus");
  });

  it("splits long sections into slides of at most four lines, or a fixed number", () => {
    const six = ["1", "2", "3", "4", "5", "6"];
    expect(chunkSection(six, 0)).toEqual([["1", "2", "3"], ["4", "5", "6"]]);
    expect(chunkSection(six, 4)).toEqual([["1", "2", "3", "4"], ["5", "6"]]);
    expect(chunkSection(["a", "", "b"], 0)).toEqual([["a"], ["b"]]);
  });

  it("names sections a custom order leaves out", () => {
    expect(unusedSections(song())).toEqual([]);
    expect(unusedSections(song({ arrangement: ["Chorus", "Verse 1"] }))).toEqual(["Verse 2", "Bridge"]);
  });
});

describe("song slides", () => {
  it("makes slides in the written order, repeating the chorus", () => {
    expect(labels(song())).toEqual(["Verse 1 · 1/2", "Verse 1 · 2/2", "Chorus", "Verse 2", "Chorus", "Bridge"]);
  });

  it("follows a custom order and ignores sections that no longer exist", () => {
    expect(labels(song({ arrangement: ["Bridge", "Chorus", "Gone", "Chorus"] }))).toEqual(["Bridge", "Chorus", "Chorus"]);
  });

  it("leaves hidden slides out of the presentation but keeps them in the editor", () => {
    const s = song({ hidden: ["Verse 1#1", "Bridge#0"] });
    expect(labels(s)).toEqual(["Verse 1 · 1/2", "Chorus", "Verse 2", "Chorus"]);
    expect(songSlidesAll(s).filter((x) => x.hidden).map((x) => x.label)).toEqual(["Verse 1 · 2/2", "Bridge"]);
  });

  it("gives every slide a unique key that stays the same when sections are moved", () => {
    const before = slidesFor(song());
    expect(new Set(before.map((x) => x.key)).size).toBe(before.length);
    const moved = slidesFor(song({ arrangement: ["Bridge", "Verse 1", "Chorus", "Verse 2", "Chorus"] }));
    const text = (list: typeof before) => new Map(list.map((x) => [x.key, x.lines.join("/")]));
    const a = text(before);
    for (const [key, words] of text(moved)) expect(a.get(key)).toBe(words);
    expect(moved[0].key).toBe(songSlideKey("s1", "Bridge", 0, 0));
    expect(moved.filter((x) => x.label === "Chorus").map((x) => x.key)).toEqual([songSlideKey("s1", "Chorus", 0, 0), songSlideKey("s1", "Chorus", 1, 0)]);
  });

  it("marks slides with the song's language, so Malayalam is shaped correctly", () => {
    const ml = song({ title: "യേശു", lyrics: "[Verse 1]\nയേശു നല്ലവൻ", language: undefined });
    expect(songLanguage(ml)).toBe("ml");
    expect(slidesFor(ml)[0].lang).toBe("ml");
    expect(slidesFor(song())[0].lang).toBe("en");
  });

  it("puts the credit line in the footer", () => {
    expect(slidesFor(song({ copyright: "© Test", ccli: "123" }))[0].footer).toBe("Writer  |  © Test  |  CCLI 123");
  });
});

describe("per-slide backgrounds saved with the old slide keys", () => {
  it("move onto the same slide's new key", () => {
    const s = song();
    // Old key: "<song id>:<place in order>:<section>#<part>". Place 3 is the second Chorus.
    const out = migrateSongSlideKeys({ "s1:3:Chorus#0": "look-a", "s1:0:Verse 1#1": "look-b", "v:0.1.1": "look-c" }, [s]);
    expect(out).toEqual({
      [songSlideKey("s1", "Chorus", 1, 0)]: "look-a",
      [songSlideKey("s1", "Verse 1", 0, 1)]: "look-b",
      "v:0.1.1": "look-c",
    });
    expect(migrateSongSlideKeys(out, [s])).toEqual(out);
  });

  it("keep keys that don't match a song slide as they were", () => {
    expect(migrateSongSlideKeys({ "s1:9:Chorus#0": "x", "other:0:Chorus#0": "y" }, [song()])).toEqual({ "s1:9:Chorus#0": "x", "other:0:Chorus#0": "y" });
  });
});

describe("song search", () => {
  const ml = song({ id: "m", title: "കർത്താവേ", altTitle: "Karthave", lyrics: "[Verse 1]\nഎന്റെ കർത്താവേ" });

  it("matches title, English title, writer and lyrics", () => {
    expect(songMatches(song(), "test")).toBe(true);
    expect(songMatches(song(), "writer")).toBe(true);
    expect(songMatches(song(), "v2 a")).toBe(true);
    expect(songMatches(ml, "karthave")).toBe(true);
    expect(songMatches(song(), "missing")).toBe(false);
  });

  it("doesn't match the section tags", () => {
    expect(songMatches(song(), "chorus")).toBe(false);
    expect(songMatches(song(), "bridge")).toBe(false);
  });

  it("finds Malayalam however the chillu letters were typed", () => {
    // Old-style chillu: consonant + virama + ZWJ instead of the atomic letter.
    expect(songMatches(ml, "കര്‍ത്താവേ")).toBe(true);
  });

  it("ranks title matches above lyric matches", () => {
    expect(songRank(song(), "test")).toBe(0);
    expect(songRank(song(), "song")).toBe(1);
    expect(songRank(song(), "v1")).toBe(2);
  });
});

describe("song import", () => {
  const file = (songs: SongFile["songs"]): SongFile => ({ name: "Test", source: "", license: "", songs });

  it("adds new songs and skips ones already in the library, by title and writer", () => {
    const plan = planSongImport(file([
      { title: "Test Song", artist: "Writer", lyrics: "x" },
      { title: "TEST SONG!", artist: "writer", lyrics: "x" },
      { title: "Test Song", artist: "Someone else", lyrics: "x" },
      { title: "New", lyrics: "x" },
    ]), [song()]);
    expect(plan.fresh.map((s) => [s.title, s.artist])).toEqual([["Test Song", "Someone else"], ["New", undefined]]);
    expect(plan.duplicates).toBe(2);
    expect(plan.skipped.map((s) => s.title)).toEqual(["Test Song", "TEST SONG!"]);
  });

  it("keeps different Malayalam songs apart", () => {
    const plan = planSongImport(file([
      { title: "യേശുവേ നിന്നെ", lyrics: "[Verse 1]\nഒന്ന്" },
      { title: "കർത്താവേ", lyrics: "[Verse 1]\nരണ്ട്" },
      { title: "കര്‍ത്താവേ", lyrics: "[Verse 1]\nരണ്ട്" },
    ]), []);
    expect(plan.fresh.map((s) => s.title)).toEqual(["യേശുവേ നിന്നെ", "കർത്താവേ"]);
    expect(plan.duplicates).toBe(1);
  });

  it("finds another song in the library with the same title and writer", () => {
    const items = [song(), song({ id: "s2", title: "Other" })];
    expect(findDuplicateSong({ id: "new", title: "test song", artist: "WRITER" }, items)?.id).toBe("s1");
    expect(findDuplicateSong({ id: "s1", title: "Test Song", artist: "Writer" }, items)).toBeUndefined();
    expect(findDuplicateSong({ id: "new", title: "", artist: "" }, [song({ title: "" })])).toBeUndefined();
  });

  it("reads VerseLight song files and keeps the words exactly", () => {
    const f = parseSongFile(JSON.stringify({ format: "verselight-songs", name: "Hymns", songs: [
      { title: "A", lyrics: "[Verse 1]\nWords  here", arrangement: ["Verse 1", "Verse 1"] }, { title: "Empty", lyrics: " " },
    ] }));
    expect(f.songs).toHaveLength(1);
    const s = toSong(f.songs[0]);
    expect(s).toMatchObject({ kind: "song", title: "A", lyrics: "[Verse 1]\nWords  here", arrangement: ["Verse 1", "Verse 1"], language: "en", hidden: [] });
    expect(() => parseSongFile("{}")).toThrow();
  });

  it("reads OpenLyrics files with their section order, preferring the Malayalam verses", () => {
    const xml = `<?xml version="1.0"?><song xmlns="http://openlyrics.info/namespace/2009/song" version="0.8">
      <properties><titles><title>Karthave</title><title lang="ml">കർത്താവേ</title></titles>
        <authors><author>Writer</author></authors><copyright>© Test</copyright><ccliNo>42</ccliNo><verseOrder>v1 c v1 c</verseOrder></properties>
      <lyrics>
        <verse name="v1" lang="en"><lines>Ente karthave</lines></verse>
        <verse name="v1" lang="ml"><lines>എന്റെ<br/>കർത്താവേ</lines></verse>
        <verse name="c" lang="ml"><lines>കോറസ്</lines></verse>
      </lyrics></song>`;
    const s = parseOpenLyrics(xml);
    expect(s).toMatchObject({
      title: "കർത്താവേ", altTitle: "Karthave", artist: "Writer", copyright: "© Test", ccli: "42", language: "ml",
      lyrics: "[Verse 1]\nഎന്റെ\nകർത്താവേ\n\n[Chorus]\nകോറസ്", arrangement: ["Verse 1", "Chorus", "Verse 1", "Chorus"],
    });
    expect(songOrder(toSong(s))).toEqual(["Verse 1", "Chorus", "Verse 1", "Chorus"]);
  });
});
