import { describe, expect, it } from "vitest";
import { normalizeLibrary } from "../state/library";
import { activeService, entriesToward, entryInfo, entryLabel, moveEntry, passageReference, passageTranslations, planEntries, setEntries, WHOLE_CHAPTER } from "./plan";
import { chapterNeighbours, neighbourChapter, passageSlides, verseKey, type Session } from "./session";
import type { BibleMeta, Library, NewPlanEntry, PlanEntry, PlanPassage, Slide, Song } from "./types";

const song = (id: string, title: string, lyrics = "[Verse 1]\nOne line"): Song => ({
  kind: "song", id, title, artist: "", copyright: "", ccli: "", lyrics, linesPerSlide: 0, arrangement: [], hidden: [], updatedAt: 0,
});
const bibles: BibleMeta[] = [
  { id: "kjv", name: "King James", abbreviation: "KJV", license: "", language: "en", bookCount: 66, importedAt: 0 },
  { id: "mal", name: "Malayalam", abbreviation: "MAL", license: "", language: "ml", bookCount: 66, importedAt: 0 },
];
const john316: PlanPassage = { primaryId: "kjv", onScreen: "first", book: 42, chapter: 3, from: 16, to: 16 };
const e = (id: string, rest: NewPlanEntry) => ({ id, ...rest }) as PlanEntry;

describe("the plan in the library", () => {
  it("lives in the active service, and new libraries start with an empty one", () => {
    const lib = normalizeLibrary({} as Library);
    expect(activeService(lib)?.name).toBe("Sunday Service");
    expect(planEntries(lib)).toEqual([]);
  });

  it("names the old placeholder service, and leaves named or used services alone", () => {
    const lib = normalizeLibrary({ services: [
      { id: "a", name: "Presentation", itemIds: [], updatedAt: 0 },
      { id: "b", name: "Evening", itemIds: [], updatedAt: 0 },
    ] } as unknown as Library);
    expect(lib.services.map((s) => s.name)).toEqual(["Sunday Service", "Evening"]);
  });

  it("changes only the plan, never the songs or anything else", () => {
    const lib = normalizeLibrary({ items: [song("s1", "Amazing Grace")] } as unknown as Library);
    const next = setEntries(lib, () => [e("1", { kind: "song", songId: "s1" })]);
    expect(planEntries(next)).toHaveLength(1);
    expect(next.items).toBe(lib.items);
    expect(next.bibles).toBe(lib.bibles);
  });
});

describe("reordering", () => {
  const list = ["a", "b", "c", "d"].map((id) => e(id, { kind: "song", songId: id }));
  it("moves an item to a new place", () => {
    expect(moveEntry(list, 0, 2).map((x) => x.id)).toEqual(["b", "c", "a", "d"]);
    expect(moveEntry(list, 3, 0).map((x) => x.id)).toEqual(["d", "a", "b", "c"]);
  });
  it("ignores moves outside the list", () => {
    expect(moveEntry(list, 0, 4)).toBe(list);
    expect(moveEntry(list, -1, 1)).toBe(list);
  });
});

describe("what a row shows", () => {
  const songs = new Map([["s1", song("s1", "Amazing Grace")], ["empty", song("empty", "Blank", "")]]);
  it("labels items by role, with a default for each kind", () => {
    expect(entryLabel(e("1", { kind: "song", songId: "s1" }))).toBe("Song");
    expect(entryLabel(e("1", { kind: "bible", passage: john316 }))).toBe("Bible Reading");
    expect(entryLabel(e("1", { kind: "song", songId: "s1", label: "Opening Song" }))).toBe("Opening Song");
    expect(entryLabel(e("1", { kind: "song", songId: "s1", label: "  " }))).toBe("Song");
  });
  it("names passages and their translations", () => {
    expect(passageReference(john316)).toBe("John 3:16");
    expect(passageReference({ ...john316, book: 18, chapter: 23, from: 1, to: 6 })).toBe("Psalms 23:1–6");
    expect(passageReference({ ...john316, from: 1, to: WHOLE_CHAPTER })).toBe("John 3");
    expect(passageTranslations(john316, bibles)).toBe("KJV");
    expect(passageTranslations({ ...john316, secondId: "mal", onScreen: "both" }, bibles)).toBe("KJV · MAL");
  });
  it("says why an item can't be presented", () => {
    expect(entryInfo(e("1", { kind: "song", songId: "s1" }), songs, bibles)).toMatchObject({ title: "Amazing Grace", problem: null });
    expect(entryInfo(e("1", { kind: "song", songId: "gone" }), songs, bibles).problem).toMatch(/deleted/);
    expect(entryInfo(e("1", { kind: "song", songId: "empty" }), songs, bibles).problem).toMatch(/no slides/);
    expect(entryInfo(e("1", { kind: "bible", passage: { ...john316, primaryId: "gone" } }), songs, bibles).problem).toMatch(/removed/);
    expect(entryInfo(e("1", { kind: "bible", passage: john316, reference: "യോഹന്നാൻ 3:16" }), songs, bibles).title).toBe("യോഹന്നാൻ 3:16");
  });
});

describe("moving between items", () => {
  it("lists the items toward an end, nearest first", () => {
    expect(entriesToward(5, 1, 1)).toEqual([2, 3, 4]);
    expect(entriesToward(5, 1, -1)).toEqual([0]);
    expect(entriesToward(5, 4, 1)).toEqual([]);
    expect(entriesToward(5, 0, -1)).toEqual([]);
  });
});

describe("a planned reading", () => {
  const slide = (v: number): Slide => ({ key: verseKey(42, 3, v), itemId: "bible", kind: "scripture", label: `John 3:${v}`, lines: [`v${v}`], footer: "" });
  const chapter = Array.from({ length: 18 }, (_, i) => slide(i + 1));

  it("shows exactly its verses", () => {
    expect(passageSlides(john316, chapter).map((s) => s.label)).toEqual(["John 3:16"]);
    expect(passageSlides({ ...john316, from: 1, to: 3 }, chapter)).toHaveLength(3);
    expect(passageSlides({ ...john316, from: 17, to: WHOLE_CHAPTER }, chapter)).toHaveLength(2);
  });

  it("never runs on into the rest of the chapter or the next one", () => {
    const session: Session = { kind: "scripture", spec: { ...john316 }, chapters: [3], slides: [chapter[15]], bookName: "John", chaptersInBook: 21, bounded: true };
    expect(chapterNeighbours(session)).toEqual({ before: null, after: null });
    expect(neighbourChapter(session, 0, 1, 1, 21)).toBeNull();
    expect(neighbourChapter(session, 0, 1, -1, 21)).toBeNull();
    // A Bible screen session still runs on, as before.
    expect(chapterNeighbours({ ...session, bounded: false }).after).toBe("John 4");
  });
});
