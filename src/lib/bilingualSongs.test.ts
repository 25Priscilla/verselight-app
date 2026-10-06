import { describe, expect, it } from "vitest";
import { languageLabel, detectScript } from "./languages";
import { displayChoices, hasTranslation, sectionTags, songDisplay, translationPairing } from "./lyrics";
import { detectLanguage, songLanguages, songMatches } from "./malayalam";
import { slidesFor, songSlideKey, songSlidesAll } from "./slides";
import { parseSongFile, toSong } from "./songImport";
import type { Song } from "./types";

// Placeholder words only ("line one", "chorus line" in each language): VerseLight never ships song lyrics or translations.
const ML = "[Verse 1]\nവരി ഒന്ന്\nവരി രണ്ട്\n\n[Chorus]\nകോറസ് വരി\n\n[Verse 2]\nവരി മൂന്ന്\n\n[Chorus]";
const EN = "[Verse 1]\nLine one\nLine two\n\n[Chorus]\nChorus line\n\n[Verse 2]\nLine three";

const song = (over: Partial<Song> = {}): Song => ({
  kind: "song", id: "b1", title: "പാട്ട്", altTitle: "Pattu", artist: "Writer", copyright: "", ccli: "", linesPerSlide: 0, updatedAt: 0,
  language: "ml", lyrics: ML, translation: EN, translationLanguage: "en", arrangement: [], hidden: [],
  ...over,
});
const english = (): Song => ({
  kind: "song", id: "e1", title: "Morning Song", artist: "Writer", copyright: "", ccli: "", linesPerSlide: 0, updatedAt: 0, language: "en",
  lyrics: "[Verse 1]\nSun is rising\n\n[Chorus]\nSing along now\n\n[Chorus]", arrangement: [], hidden: [],
});

describe("songs in one language", () => {
  it("are unchanged: no translation, the lyrics only, whatever display says", () => {
    const s = english();
    expect(hasTranslation(s)).toBe(false);
    expect(songDisplay(s)).toBe("primary");
    expect(songDisplay({ ...s, display: "both" })).toBe("primary");
    expect(slidesFor(s).map((x) => [x.label, x.lines, x.lang, x.parallelLines])).toEqual([
      ["Verse 1", ["Sun is rising"], "en", undefined],
      ["Chorus", ["Sing along now"], "en", undefined],
      ["Chorus", ["Sing along now"], "en", undefined],
    ]);
  });

  it("treat an empty translation box as no translation", () => {
    const s = song({ translation: "  \n " });
    expect(hasTranslation(s)).toBe(false);
    expect(slidesFor(s).every((x) => x.parallelLines === undefined && x.lang === "ml")).toBe(true);
  });
});

describe("a Malayalam song with its English translation", () => {
  it("shows both by default: each section's Malayalam with that section's English, never mixed", () => {
    const slides = slidesFor(song());
    expect(songDisplay(song())).toBe("both");
    expect(slides.map((x) => [x.label, x.lines, x.parallelLines])).toEqual([
      ["Verse 1", ["വരി ഒന്ന്", "വരി രണ്ട്"], ["Line one", "Line two"]],
      ["Chorus", ["കോറസ് വരി"], ["Chorus line"]],
      ["Verse 2", ["വരി മൂന്ന്"], ["Line three"]],
      ["Chorus", ["കോറസ് വരി"], ["Chorus line"]],
    ]);
    expect(slides.every((x) => x.lang === "ml" && x.parallelLang === "en" && x.kind === "song")).toBe(true);
  });

  it("shows only the Malayalam", () => {
    const slides = slidesFor(song({ display: "primary" }));
    expect(slides.map((x) => x.lines)).toEqual([["വരി ഒന്ന്", "വരി രണ്ട്"], ["കോറസ് വരി"], ["വരി മൂന്ന്"], ["കോറസ് വരി"]]);
    expect(slides.every((x) => x.lang === "ml" && x.parallelLines === undefined)).toBe(true);
  });

  it("shows only the English, marked as English", () => {
    const slides = slidesFor(song({ display: "translation" }));
    expect(slides.map((x) => x.lines)).toEqual([["Line one", "Line two"], ["Chorus line"], ["Line three"], ["Chorus line"]]);
    expect(slides.every((x) => x.lang === "en" && x.parallelLines === undefined)).toBe(true);
  });

  it("keeps the same slide keys in every display, so backgrounds and the live slide stay put", () => {
    const keys = (s: Song) => slidesFor(s).map((x) => x.key);
    expect(keys(song({ display: "primary" }))).toEqual(keys(song({ display: "translation" })));
    expect(keys(song({ display: "both" }))).toEqual(keys(song({ display: "primary" })));
    expect(keys(song())[3]).toBe(songSlideKey("b1", "Chorus", 1, 0));
  });

  it("follows the lyrics' play order, left-out slides and lines per slide", () => {
    const s = song({ arrangement: ["Chorus", "Verse 1"], hidden: ["Chorus#0"], linesPerSlide: 1 });
    expect(slidesFor(s).map((x) => [x.label, x.lines, x.parallelLines])).toEqual([
      ["Verse 1 · 1/2", ["വരി ഒന്ന്"], ["Line one"]],
      ["Verse 1 · 2/2", ["വരി രണ്ട്"], ["Line two"]],
    ]);
  });

  it("keeps every line break and the Malayalam text exactly as typed", () => {
    // Old-style chillu (consonant + virama + ZWJ) must not be rewritten for the screen.
    const typed = "[Verse 1]\nകര്‍ത്താവ്\n  indented line\nlast line";
    const s = song({ lyrics: typed, translation: "[Verse 1]\nfirst\nsecond\nthird", linesPerSlide: 0 });
    const [slide] = slidesFor(s);
    expect(slide.lines).toEqual(["കര്‍ത്താവ്", "  indented line", "last line"]);
    expect(slide.parallelLines).toEqual(["first", "second", "third"]);
  });

  it("shows the lyrics for a section that isn't translated yet", () => {
    const s = song({ translation: "[Verse 1]\nLine one\nLine two" });
    expect(slidesFor({ ...s, display: "both" })[1]).toMatchObject({ label: "Chorus", lines: ["കോറസ് വരി"], lang: "ml" });
    expect(slidesFor({ ...s, display: "both" })[1].parallelLines).toBeUndefined();
    expect(slidesFor({ ...s, display: "translation" }).map((x) => x.lines[0])).toEqual(["Line one", "കോറസ് വരി", "വരി മൂന്ന്", "കോറസ് വരി"]);
  });

  it("pairs a section's slides in order when one language splits into more slides", () => {
    const s = song({ lyrics: "[Verse 1]\nവരി ഒന്ന്\nവരി രണ്ട്", translation: "[Verse 1]\nLine one\n\nLine two" });
    expect(songSlidesAll(s).map((x) => [x.label, x.lines, x.parallelLines])).toEqual([
      ["Verse 1 · 1/2", ["വരി ഒന്ന്", "വരി രണ്ട്"], ["Line one"]],
      ["Verse 1 · 2/2", [], ["Line two"]],
    ]);
    expect(translationPairing(s).uneven).toEqual(["Verse 1"]);
  });

  it("reports untranslated sections, sections only in the translation and sections written twice", () => {
    const s = song({ translation: "[Verse 1]\nLine one\n\n[Verse 5]\nExtra\n\n[Verse 1]\nAgain" });
    expect(translationPairing(s)).toEqual({ missing: ["Chorus", "Verse 2"], extra: ["Verse 5"], duplicates: ["Verse 1"], uneven: [] });
    expect(translationPairing(song())).toEqual({ missing: [], extra: [], duplicates: [], uneven: [] });
  });

  it("starts a translation with the lyrics' section tags only, never the words", () => {
    expect(sectionTags(ML)).toBe("[Verse 1]\n\n[Chorus]\n\n[Verse 2]\n");
    expect(translationPairing(song({ translation: sectionTags(ML) })).missing).toEqual(["Verse 1", "Chorus", "Verse 2"]);
  });

  it("names the display choices by language", () => {
    expect(displayChoices(song()).map((c) => c.label)).toEqual(["Malayalam", "English", "Both"]);
    expect(displayChoices(song({ translationLanguage: "ml" })).map((c) => c.label)).toEqual(["Lyrics", "Translation", "Both"]);
  });

  it("is found by words in either language, and listed under both", () => {
    expect(songMatches(song(), "chorus line")).toBe(true);
    expect(songMatches(song(), "വരി മൂന്ന്")).toBe(true);
    expect(songMatches(song(), "chorus")).toBe(true);
    expect(songMatches(english(), "chorus")).toBe(false);
    expect(songLanguages(song())).toEqual(["ml", "en"]);
    expect(songLanguages(english())).toEqual(["en"]);
  });
});

describe("other language pairs", () => {
  it("work the same for Tamil + English, Kannada + English and Malayalam + Tamil", () => {
    const ta = song({ language: "ta", lyrics: "[Verse 1]\nவரி ஒன்று", translation: "[Verse 1]\nLine one", translationLanguage: "en" });
    const kn = song({ language: "kn", lyrics: "[Verse 1]\nಸಾಲು ಒಂದು", translation: "[Verse 1]\nLine one", translationLanguage: "en" });
    const mlTa = song({ lyrics: "[Verse 1]\nവരി ഒന്ന്", translation: "[Verse 1]\nவரி ஒன்று", translationLanguage: "ta" });
    expect(slidesFor(ta)[0]).toMatchObject({ lines: ["வரி ஒன்று"], lang: "ta", parallelLines: ["Line one"], parallelLang: "en" });
    expect(slidesFor(kn)[0]).toMatchObject({ lines: ["ಸಾಲು ಒಂದು"], lang: "kn", parallelLines: ["Line one"], parallelLang: "en" });
    expect(slidesFor(mlTa)[0]).toMatchObject({ lines: ["വരി ഒന്ന്"], lang: "ml", parallelLines: ["வரி ஒன்று"], parallelLang: "ta" });
    expect(slidesFor({ ...mlTa, display: "translation" })[0]).toMatchObject({ lines: ["வரி ஒன்று"], lang: "ta" });
    expect(displayChoices(mlTa).map((c) => c.label)).toEqual(["Malayalam", "Tamil", "Both"]);
  });

  it("recognises Tamil and Kannada text, and still tells Malayalam from English", () => {
    expect(detectScript("வரி ஒன்று")).toBe("ta");
    expect(detectScript("ಸಾಲು ಒಂದು")).toBe("kn");
    expect(detectLanguage({ title: "Song", lyrics: "[Verse 1]\nവരി ഒന്ന്" })).toBe("ml");
    expect(detectLanguage({ title: "Song", lyrics: "[Verse 1]\nLine one" })).toBe("en");
    expect(languageLabel("ta")).toBe("Tamil · தமிழ்");
    expect(languageLabel("en")).toBe("English");
  });
});

describe("song files with a translation", () => {
  it("import the translation with the song, as one song", () => {
    const f = parseSongFile(JSON.stringify({ format: "verselight-songs", songs: [
      { title: "പാട്ട്", lyrics: "[Verse 1]\nവരി ഒന്ന്", translation: "[Verse 1]\nLine one", display: "translation" },
      { title: "Plain", lyrics: "[Verse 1]\nLine one" },
    ] }));
    const [both, plain] = f.songs.map(toSong);
    expect(both).toMatchObject({ language: "ml", translation: "[Verse 1]\nLine one", translationLanguage: "en", display: "translation" });
    expect(slidesFor(both)[0]).toMatchObject({ lines: ["Line one"], lang: "en" });
    expect(plain.translation).toBeUndefined();
    expect(plain.translationLanguage).toBeUndefined();
  });
});
