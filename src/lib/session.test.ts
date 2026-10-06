import { describe, expect, it } from "vitest";
import type { BibleData } from "./bible";
import {
  atEdge, chapterNeighbours, chapterSlides, followSlide, initialSession, neighbourChapter, sessionReducer, sessionSlides, verseKey,
  type ScriptureSpec, type Session, type SessionState,
} from "./session";
import type { Song } from "./types";

// Placeholder text only: VerseLight never ships Bible text.
const bible: BibleData = {
  format: "verselight-bible", name: "Test", abbreviation: "TST", license: "",
  books: [{ name: "Genesis", chapters: [1, 2, 3].map((c) => Array.from({ length: c === 2 ? 4 : 6 }, (_, v) => `Text ${c}:${v + 1}`)) }],
};
const src = { primary: bible, meta: { abbreviation: "TST", language: "en" as const } };
const spec: ScriptureSpec = { primaryId: "t", onScreen: "first", book: 0, chapter: 1, from: 3, to: 4 };

function scripture(chapters = [1]): Session & { kind: "scripture" } {
  return { kind: "scripture", spec, chapters, slides: chapters.flatMap((c) => chapterSlides(spec, c, src)), bookName: "Genesis", chaptersInBook: 3 };
}
const started = (index = 2): SessionState => sessionReducer(initialSession, { type: "start", session: scripture(), index });

describe("chapterSlides", () => {
  it("makes one slide per verse, in order, with the reference and translation", () => {
    const slides = chapterSlides(spec, 1, src);
    expect(slides.map((s) => s.label)).toEqual(["Genesis 1:1", "Genesis 1:2", "Genesis 1:3", "Genesis 1:4", "Genesis 1:5", "Genesis 1:6"]);
    expect(slides[2]).toMatchObject({ key: verseKey(0, 1, 3), lines: ["Text 1:3"], footer: "Genesis 1:3 (TST)", kind: "scripture" });
  });
});

describe("sessionReducer", () => {
  it("starts on the given slide with the screen showing", () => {
    expect(started()).toMatchObject({ index: 2, blackout: false, clear: false });
  });

  it("steps one slide at a time and stops at either end", () => {
    let s = started(4);
    s = sessionReducer(s, { type: "step", delta: 1, count: 6 });
    expect(s.index).toBe(5);
    s = sessionReducer(s, { type: "step", delta: 1, count: 6 });
    expect(s.index).toBe(5);
    s = sessionReducer({ ...s, index: 0 }, { type: "step", delta: -1, count: 6 });
    expect(s.index).toBe(0);
  });

  it("goes straight to a slide, clamped to the slides there are", () => {
    expect(sessionReducer(started(), { type: "goto", index: 4, count: 6 }).index).toBe(4);
    expect(sessionReducer(started(), { type: "goto", index: 99, count: 6 }).index).toBe(5);
  });

  it("toggles the black screen, and moving to another slide shows it again", () => {
    const black = sessionReducer(started(), { type: "blackout" });
    expect(black.blackout).toBe(true);
    expect(sessionReducer(black, { type: "blackout" }).blackout).toBe(false);
    expect(sessionReducer(black, { type: "step", delta: 1, count: 6 }).blackout).toBe(false);
  });

  it("runs on into the next chapter and lands on its first verse", () => {
    const s = sessionReducer({ ...started(), index: 5 }, { type: "extend", where: "after", chapter: 2, slides: chapterSlides(spec, 2, src), advance: true });
    const session = s.session as ReturnType<typeof scripture>;
    expect(session.chapters).toEqual([1, 2]);
    expect(session.slides).toHaveLength(10);
    expect(session.slides[s.index].label).toBe("Genesis 2:1");
  });

  it("runs back into the previous chapter and lands on its last verse, keeping later slides in place", () => {
    const start = sessionReducer(initialSession, { type: "start", session: scripture([2]), index: 0 });
    const s = sessionReducer(start, { type: "extend", where: "before", chapter: 1, slides: chapterSlides(spec, 1, src), advance: true });
    const session = s.session as ReturnType<typeof scripture>;
    expect(session.chapters).toEqual([1, 2]);
    expect(session.slides[s.index].label).toBe("Genesis 1:6");
    expect(session.slides[s.index + 1].label).toBe("Genesis 2:1");
  });

  it("never loads the same chapter twice", () => {
    const s = started();
    expect(sessionReducer(s, { type: "extend", where: "after", chapter: 1, slides: chapterSlides(spec, 1, src), advance: true })).toBe(s);
  });

  it("ends by clearing everything", () => {
    expect(sessionReducer(started(), { type: "end" })).toEqual(initialSession);
  });
});

describe("chapter run-on", () => {
  it("only asks for a neighbouring chapter at an end of the loaded slides", () => {
    expect(atEdge(5, 6, 1)).toBe(true);
    expect(atEdge(4, 6, 1)).toBe(false);
    expect(atEdge(0, 6, -1)).toBe(true);
    expect(atEdge(1, 6, -1)).toBe(false);
  });

  it("finds the next and previous chapter within the book", () => {
    expect(neighbourChapter(scripture([1]), 5, 6, 1, 3)).toEqual({ where: "after", chapter: 2 });
    expect(neighbourChapter(scripture([1]), 0, 6, -1, 3)).toBeNull();
    expect(neighbourChapter(scripture([2, 3]), 9, 10, 1, 3)).toBeNull();
    expect(neighbourChapter(scripture([2, 3]), 0, 10, -1, 3)).toEqual({ where: "before", chapter: 1 });
    expect(neighbourChapter(scripture([1]), 3, 6, 1, 3)).toBeNull();
  });

  it("names the chapters the operator can still run into", () => {
    expect(chapterNeighbours(scripture([1]))).toEqual({ before: null, after: "Genesis 2" });
    expect(chapterNeighbours(scripture([2]))).toEqual({ before: "Genesis 1", after: "Genesis 3" });
    expect(chapterNeighbours(scripture([2, 3]))).toEqual({ before: "Genesis 1", after: null });
    expect(chapterNeighbours({ kind: "song", songId: "s" })).toEqual({ before: null, after: null });
  });
});

describe("song sessions", () => {
  const song: Song = {
    kind: "song", id: "s1", title: "Song", artist: "", copyright: "", ccli: "", linesPerSlide: 0, updatedAt: 0,
    lyrics: "[Verse 1]\nOne\nTwo\n\nThree\n\n[Chorus]\nChorus line\n\n[Verse 2]\nFour\n\n[Chorus]\n",
    arrangement: [], hidden: [],
  };

  it("presents the slides in play order, repeating the chorus", () => {
    const slides = sessionSlides({ kind: "song", songId: "s1" }, new Map([["s1", song]]));
    expect(slides.map((s) => s.label)).toEqual(["Verse 1 · 1/2", "Verse 1 · 2/2", "Chorus", "Verse 2", "Chorus"]);
    expect(new Set(slides.map((s) => s.key)).size).toBe(slides.length);
  });

  it("follows the arrangement and leaves out hidden slides", () => {
    const arranged = { ...song, arrangement: ["Chorus", "Verse 2"], hidden: ["Verse 2#0"] };
    expect(sessionSlides({ kind: "song", songId: "s1" }, new Map([["s1", arranged]])).map((s) => s.label)).toEqual(["Chorus"]);
  });

  it("stays on the same words when the song on screen is rearranged, without changing Black", () => {
    const session: Session = { kind: "song", songId: "s1" };
    const before = sessionSlides(session, new Map([["s1", song]]));
    let s = sessionReducer(initialSession, { type: "start", session, index: 3 }); // Verse 2
    s = sessionReducer(s, { type: "blackout" });
    const after = sessionSlides(session, new Map([["s1", { ...song, arrangement: ["Verse 2", "Chorus", "Verse 1"] }]]));
    const at = followSlide(before[3].key, after, s.index);
    expect(at).toBe(0);
    s = sessionReducer(s, { type: "follow", index: at! });
    expect(after[s.index].label).toBe("Verse 2");
    expect(s.blackout).toBe(true);
  });

  it("doesn't move when the live slide is where it was, or was left out", () => {
    const session: Session = { kind: "song", songId: "s1" };
    const before = sessionSlides(session, new Map([["s1", song]]));
    expect(followSlide(before[2].key, before, 2)).toBeNull();
    const hidden = sessionSlides(session, new Map([["s1", { ...song, hidden: ["Verse 2#0"] }]]));
    expect(followSlide(before[3].key, hidden, 3)).toBeNull();
    expect(followSlide(null, before, 0)).toBeNull();
  });
});
