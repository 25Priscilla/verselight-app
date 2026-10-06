import { describe, expect, it } from "vitest";
import { fakeEnglish, fakeMalayalam, JOHN, ROMANS } from "../test/fakeBible";
import { findReference, findSongs, findVerses, globalSearch, songSnippet, type BibleSource } from "./globalSearch";
import type { BibleMeta, Song } from "./types";

const meta = (id: string, abbreviation: string, language: "en" | "ml"): BibleMeta =>
  ({ id, name: abbreviation, abbreviation, license: "", language, bookCount: 66, importedAt: 0 });
const en: BibleSource = { meta: meta("ten", "TEN", "en"), data: fakeEnglish() };
const ml: BibleSource = { meta: meta("tml", "TML", "ml"), data: fakeMalayalam() };

// Placeholder words only: VerseLight never ships song lyrics.
const song = (id: string, patch: Partial<Song>): Song => ({
  kind: "song", id, title: "", artist: "", copyright: "", ccli: "", linesPerSlide: 0, updatedAt: 0,
  lyrics: "", arrangement: [], hidden: [], ...patch,
});
const songs: Song[] = [
  song("en1", { title: "Morning Light", language: "en", lyrics: "[Verse 1]\nSun is rising over hills\n\n[Chorus]\nSing along now" }),
  song("ml1", { title: "പ്രഭാത ഗാനം", altTitle: "Prabhatha Ganam", language: "ml",
    lyrics: "[Verse 1]\nസൂര്യൻ ഉദിക്കുന്നു\n\n[Chorus]\nനാം പാടുന്നു",
    translation: "[Verse 1]\nThe dawn is breaking\n\n[Chorus]\nWe are singing", translationLanguage: "en" }),
  song("ta1", { title: "காலை பாடல்", language: "ta", lyrics: "[Verse 1]\nசூரியன் உதிக்கிறது" }),
  song("kn1", { title: "ಬೆಳಗಿನ ಹಾಡು", language: "kn", lyrics: "[Verse 1]\nಸೂರ್ಯ ಉದಯಿಸುತ್ತಾನೆ",
    translation: "[Verse 1]\nThe sun comes up", translationLanguage: "en" }),
  // Malayalam typed with the old chillu (ന + ് + ZWJ) instead of the atomic ൻ.
  song("ml2", { title: "പഴയ കീബോർഡ്", language: "ml", lyrics: "[Verse 1]\nയേശുവന്‍ നാഥന്‍" }),
];

describe("Bible references", () => {
  it("finds John 3:16 in the translation being read", () => {
    const r = findReference([en, ml], "John 3:16")!;
    expect(r).toMatchObject({ bibleId: "ten", book: JOHN, chapter: 3, verse: 16, to: 16, label: "John 3:16", translation: "TEN", reference: true });
    expect(r.text).toBe("placeholder love and faith words");
  });

  it("opens a whole chapter for a chapter reference", () => {
    expect(findReference([en], "John 3")).toMatchObject({ book: JOHN, chapter: 3, verse: 1, to: 18, label: "John 3" });
    expect(findReference([en], "Romans 8")).toMatchObject({ book: ROMANS, chapter: 8, verse: 1, to: 30, label: "Romans 8" });
  });

  it("finds Malayalam book names in the Malayalam Bible", () => {
    expect(findReference([en, ml], "യോഹന്നാൻ 3:16")).toMatchObject({ bibleId: "tml", book: JOHN, verse: 16, lang: "ml" });
  });

  it("takes words without a number for a book only when they start its name", () => {
    expect(findReference([en], "Acts")).toMatchObject({ label: "Acts 1" });
    expect(findReference([en], "an")).toBeNull(); // inside "Daniel"
    expect(findReference([en], "love")).toBeNull();
  });
});

describe("Bible words", () => {
  it("finds verses with every word, the translation being read first", () => {
    const { hits, total } = findVerses([en, ml], "love");
    expect(hits.map((h) => h.label)).toEqual(["John 3:16", "Romans 8:28"]);
    expect(total).toBe(2);
  });

  it("matches the start of words, not the middle", () => {
    expect(findVerses([en], "plac").hits.length).toBeGreaterThan(0);
    expect(findVerses([en], "ove").hits).toEqual([]);
  });

  it("finds Malayalam words in the Malayalam Bible while reading English", () => {
    const { hits } = findVerses([en, ml], "സ്നേഹം");
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ bibleId: "tml", book: JOHN, chapter: 3, verse: 16, lang: "ml" });
  });
});

describe("songs", () => {
  it("finds a song by its title, without a snippet", () => {
    expect(findSongs(songs, "morning")).toEqual([{ song: songs[0], snippet: null }]);
  });

  it("finds English lyrics, with the line they are in", () => {
    const [r] = findSongs(songs, "hills");
    expect(r.song.id).toBe("en1");
    expect(r.snippet).toEqual({ text: "Sun is rising over hills", lang: "en", part: "lyrics" });
  });

  it("finds Malayalam lyrics and their English translation", () => {
    expect(findSongs(songs, "ഉദിക്കുന്നു")[0]).toMatchObject({ song: { id: "ml1" }, snippet: { part: "lyrics", lang: "ml" } });
    expect(findSongs(songs, "dawn breaking")[0]).toMatchObject({ song: { id: "ml1" }, snippet: { text: "The dawn is breaking", part: "translation", lang: "en" } });
    expect(findSongs(songs, "prabhatha")[0].song.id).toBe("ml1");
  });

  it("finds Tamil and Kannada songs, and Kannada's translation", () => {
    expect(findSongs(songs, "சூரியன்")[0]).toMatchObject({ song: { id: "ta1" }, snippet: { lang: "ta" } });
    expect(findSongs(songs, "ಹಾಡು")[0].song.id).toBe("kn1");
    expect(findSongs(songs, "sun comes")[0]).toMatchObject({ song: { id: "kn1" }, snippet: { part: "translation" } });
  });

  it("matches Malayalam however the chillu letters were typed", () => {
    expect(findSongs(songs, "യേശുവൻ")[0].song.id).toBe("ml2");
  });

  it("never matches the section tags", () => {
    expect(findSongs(songs, "chorus")).toEqual([]);
    expect(songSnippet(songs[0], "verse")).toBeNull();
  });
});

describe("globalSearch", () => {
  it("groups Bible and song results", () => {
    const r = globalSearch("sing", [en], songs);
    expect(r.bible).toEqual([]);
    expect(r.songs.map((s) => s.song.id).sort()).toEqual(["en1", "ml1"]);
  });

  it("puts a reference first and does not search the verses for it", () => {
    const r = globalSearch("John 3:16", [en], songs);
    expect(r.bible).toHaveLength(1);
    expect(r.bible[0].reference).toBe(true);
  });

  it("returns nothing for an empty query", () => {
    expect(globalSearch("  ", [en], songs)).toEqual({ query: "", bible: [], bibleTotal: 0, songs: [] });
  });
});
