// @vitest-environment jsdom
// A song, end to end: Songs screen → Present Now → the live controls → what the projector is sent.
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { songSlideKey } from "../lib/slides";
import type { LiveState, Look, Song } from "../lib/types";
import { DEFAULT_THEME, LibraryProvider } from "../state/library";
import { ControlApp } from "./ControlApp";

// Placeholder words only: VerseLight never ships song lyrics.
const song: Song = {
  kind: "song", id: "s1", title: "Morning Song", artist: "Writer", copyright: "", ccli: "", linesPerSlide: 0, updatedAt: 0, language: "en",
  lyrics: "[Verse 1]\nSun is rising\n\n[Chorus]\nSing along now\n\n[Verse 2]\nEvening comes\n\n[Chorus]",
  arrangement: [], hidden: ["Verse 2#0"],
};
const look: Look = { id: "blue", name: "Blue", theme: { ...DEFAULT_THEME, backgroundKind: "color", backgroundColor: "#0000ff" }, updatedAt: 0 };

let sent: LiveState[] = [];
const projector = () => sent[sent.length - 1];

beforeEach(() => {
  localStorage.clear();
  sent = [];
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof matchMedia;
  vi.spyOn(window, "open").mockImplementation(() => ({ close() {} }) as Window);
  vi.spyOn(BroadcastChannel.prototype, "postMessage").mockImplementation((m: { event: string; payload: LiveState }) => {
    if (m.event === "live-state") sent.push(m.payload);
  });
});

async function presentSong() {
  localStorage.setItem("verselight:library.json", JSON.stringify({
    items: [song], services: [], looks: [look], assign: { bible: null, songs: null, items: {}, slides: { [songSlideKey("s1", "Chorus", 1, 0)]: "blue" } },
  }));
  render(<LibraryProvider><ControlApp /></LibraryProvider>);
  fireEvent.click(await screen.findByRole("button", { name: "Songs" }));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Present Now/ })); });
  return within(screen.getByRole("complementary", { name: "Presentation" }));
}
const onScreen = () => projector().slide?.lines.join(" ");

describe("presenting a song", () => {
  it("shows the included slides in order and moves with Previous and Next", async () => {
    const panel = await presentSong();
    expect(panel.getByText("Slide 1 of 3")).toBeTruthy();
    expect(onScreen()).toBe("Sun is rising");
    fireEvent.click(panel.getByRole("button", { name: /^Next/ }));
    expect(onScreen()).toBe("Sing along now");
    // Verse 2 is left out, so the chorus comes round again.
    fireEvent.click(panel.getByRole("button", { name: /^Next/ }));
    expect(panel.getByText("Slide 3 of 3")).toBeTruthy();
    expect(panel.getByText("End of song")).toBeTruthy();
    expect((panel.getByRole("button", { name: /^Next/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(panel.getByRole("button", { name: /Previous/ }));
    fireEvent.click(panel.getByRole("button", { name: /Previous/ }));
    expect(onScreen()).toBe("Sun is rising");
    expect((panel.getByRole("button", { name: /Previous/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("uses each slide's own background on the projector", async () => {
    const panel = await presentSong();
    expect(projector().theme.backgroundColor).toBe(DEFAULT_THEME.backgroundColor);
    fireEvent.click(panel.getByRole("button", { name: /Slide 3: Chorus/ }));
    expect(projector().theme.backgroundColor).toBe("#0000ff");
    fireEvent.click(panel.getByRole("button", { name: /Slide 2: Chorus/ }));
    expect(projector().theme.backgroundColor).toBe(DEFAULT_THEME.backgroundColor);
  });

  it("keeps a slide's background when its section is moved", async () => {
    const panel = await presentSong();
    fireEvent.click(screen.getByRole("button", { name: "Move Verse 2 up" }));
    // Order is now Verse 1, Verse 2 (left out), Chorus, Chorus: the second chorus is still slide 3 and still blue.
    fireEvent.click(panel.getByRole("button", { name: /Slide 3: Chorus/ }));
    expect(projector().theme.backgroundColor).toBe("#0000ff");
  });

  it("turns the screen black and shows it again", async () => {
    const panel = await presentSong();
    fireEvent.click(panel.getByRole("button", { name: /Black/ }));
    expect(projector().blackout).toBe(true);
    expect(panel.getByRole("button", { name: /Show/ })).toBeTruthy();
    fireEvent.click(panel.getByRole("button", { name: /Show/ }));
    expect(projector().blackout).toBe(false);
  });

  it("stays on the same words when the song on screen is rearranged", async () => {
    const panel = await presentSong();
    fireEvent.click(panel.getByRole("button", { name: /^Next/ })); // Chorus
    fireEvent.click(panel.getByRole("button", { name: /Black/ }));
    fireEvent.click(screen.getAllByRole("button", { name: "Move Chorus up" })[0]);
    expect(onScreen()).toBe("Sing along now");
    expect(panel.getByText("Slide 1 of 3")).toBeTruthy();
    expect(projector().blackout).toBe(true);
    // The Songs screen marks the slide that is on the projector.
    expect(document.querySelectorAll(".song-editor .mini-wrap.now")).toHaveLength(1);
  });

  it("stops and starts the projector, keeping the place, and closes the presentation", async () => {
    const panel = await presentSong();
    fireEvent.click(panel.getByRole("button", { name: /^Next/ }));
    await act(async () => { fireEvent.click(panel.getByRole("button", { name: /Stop presentation/ })); });
    expect(panel.getByText("Projector off")).toBeTruthy();
    expect(panel.getByText("Slide 2 of 3")).toBeTruthy();
    await act(async () => { fireEvent.click(panel.getByRole("button", { name: /Start presenting/ })); });
    expect(window.open).toHaveBeenCalledTimes(2);
    expect(onScreen()).toBe("Sing along now");
    await act(async () => { fireEvent.click(panel.getByRole("button", { name: "Close presentation" })); });
    expect(screen.queryByRole("complementary", { name: "Presentation" })).toBeNull();
    expect(projector().slide).toBeNull();
  });

  it("records the song as recently used for Home", async () => {
    await presentSong();
    fireEvent.click(screen.getByRole("button", { name: "Home" }));
    const recent = screen.getByText("Recently used songs").closest("section, .card, div")!.parentElement!;
    expect(within(recent).getByText("Morning Song")).toBeTruthy();
  });
});
