// @vitest-environment jsdom
// Browser storage for VerseLight's data files: IndexedDB, with localStorage kept only as a fallback.
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OSIS_BOOKS } from "./crossrefs";
import { fakeEnglish, fakeMalayalam, JOHN } from "../test/fakeBible";

/** OpenBible.info's full cross-reference file has 344,799 rows. */
const FULL_COUNT = 344_799;

/**
 * A synthetic file with the same header, row format and row count as OpenBible's cross_references.txt.
 * References and votes are generated: the real file is CC BY 4.0 data that isn't kept in the repository.
 */
function syntheticOpenBibleFile(rows = FULL_COUNT): string {
  const lines = ["From Verse\tTo Verse\tVotes\t#www.openbible.info CC-BY (synthetic test data)"];
  for (let i = 0; i < rows; i++) {
    const from = `${OSIS_BOOKS[i % 66]}.${1 + (i % 50)}.${1 + (Math.floor(i / 66) % 30)}`;
    const b = OSIS_BOOKS[(i * 7 + 3) % 66];
    const to = i % 5 === 0 ? `${b}.${1 + (i % 20)}.${1 + (i % 25)}-${b}.${1 + (i % 20)}.${3 + (i % 25)}` : `${b}.${1 + (i % 20)}.${1 + (i % 25)}`;
    lines.push(`${from}\t${to}\t${(i % 97) - 5}`);
  }
  return lines.join("\n") + "\n";
}

/** A fresh copy of the storage and data modules, as after reloading the app (IndexedDB contents persist). */
async function reload() {
  vi.resetModules();
  return {
    storage: await import("./storage"),
    crossrefs: await import("./crossrefs"),
    bible: await import("./bible"),
  };
}

const lsChars = () => Object.keys(localStorage).reduce((n, k) => n + k.length + (localStorage.getItem(k)?.length ?? 0), 0);

beforeEach(async () => {
  localStorage.clear();
  const { storage } = await reload();
  for (const name of ["crossrefs.json", "library.json", "bible-a.json", "bible-ml.json", "old.json"]) await storage.deleteData(name);
});

describe("cross references at full size", () => {
  const file = syntheticOpenBibleFile();

  it("is too big for localStorage: this is the quota error the import used to hit", async () => {
    const { crossrefs } = await reload();
    const json = JSON.stringify(crossrefs.parseOpenBibleTsv(file));
    expect(json.length).toBeGreaterThan(5_000_000);
    expect(() => localStorage.setItem("verselight:crossrefs.json", json)).toThrow(/quota/i);
    localStorage.clear();
  });

  it("imports all 344,799 references into IndexedDB, keeps them after a reload and finds them", async () => {
    let { crossrefs } = await reload();
    const data = crossrefs.parseCrossRefFile(file);
    expect(data.count).toBe(FULL_COUNT);
    await crossrefs.saveCrossRefs(data);

    // Nothing large lands in localStorage.
    expect(localStorage.getItem("verselight:crossrefs.json")).toBeNull();
    expect(lsChars()).toBeLessThan(1000);

    ({ crossrefs } = await reload());
    const loaded = (await crossrefs.loadCrossRefs())!;
    expect(loaded.count).toBe(FULL_COUNT);
    expect(Object.values(loaded.refs).reduce((n, flat) => n + flat.length / 3, 0)).toBe(FULL_COUNT);
    // Attribution travels with the data.
    expect(loaded.credit).toBe("Cross references: OpenBible.info, CC BY 4.0");
    expect(loaded.license).toBe("https://creativecommons.org/licenses/by/4.0/");

    // The synthetic file repeats some pairs, as Gen.1.1 → Num.1.1–Num.1.3 (row 0 has votes -5, row 9,900 has 1, …).
    // The stored data keeps every row; the lookup shows each pair once with its best vote, as it always has.
    const { verseId } = crossrefs;
    const stored = loaded.refs[verseId(0, 1, 1)];
    const rows = Array.from({ length: stored.length / 3 }, (_, i) => stored.slice(i * 3, i * 3 + 3));
    const pair = rows.filter(([s, e]) => s === verseId(3, 1, 1) && e === verseId(3, 1, 3));
    expect(pair).toContainEqual([verseId(3, 1, 1), verseId(3, 1, 3), -5]);
    expect(pair).toContainEqual([verseId(3, 1, 1), verseId(3, 1, 3), 1]);
    const g11 = crossrefs.crossRefsFor(loaded, 0, 1, 1, 1);
    expect(g11.filter((r) => r.start === verseId(3, 1, 1) && r.end === verseId(3, 1, 3))).toEqual([
      { start: verseId(3, 1, 1), end: verseId(3, 1, 3), votes: Math.max(...pair.map((r) => r[2])) },
    ]);
    expect(g11.map((r) => r.votes)).toEqual([...g11.map((r) => r.votes)].sort((a, b) => b - a));
    expect(crossrefs.crossRefsFor(loaded, 1, 2, 1, 1).some((r) => r.start === verseId(10, 2, 2))).toBe(true);
    // A passage merges its verses' references.
    const g1112 = crossrefs.crossRefsFor(loaded, 0, 1, 1, 2);
    expect(g1112.length).toBeGreaterThanOrEqual(g11.length);
    expect(g1112).toEqual(expect.arrayContaining(g11.map((r) => expect.objectContaining({ start: r.start, end: r.end }))));
  });

  it("replaces an earlier import rather than adding to it", async () => {
    const { crossrefs } = await reload();
    await crossrefs.saveCrossRefs(crossrefs.parseCrossRefFile(syntheticOpenBibleFile(10)));
    await crossrefs.saveCrossRefs(crossrefs.parseCrossRefFile(file));
    const again = await reload();
    expect((await again.crossrefs.loadCrossRefs())!.count).toBe(FULL_COUNT);
  });
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
