import { describe, expect, it } from "vitest";
import { fakeEnglish, fakeMalayalam, JOHN } from "../test/fakeBible";
import { addBookmark, bookmarkLabel, bookmarkVerses, findBookmark, lastVerse, removeBookmark } from "./bookmarks";
import type { Bookmark } from "./types";

const en = fakeEnglish();
const ml = fakeMalayalam();

describe("saved verses", () => {
  it("saves a verse and a passage, newest first, without duplicates", () => {
    let list: Bookmark[] = [];
    list = addBookmark(list, { book: JOHN, chapter: 3, from: 16, translation: "TEN" }, 1);
    list = addBookmark(list, { book: JOHN, chapter: 3, from: 16, to: 18, translation: "TEN" }, 2);
    list = addBookmark(list, { book: JOHN, chapter: 3, from: 16, translation: "TEN" }, 3);
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ verse: 16, to: 18, savedAt: 2 });
    expect(list[1].to).toBeUndefined();
  });

  it("tells a single verse from a passage that starts there", () => {
    const list = addBookmark([], { book: JOHN, chapter: 3, from: 16, to: 18, translation: "TEN" });
    expect(findBookmark(list, JOHN, 3, 16)).toBeUndefined();
    expect(findBookmark(list, JOHN, 3, 16, 18)).toBe(list[0]);
    expect(lastVerse(list[0])).toBe(18);
  });

  it("removes a saved verse", () => {
    const list = addBookmark([], { book: JOHN, chapter: 3, from: 16, translation: "TEN" });
    expect(removeBookmark(list, list[0].id)).toEqual([]);
  });

  it("names a saved passage in the translation being read", () => {
    const b = { book: JOHN, chapter: 3, verse: 16, to: 18 };
    expect(bookmarkLabel(b, en)).toBe("John 3:16–18");
    expect(bookmarkLabel(b, ml)).toBe("യോഹന്നാൻ 3:16–18");
    expect(bookmarkLabel({ book: JOHN, chapter: 3, verse: 16 })).toBe("John 3:16");
  });

  it("shows a saved passage in another translation and notes verses it doesn't have", () => {
    const b: Bookmark = { id: "b", book: JOHN, chapter: 3, verse: 17, to: 18, translation: "TEN", savedAt: 0 };
    expect(bookmarkVerses(en, b)).toMatchObject({ missing: false, verses: [{ verse: 17 }, { verse: 18 }] });
    expect(bookmarkVerses(ml, b)).toMatchObject({ missing: true, verses: [{ verse: 17 }] });
    expect(bookmarkVerses(null, b)).toEqual({ verses: [], missing: true });
  });
});
