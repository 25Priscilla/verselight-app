// @vitest-environment jsdom
// Global Quick Search, end to end: Ctrl+K, grouped results, opening a verse or a song, Esc, and the presentation keys.
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BibleMeta, LiveState, Song } from "../lib/types";
import { fakeEnglish, fakeMalayalam } from "../test/fakeBible";
import { LibraryProvider } from "../state/library";
import { ControlApp } from "./ControlApp";

const metas: BibleMeta[] = [
  { id: "ten", name: "Test English", abbreviation: "TEN", license: "", language: "en", bookCount: 66, importedAt: 0 },
  { id: "tml", name: "പരീക്ഷണ ബൈബിൾ", abbreviation: "TML", license: "", language: "ml", bookCount: 66, importedAt: 0 },
];
// Placeholder words only: VerseLight never ships song lyrics.
const base = () => ({ kind: "song" as const, artist: "", copyright: "", ccli: "", linesPerSlide: 0, updatedAt: 0, arrangement: [], hidden: [] });
const songs: Song[] = [
  { ...base(), id: "en1", title: "Morning Song", language: "en", lyrics: "[Verse 1]\nSun is rising\n\n[Chorus]\nSing along now" },
  { ...base(), id: "ml1", title: "പ്രഭാത ഗാനം", language: "ml", lyrics: "[Verse 1]\nസൂര്യൻ ഉദിക്കുന്നു",
    translation: "[Verse 1]\nThe dawn is breaking", translationLanguage: "en", display: "translation" },
];

let sent: LiveState[] = [];
const projector = () => sent[sent.length - 1];

beforeEach(() => {
  localStorage.clear();
  sent = [];
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof matchMedia;
  Element.prototype.scrollIntoView ??= function () {};
  Element.prototype.scrollTo ??= function () {};
  vi.spyOn(window, "open").mockImplementation(() => ({ close() {} }) as Window);
  vi.spyOn(BroadcastChannel.prototype, "postMessage").mockImplementation((m: { event: string; payload: LiveState }) => {
    if (m.event === "live-state") sent.push(m.payload);
  });
  localStorage.setItem("verselight:bible-ten.json", JSON.stringify(fakeEnglish()));
  localStorage.setItem("verselight:bible-tml.json", JSON.stringify(fakeMalayalam()));
  localStorage.setItem("verselight:library.json", JSON.stringify({ items: songs, services: [], bibles: metas, bookmarks: [] }));
});

async function start() {
  render(<LibraryProvider><ControlApp /></LibraryProvider>);
  await screen.findByRole("button", { name: "Bible" });
}
const box = () => screen.getByRole("combobox", { name: "Search Bible and songs" }) as HTMLInputElement;
const results = () => within(screen.getByRole("listbox", { name: "Search results" }));
async function type(text: string) {
  fireEvent.focus(box());
  fireEvent.change(box(), { target: { value: text } });
  await screen.findByRole("option", undefined, { timeout: 2000 }).catch(() => undefined);
}
const ctrlK = () => act(async () => { fireEvent.keyDown(document.body, { key: "k", ctrlKey: true }); await new Promise((r) => requestAnimationFrame(r)); });

describe("Global Quick Search", () => {
  it("Ctrl+K focuses the box and shows what can be searched", async () => {
    await start();
    await ctrlK();
    await waitFor(() => expect(document.activeElement).toBe(box()));
    expect(results().getByText("Search Bible verses, references, songs or lyrics")).toBeTruthy();
  });

  it("Esc closes the results and gives focus back", async () => {
    await start();
    const songsNav = screen.getByRole("button", { name: "Songs" });
    songsNav.focus();
    await ctrlK();
    expect(screen.getByRole("listbox", { name: "Search results" })).toBeTruthy();
    fireEvent.keyDown(box(), { key: "Escape" });
    expect(screen.queryByRole("listbox", { name: "Search results" })).toBeNull();
    expect(document.activeElement).toBe(songsNav);
  });

  it("opens John 3:16 on the Bible screen, selected and ready to present", async () => {
    await start();
    await type("John 3:16");
    const option = await screen.findByRole("option", { name: /John 3:16/ });
    expect(within(option).getByText("placeholder love and faith words")).toBeTruthy();
    await act(async () => { fireEvent.click(option); });
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("John 3"));
    expect(document.querySelector(".verses .verse.on sup")?.textContent).toBe("16");
    expect(screen.queryByRole("listbox", { name: "Search results" })).toBeNull();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Present Now/ })); });
    expect(projector().slide?.lines.join(" ")).toBe("placeholder love and faith words");
  });

  it("groups Bible words and songs, with a snippet for lyric matches", async () => {
    await start();
    await type("love");
    await screen.findByRole("option", { name: /John 3:16/ });
    expect(screen.getByRole("group", { name: "Bible" })).toBeTruthy();
    expect(results().getByRole("option", { name: /Romans 8:28/ })).toBeTruthy();
    await type("dawn");
    const option = await screen.findByRole("option", { name: /പ്രഭാത ഗാനം/ });
    expect(within(screen.getByRole("group", { name: "Songs" })).getByText("Translation · English")).toBeTruthy();
    expect(option.querySelector("mark")?.textContent).toBe("dawn");
  });

  it("opens a song on the Songs screen, keeping its language setting, ready to present", async () => {
    await start();
    await type("ഉദിക്കുന്നു");
    await act(async () => { fireEvent.click(await screen.findByRole("option", { name: /പ്രഭാത ഗാനം/ })); });
    expect((screen.getByRole("textbox", { name: "Song title" }) as HTMLInputElement).value).toBe("പ്രഭാത ഗാനം");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Present Now/ })); });
    // The song shows its translation only, as it was set to.
    expect(projector().slide?.lines.join(" ")).toBe("The dawn is breaking");
  });

  it("opens the first result with Enter, and moves with the arrow keys", async () => {
    await start();
    await type("sing");
    await screen.findByRole("option", { name: /Morning Song/ });
    fireEvent.keyDown(box(), { key: "Enter" });
    expect((screen.getByRole("textbox", { name: "Song title" }) as HTMLInputElement).value).toBe("Morning Song");
    // "love": John 3:16, then Romans 8:28.
    await type("love");
    await screen.findByRole("option", { name: /Romans 8:28/ });
    fireEvent.keyDown(box(), { key: "ArrowDown" });
    expect(screen.getByRole("option", { name: /Romans 8:28/ }).getAttribute("aria-selected")).toBe("true");
    await act(async () => { fireEvent.keyDown(box(), { key: "Enter" }); });
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Romans 8"));
    expect(document.querySelector(".verses .verse.on sup")?.textContent).toBe("28");
  });

  it("says when nothing is found", async () => {
    await start();
    await type("zzzqqq");
    expect(await screen.findByText("No results found")).toBeTruthy();
  });

  it("leaves the presentation keys alone", async () => {
    await start();
    await type("Morning");
    await act(async () => { fireEvent.click(await screen.findByRole("option", { name: /Morning Song/ })); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Present Now/ })); });
    expect(projector().slide?.lines.join(" ")).toBe("Sun is rising");
    // Typing in the search box (arrows, Space, B, Esc) doesn't move or stop the presentation.
    await ctrlK();
    for (const key of ["ArrowRight", " ", "b", "Escape"]) fireEvent.keyDown(box(), { key });
    expect(projector().slide?.lines.join(" ")).toBe("Sun is rising");
    expect(projector().blackout).toBe(false);
    expect(screen.getByRole("complementary", { name: "Presentation" })).toBeTruthy();
    // Once the box is closed the keys work as before.
    fireEvent.keyDown(document.body, { key: "ArrowRight" });
    expect(projector().slide?.lines.join(" ")).toBe("Sing along now");
    fireEvent.keyDown(document.body, { key: "b" });
    expect(projector().blackout).toBe(true);
  });
});
