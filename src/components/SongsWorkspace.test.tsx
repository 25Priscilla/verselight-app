// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { slidesFor, songSlideKey } from "../lib/slides";
import type { Library, Song } from "../lib/types";
import { DEFAULT_THEME, LibraryProvider, useLibrary } from "../state/library";
import { SongsWorkspace } from "./SongsWorkspace";

// Placeholder words only: VerseLight never ships song lyrics.
const song = (over: Partial<Song> = {}): Song => ({
  kind: "song", id: "s1", title: "Morning Song", artist: "Writer A", copyright: "", ccli: "", linesPerSlide: 0, updatedAt: 0, language: "en",
  lyrics: "[Verse 1]\nSun is rising\nOver the hill\n\n[Chorus]\nSing along now\n\n[Verse 2]\nEvening comes\n\n[Chorus]",
  arrangement: [], hidden: [],
  ...over,
});
const malayalam = song({ id: "m1", title: "പ്രഭാത ഗാനം", altTitle: "Prabhatha Ganam", artist: "", language: "ml", lyrics: "[Verse 1]\nസൂര്യൻ ഉദിക്കുന്നു" });

let current: Library;
function Probe() {
  current = useLibrary().library;
  return null;
}

async function setup(items: Song[] = [song(), song({ id: "s2", title: "Evening Hymn", artist: "Writer B", lyrics: "[Verse 1]\nStars above" }), malayalam],
  over: Partial<Parameters<typeof SongsWorkspace>[0]> = {}, extra: Partial<Library> = {}) {
  localStorage.setItem("verselight:library.json", JSON.stringify({ items, services: [], ...extra }));
  const props = { active: true, themeFor: () => DEFAULT_THEME, onPresent: vi.fn(), liveKey: null, notify: vi.fn(), ...over };
  render(<LibraryProvider><Probe /><SongsWorkspace {...props} /></LibraryProvider>);
  await screen.findByLabelText("Search songs");
  return props;
}
const songOf = (id: string) => current.items.find((i) => i.id === id) as Song;
const sectionOrder = () => screen.getAllByText((_, el) => el?.className === "arr-label").map((el) => el.textContent);
const list = () => within(document.querySelector(".song-list") as HTMLElement);

beforeEach(() => localStorage.clear());

describe("Songs: finding a song", () => {
  it("lists every song and searches titles and words, but not section tags", async () => {
    await setup();
    expect(screen.getByText("3 songs")).toBeTruthy();
    const search = screen.getByLabelText("Search songs");
    fireEvent.change(search, { target: { value: "stars" } });
    expect(list().getByText("Evening Hymn")).toBeTruthy();
    expect(list().queryByText("Morning Song")).toBeNull();
    expect(screen.getByText("1 of 3 songs")).toBeTruthy();
    fireEvent.change(search, { target: { value: "chorus" } });
    expect(screen.getByText(/No songs match/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show all songs" }));
    expect(screen.getByText("3 songs")).toBeTruthy();
  });

  it("opens the first match with Enter", async () => {
    await setup();
    const search = screen.getByLabelText("Search songs");
    fireEvent.change(search, { target: { value: "evening hymn" } });
    fireEvent.keyDown(search, { key: "Enter" });
    expect((screen.getByLabelText("Song title") as HTMLInputElement).value).toBe("Evening Hymn");
  });

  it("finds Malayalam songs by their Malayalam or English title, and filters by language", async () => {
    await setup();
    fireEvent.change(screen.getByLabelText("Search songs"), { target: { value: "prabhatha" } });
    fireEvent.keyDown(screen.getByLabelText("Search songs"), { key: "Enter" });
    const title = screen.getByLabelText("Song title") as HTMLInputElement;
    expect(title.value).toBe("പ്രഭാത ഗാനം");
    expect(title.lang).toBe("ml");
    expect(screen.getByRole("radio", { name: "മല" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.change(screen.getByLabelText("Search songs"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("radio", { name: "മലയാളം" }));
    expect([...document.querySelectorAll(".song-list .song-title")].map((el) => el.textContent)).toEqual(["പ്രഭാത ഗാനം"]);
    expect(screen.getByText("1 of 3 songs")).toBeTruthy();
  });
});

describe("Songs: writing and arranging", () => {
  it("creates a song and turns its sections into slides as you type", async () => {
    await setup();
    fireEvent.click(screen.getByRole("button", { name: "New song" }));
    fireEvent.change(screen.getByLabelText("Song title"), { target: { value: "Brand New" } });
    fireEvent.change(screen.getByLabelText("Lyrics"), { target: { value: "[Verse 1]\nLine one\n\n[Chorus]\nLine two\n\n[Verse 1]" } });
    expect(sectionOrder()).toEqual(["Verse 1", "Chorus", "Verse 1"]);
    expect(screen.getAllByRole("button", { name: /: included/ })).toHaveLength(3);
    const created = current.items.find((i) => i.kind === "song" && i.title === "Brand New") as Song;
    expect(slidesFor(created).map((s) => s.lines)).toEqual([["Line one"], ["Line two"], ["Line one"]]);
  });

  it("moves sections, and the presentation follows the new order", async () => {
    await setup();
    expect(sectionOrder()).toEqual(["Verse 1", "Chorus", "Verse 2", "Chorus"]);
    fireEvent.click(screen.getByRole("button", { name: "Move Verse 2 up" }));
    expect(sectionOrder()).toEqual(["Verse 1", "Verse 2", "Chorus", "Chorus"]);
    expect(slidesFor(songOf("s1")).map((s) => s.label)).toEqual(["Verse 1", "Verse 2", "Chorus", "Chorus"]);
    fireEvent.click(screen.getByRole("button", { name: "Use written order" }));
    expect(sectionOrder()).toEqual(["Verse 1", "Chorus", "Verse 2", "Chorus"]);
  });

  it("warns about sections left out of the order and never removes the last one", async () => {
    await setup([song({ lyrics: "[Verse 1]\nOne\n\n[Chorus]\nTwo" })]);
    fireEvent.click(screen.getByRole("button", { name: "Remove Chorus from order" }));
    expect(screen.getByText(/Not in the order, so not shown/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Remove Verse 1 from order" }) as HTMLButtonElement).disabled).toBe(true);
    expect(slidesFor(songOf("s1")).map((s) => s.label)).toEqual(["Verse 1"]);
  });

  it("warns when a section name is used twice", async () => {
    await setup([song({ lyrics: "[Verse]\nOne\n\n[Verse]\nTwo" })]);
    expect(screen.getByText(/written out more than once/)).toBeTruthy();
  });

  it("leaves out a clicked slide and puts it back on a second click", async () => {
    await setup();
    const chorus = screen.getAllByRole("button", { name: "Chorus: included. Click to leave it out" })[0];
    fireEvent.click(chorus);
    // A chorus is left out every time it is sung.
    expect(screen.getAllByRole("button", { name: /Chorus: left out/ })).toHaveLength(2);
    expect(screen.getByLabelText("2 of 4 slides will be shown")).toBeTruthy();
    expect(slidesFor(songOf("s1")).map((s) => s.label)).toEqual(["Verse 1", "Verse 2"]);
    fireEvent.click(screen.getAllByRole("button", { name: /Chorus: left out/ })[0]);
    expect(slidesFor(songOf("s1")).map((s) => s.label)).toEqual(["Verse 1", "Chorus", "Verse 2", "Chorus"]);
  });

  it("can't present a song with every slide left out", async () => {
    await setup([song({ lyrics: "[Verse 1]\nOne", hidden: ["Verse 1#0"] })]);
    expect((screen.getByRole("button", { name: /Present Now/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("points out another song with the same title and writer", async () => {
    await setup([song(), song({ id: "s2", title: "morning song", artist: "WRITER A" })]);
    expect(screen.getByText(/Another song in your library has the same title and writer/)).toBeTruthy();
  });

  it("saves changes so they are there after a reload", async () => {
    await setup();
    fireEvent.change(screen.getByLabelText("Song title"), { target: { value: "Renamed" } });
    await waitFor(() => expect(localStorage.getItem("verselight:library.json")).toContain("Renamed"), { timeout: 2000 });
  });

  it("deletes a song after confirming, with the backgrounds chosen for its slides", async () => {
    const key = songSlideKey("s1", "Chorus", 0, 0);
    await setup(undefined, {}, { assign: { bible: null, songs: null, items: { s1: "look" }, slides: { [key]: "look", "v:0.1.1": "look" } } });
    expect(current.assign.slides[key]).toBe("look");
    fireEvent.click(screen.getByRole("button", { name: "Delete song" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete song" }));
    expect(current.items.some((i) => i.id === "s1")).toBe(false);
    expect(current.assign.slides).toEqual({ "v:0.1.1": "look" });
    expect(current.assign.items).toEqual({});
    expect(screen.getByText("Pick a song or write a new one")).toBeTruthy();
  });
});

describe("Songs: presenting", () => {
  it("presents the song from the start or from a chosen slide", async () => {
    const p = await setup();
    fireEvent.click(screen.getByRole("button", { name: /Present Now/ }));
    expect(p.onPresent).toHaveBeenLastCalledWith(expect.objectContaining({ id: "s1" }), undefined);
    fireEvent.click(screen.getAllByRole("button", { name: "Present from Chorus" })[1]);
    expect(p.onPresent).toHaveBeenLastCalledWith(expect.objectContaining({ id: "s1" }), songSlideKey("s1", "Chorus", 1, 0));
  });

  it("marks the slide that is on the projector", async () => {
    await setup(undefined, { liveKey: songSlideKey("s1", "Verse 2", 0, 0) });
    const now = document.querySelectorAll(".mini-wrap.now");
    expect(now).toHaveLength(1);
    expect(within(now[0] as HTMLElement).getByText("Now")).toBeTruthy();
  });
});

describe("Songs: empty library and import", () => {
  it("explains how to start when there are no songs", async () => {
    await setup([]);
    expect(screen.getByText("Add your first song")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Write a song" }));
    expect(screen.getByLabelText("Song title")).toBeTruthy();
    expect(current.items.filter((i) => i.kind === "song")).toHaveLength(1);
  });

  it("imports song files, skips songs already in the library and opens the first new one", async () => {
    const p = await setup([song()]);
    fireEvent.click(screen.getByRole("button", { name: /^Import$/ }));
    const json = JSON.stringify({ format: "verselight-songs", name: "Test songs", songs: [
      { title: "Morning Song", artist: "Writer A", lyrics: "[Verse 1]\nOther words" },
      { title: "ആരാധന", lyrics: "[Verse 1]\nസ്തുതി" },
      { title: "നന്ദി", lyrics: "[Verse 1]\nനന്ദി" },
    ] });
    const file = new File([json], "songs.json", { type: "application/json" });
    // jsdom's File has no text(); browsers and the desktop app do.
    Object.defineProperty(file, "text", { value: async () => json });
    const input = document.querySelector<HTMLInputElement>(".modal input[type=file]")!;
    await act(async () => { fireEvent.change(input, { target: { files: [file] } }); });
    await screen.findByText(/2 will be added; 1 is already in your library and will be skipped/);
    expect(screen.getByText("Already in your library (1)")).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Import 2 songs" }));
    expect(p.notify).toHaveBeenCalledWith("Imported 2 songs.");
    const songs = current.items.filter((i): i is Song => i.kind === "song");
    expect(songs.map((s) => [s.title, s.language])).toEqual([["Morning Song", "en"], ["ആരാധന", "ml"], ["നന്ദി", "ml"]]);
    // The song already there is untouched.
    expect(songs[0].lyrics).toBe(song().lyrics);
    expect((screen.getByLabelText("Song title") as HTMLInputElement).value).toBe("ആരാധന");
  });
});
