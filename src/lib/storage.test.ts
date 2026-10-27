// @vitest-environment jsdom
// Browser storage for VerseLight's data files: IndexedDB, with localStorage kept only as a fallback.
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeEnglish, fakeMalayalam, JOHN } from "../test/fakeBible";

/** A fresh copy of the storage and data modules, as after reloading the app (IndexedDB contents persist). */
async function reload() {
  vi.resetModules();
  return {
    storage: await import("./storage"),
    bible: await import("./bible"),
  };
}

const lsChars = () => Object.keys(localStorage).reduce((n, k) => n + k.length + (localStorage.getItem(k)?.length ?? 0), 0);

beforeEach(async () => {
  localStorage.clear();
  const { storage } = await reload();
  for (const name of ["library.json", "bible-a.json", "bible-ml.json", "old.json"]) await storage.deleteData(name);
});

describe("Bibles and the library", () => {
  it("stores a Bible the size of a full translation, English and Malayalam, without localStorage", async () => {
    const { bible } = await reload();
    const en = fakeEnglish();
    // Pad to the size of a real Bible file (the KJV is about 4.2 million characters).
    en.books[0].chapters[0] = Array.from({ length: 4000 }, (_, i) => `filler verse ${i} `.repeat(70));
    const enMeta = await bible.saveBible(en);
    const mlMeta = await bible.saveBible(fakeMalayalam());
    expect(JSON.stringify(en).length).toBeGreaterThan(4_000_000);
    expect(lsChars()).toBe(0);
    expect(mlMeta.language).toBe("ml");

    const after = await reload();
    expect((await after.bible.loadBible(enMeta.id))!.books[0].chapters[0]).toHaveLength(4000);
    const ml = (await after.bible.loadBible(mlMeta.id))!;
    expect(ml.books[JOHN].name).toBe("യോഹന്നാൻ");
    expect(ml.books[JOHN].chapters[2]).toHaveLength(17);
  });

  it("keeps an imported KJV file as it was and shows its verses without the brace markup", async () => {
    const { bible } = await reload();
    const en = fakeEnglish();
    en.books[0].chapters[0][0] = "And God saw the light, that {it was} good. {the light: Heb. between the light}";
    const meta = await bible.saveBible(en);
    const shown = "And God saw the light, that it was good.";
    expect((await bible.loadBible(meta.id))!.books[0].chapters[0][0]).toBe(shown);

    const after = await reload();
    expect((await after.bible.loadBible(meta.id))!.books[0].chapters[0][0]).toBe(shown);
    expect(await after.storage.readData(after.bible.bibleFileName(meta.id))).toContain("{it was}");
  });

  it("moves files saved in localStorage by earlier versions into IndexedDB on first read", async () => {
    localStorage.setItem("verselight:old.json", "saved by an earlier version");
    let { storage } = await reload();
    expect(await storage.readData("old.json")).toBe("saved by an earlier version");
    expect(localStorage.getItem("verselight:old.json")).toBeNull();
    ({ storage } = await reload());
    expect(await storage.readData("old.json")).toBe("saved by an earlier version");
  });

  it("writes, overwrites and deletes files", async () => {
    const { storage } = await reload();
    expect(await storage.readData("library.json")).toBeNull();
    await storage.writeData("library.json", "one");
    await storage.writeData("library.json", "two");
    expect(await storage.readData("library.json")).toBe("two");
    localStorage.setItem("verselight:library.json", "stale copy");
    await storage.deleteData("library.json");
    expect(await storage.readData("library.json")).toBeNull();
    expect(localStorage.getItem("verselight:library.json")).toBeNull();
  });
});
