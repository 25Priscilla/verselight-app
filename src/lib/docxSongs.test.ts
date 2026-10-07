import { describe, expect, it } from "vitest";
import { docxParagraphs, docxSongFile, looksEnglish, parseDocxSongs, planDocxImport } from "./docxSongs";
import { parseSongFile, planSongImport, toSong } from "./songImport";
import type { Song } from "./types";

// Placeholder words only: VerseLight never ships song lyrics.
const p = (text: string) => `<w:p><w:r><w:t xml:space="preserve">${text.replace(/\n/g, "</w:t><w:br/><w:t>")}</w:t></w:r></w:p>`;
const doc = (...paras: string[]) => `<?xml version="1.0"?><w:document><w:body>${paras.map(p).join("")}<w:sectPr/></w:body></w:document>`;
const read = (...paras: string[]) => parseDocxSongs(docxParagraphs(doc(...paras)));

const songA = ["1Paattu onnu (43)", "പാട്ട് ഒന്ന് ", "Chorus", "പല്ലവി വരി\nപല്ലവി രണ്ട്(2)", "pallavi vari\npallavi randu(2)",
  "Verse 1", "1 വരി ഒന്ന്;- പല്ലവി..", "1 vari onnu;-"];
const songB = ["2 Paattu randu", "പാട്ട് രണ്ട്", "Verse 1", "വരി", "vari"];
const libSong = (over: Partial<Song>): Song => ({
  kind: "song", id: "x", title: "", artist: "", copyright: "", ccli: "", lyrics: "[Verse 1]\nമറ്റൊന്ന്", linesPerSlide: 0,
  arrangement: [], hidden: [], updatedAt: 0, ...over,
});

describe("reading songs from a Word document", () => {
  it("reads paragraphs with line breaks, tabs and entities, leaving out deleted text", () => {
    const xml = `<w:body><w:p><w:r><w:t>a &amp; b</w:t><w:br/><w:t>c</w:t><w:tab/><w:t>d</w:t></w:r><w:del><w:r><w:delText>gone</w:delText></w:r></w:del></w:p><w:p/></w:body>`;
    expect(docxParagraphs(xml)).toEqual(["a & b\nc\td", ""]);
  });

  it("finds each song, removes the bracketed number from the heading, and keeps the Malayalam exactly", () => {
    const { songs, stray } = read(...songA, "", ...songB);
    expect(stray).toEqual([]);
    expect(songs.map((s) => [s.number, s.altTitle, s.removedNumber, s.title])).toEqual([
      [1, "Paattu onnu", "(43)", "പാട്ട് ഒന്ന് "],
      [2, "Paattu randu", "", "പാട്ട് രണ്ട്"],
    ]);
    expect(songs[0].lyrics).toBe("[Chorus]\nപല്ലവി വരി\nപല്ലവി രണ്ട്(2)\n\n[Verse 1]\n1 വരി ഒന്ന്;- പല്ലവി..");
    expect(songs[0].problems).toEqual([]);
  });

  it("leaves transliterations out and never stores them as a translation", () => {
    const [s] = read(...songA).songs;
    expect(s.transliterations).toBe(2);
    expect(s.lyrics).not.toMatch(/pallavi|vari/);
    const entry = docxSongFile([s], "x").songs[0];
    expect(entry).not.toHaveProperty("translation");
    expect(toSong(entry).translation).toBeUndefined();
  });

  it("holds back a song that uses one label twice, or has lines with no label, instead of dropping words", () => {
    const [s] = read("3 Paattu", "പാട്ട്", "Verse 1", "ഒന്ന്", "onnu", "Chorus", "പല്ലവി", "pallavi", "Chorus", "ഹല്ലേലൂയ്യാ", "halleluyya", "", "വേറെ", "vere").songs;
    expect(s.problems).toHaveLength(2);
    expect(s.problems[0]).toMatch(/"Chorus" is used for two different sections/);
    expect(s.problems[1]).toMatch(/no section label of their own.*വേറെ/);
    expect(planDocxImport({ songs: [s], stray: [] }, []).problems).toEqual([s]);
  });

  it("holds back a block that reads like English rather than guessing it is a translation", () => {
    expect(looksEnglish("You are my God and I will love you all my days")).toBe(true);
    expect(looksEnglish("Than sneham valiyathu than krupakal valiyathu")).toBe(false);
    const [s] = read("4 Paattu", "പാട്ട്", "Verse 1", "വരി", "You are my God and I will love you all my days").songs;
    expect(s.problems[0]).toMatch(/looks like English/);
  });
});

describe("comparing the document with the library", () => {
  it("adds only songs that aren't in the library, and never touches the ones that are", () => {
    const existing = libSong({ title: "പാട്ട് ഒന്ന്", lyrics: "[Verse 1]\nമുമ്പേ ഉള്ളത്" });
    const before = structuredClone(existing);
    const plan = planDocxImport(read(...songA, ...songB), [existing]);
    expect(plan.existing.map((e) => e.song.number)).toEqual([1]);
    expect(plan.fresh.map((s) => s.number)).toEqual([2]);
    expect(existing).toEqual(before);
  });

  it("can be run again as the document grows: songs imported last time are skipped", () => {
    const first = planDocxImport(read(...songA), []);
    const imported = parseSongFile(JSON.stringify(docxSongFile(first.fresh, "x"))).songs.map(toSong);
    const again = planDocxImport(read(...songA, ...songB), imported);
    expect(again.existing.map((e) => e.song.number)).toEqual([1]);
    expect(again.fresh.map((s) => s.number)).toEqual([2]);
  });

  it("holds back possible duplicates for review instead of importing or merging them", () => {
    const plan = planDocxImport(read(...songA, ...songB, "5 Paattu randu", "പാട്ട് അഞ്ച്", "Verse 1", "വേറൊരു വരി", "x"), [
      libSong({ title: "പാട്ട് ഒന്ന്", artist: "A Writer" }),
    ]);
    expect(plan.possible.map((x) => [x.song.number, x.reason])).toEqual([
      [1, "same Malayalam title (different writer)"],
      [5, "same English/transliterated title"],
    ]);
    expect(plan.fresh.map((s) => s.number)).toEqual([2]);
  });

  it("writes a song file VerseLight's import reads, with nothing filled in that the document doesn't give", () => {
    const file = docxSongFile(read(...songA).songs, "New songs");
    const parsed = parseSongFile(JSON.stringify(file));
    expect(planSongImport(parsed, []).fresh).toHaveLength(1);
    const s = toSong(parsed.songs[0]);
    expect(s).toMatchObject({ title: "പാട്ട് ഒന്ന്", altTitle: "Paattu onnu", language: "ml", artist: "", copyright: "", ccli: "" });
    expect(s).not.toHaveProperty("license");
    expect(s).not.toHaveProperty("source");
    expect(s).not.toHaveProperty("translator");
    expect(JSON.stringify(file)).not.toContain("(43)");
  });
});
