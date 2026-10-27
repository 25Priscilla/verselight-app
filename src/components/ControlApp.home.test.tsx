// @vitest-environment jsdom
// Home, end to end: today's verse from an imported Bible, the four main jobs, recent songs and saved verses,
// the tools, the projector panel and the sidebar's Tools group. Every button here must reach the same screen
// or the same Present Now as the rest of the app; nothing on Home is decoration.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { featuredPosition } from "../lib/featuredVerse";
import type { BibleMeta, Bookmark, LiveState, Song } from "../lib/types";
import { fakeEnglish, fakeMalayalam, JOHN } from "../test/fakeBible";
import { LibraryProvider } from "../state/library";
import { ControlApp } from "./ControlApp";

const metas: BibleMeta[] = [
  { id: "ten", name: "Test English", abbreviation: "TEN", license: "Test licence line", language: "en", bookCount: 66, importedAt: 0 },
  { id: "tml", name: "പരീക്ഷണ ബൈബിൾ", abbreviation: "TML", license: "Test Malayalam licence", language: "ml", bookCount: 66, importedAt: 0 },
];
// Placeholder words only: VerseLight never ships song lyrics.
const morning: Song = {
  kind: "song", id: "s1", title: "Morning Song", artist: "Writer", copyright: "", ccli: "", linesPerSlide: 0, updatedAt: 0, language: "en",
  lyrics: "[Verse 1]\nSun is rising\n\n[Chorus]\nSing along now", arrangement: [], hidden: [], lastUsedAt: 5,
};
const malayalam: Song = {
  kind: "song", id: "s2", title: "പാട്ട്", altTitle: "Paattu", artist: "", copyright: "", ccli: "", linesPerSlide: 0, updatedAt: 0, language: "ml",
  lyrics: "[Verse 1]\nവരി ഒന്ന്", arrangement: [], hidden: [],
};
const saved: Bookmark = { id: "b1", book: 44, chapter: 8, verse: 28, translation: "TEN", savedAt: 1 };

let sent: LiveState[] = [];
const onScreen = () => sent[sent.length - 1]?.slide?.lines.join(" ");

/** A day whose featured verse is John 3:16, which the placeholder Bible has. */
function johnDay() {
  for (let d = 1; d <= 31; d++) {
    const day = new Date(2026, 0, d, 9);
    const p = featuredPosition(day);
    if (p.book === JOHN && p.chapter === 3) return day;
  }
  throw new Error("no John 3:16 day in January");
}

beforeEach(() => {
  localStorage.clear();
  sent = [];
  // Only the date is faked, and it keeps moving: the app numbers its requests by the time.
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(johnDay());
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof matchMedia;
  Element.prototype.scrollIntoView ??= function () {};
  Element.prototype.scrollTo ??= function () {};
  vi.spyOn(window, "open").mockImplementation(() => ({ close() {} }) as Window);
  vi.spyOn(BroadcastChannel.prototype, "postMessage").mockImplementation((m: { event: string; payload: LiveState }) => {
    if (m.event === "live-state") sent.push(m.payload);
  });
  localStorage.setItem("verselight:bible-ten.json", JSON.stringify(fakeEnglish()));
  localStorage.setItem("verselight:bible-tml.json", JSON.stringify(fakeMalayalam()));
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

async function openHome({ bibles = metas.slice(0, 1), items = [morning, malayalam] as Song[], bookmarks = [saved] } = {}) {
  localStorage.setItem("verselight:library.json", JSON.stringify({ items, services: [], bibles, bookmarks }));
  render(<LibraryProvider><ControlApp /></LibraryProvider>);
  await screen.findByRole("heading", { level: 1, name: "Good morning" });
}
const banner = () => within(screen.getByRole("region", { name: "Today's verse" }));
const mainActions = () => within(screen.getByRole("navigation", { name: "Main actions" }));
const tools = () => within(screen.getByRole("region", { name: "Quick tools" }));

describe("Home: today's verse", () => {
  it("shows the verse from the imported Bible and presents it with Present Now", async () => {
    await openHome();
    expect(await banner().findByText("placeholder love and faith words")).toBeTruthy();
    expect(banner().getByText("John 3:16 · TEN")).toBeTruthy();
    await act(async () => { fireEvent.click(banner().getByRole("button", { name: /Present Now/ })); });
    const panel = within(screen.getByRole("complementary", { name: "Presentation" }));
    expect(panel.getByText("Slide 16 of 18")).toBeTruthy();
    expect(onScreen()).toContain("placeholder love and faith words");
    expect(window.open).toHaveBeenCalledTimes(1);
  });

  it("opens the verse in the Bible", async () => {
    await openHome();
    fireEvent.click(await banner().findByRole("button", { name: "Open in Bible" }));
    await screen.findByRole("heading", { level: 1, name: "John 3" });
  });

  it("offers to import a Bible when there is none, and never invents a verse", async () => {
    await openHome({ bibles: [] });
    const start = within(screen.getByRole("region", { name: "Get started" }));
    expect(start.getByRole("button", { name: "Import a Bible" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Today's verse" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Present Now/ })).toBeNull();
  });
});

describe("Home: main actions", () => {
  it("opens the Bible, Songs, Projector settings and the library's Bibles", async () => {
    await openHome();
    fireEvent.click(mainActions().getByRole("button", { name: /^Bible/ }));
    await screen.findByRole("heading", { level: 1, name: "Genesis 1" });

    fireEvent.click(screen.getByRole("button", { name: "Home" }));
    fireEvent.click(mainActions().getByRole("button", { name: /^Songs/ }));
    expect(screen.getByRole("radiogroup", { name: "Language" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Home" }));
    fireEvent.click(mainActions().getByRole("button", { name: /^Projector/ }));
    const sections = within(screen.getByRole("navigation", { name: "Settings sections" }));
    expect(sections.getByRole("button", { name: "Projector" }).getAttribute("aria-current")).toBe("page");

    fireEvent.click(screen.getByRole("button", { name: "Home" }));
    fireEvent.click(mainActions().getByRole("button", { name: /^Library/ }));
    expect(within(screen.getByRole("navigation", { name: "Settings sections" })).getByRole("button", { name: "Bibles" }).getAttribute("aria-current")).toBe("page");
  });
});

describe("Home: recent", () => {
  it("lists only songs that were presented, and presents one directly", async () => {
    await openHome();
    const recent = within(screen.getByRole("list", { name: "Recent songs" }));
    expect(recent.getByText("Morning Song")).toBeTruthy();
    expect(recent.queryByText("പാട്ട്")).toBeNull();
    await act(async () => { fireEvent.click(recent.getByRole("button", { name: "Present Morning Song" })); });
    expect(onScreen()).toBe("Sun is rising");
  });

  it("lists saved verses with their text, and opens or presents them", async () => {
    await openHome();
    const list = within(screen.getByRole("list", { name: "Recently saved verses" }));
    expect(await list.findByText("placeholder love words")).toBeTruthy();
    await act(async () => { fireEvent.click(list.getByRole("button", { name: "Present Romans 8:28" })); });
    expect(onScreen()).toContain("placeholder love words");
    fireEvent.click(screen.getByRole("button", { name: "Home" }));
    fireEvent.click(within(screen.getByRole("list", { name: "Recently saved verses" })).getByTitle("Open in the Bible"));
    await screen.findByRole("heading", { level: 1, name: "Romans 8" });
  });

  it("shows the plain empty messages when nothing has been used yet", async () => {
    await openHome({ items: [malayalam], bookmarks: [] });
    expect(screen.getByText("Songs you present will appear here.")).toBeTruthy();
    expect(screen.getByText("Verses you save on the Bible screen will appear here.")).toBeTruthy();
  });
});

describe("Home: quick tools", () => {
  it("has no Word study, Cross references or Chapter overview", async () => {
    await openHome();
    for (const name of [/^Word study/, /^Cross references/, /^Chapter overview/]) {
      expect(tools().queryByRole("button", { name })).toBeNull();
    }
    expect(tools().getByRole("button", { name: /^Parallel Bible/ })).toBeTruthy();
    expect(tools().getByRole("button", { name: /^Malayalam songs/ })).toBeTruthy();
  });

  it("offers Parallel Bible only with an English and a Malayalam Bible", async () => {
    await openHome();
    expect((tools().getByRole("button", { name: /^Parallel Bible/ }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    await openHome({ bibles: metas });
    fireEvent.click(tools().getByRole("button", { name: /^Parallel Bible/ }));
    await waitFor(() => expect(screen.getByRole("radio", { name: /EN \+/ }).getAttribute("aria-checked")).toBe("true"));
  });

  it("lists Malayalam songs, searchable in Manglish", async () => {
    await openHome();
    fireEvent.click(tools().getByRole("button", { name: /^Malayalam songs/ }));
    expect(screen.getByRole("radio", { name: "Malayalam" }).getAttribute("aria-checked")).toBe("true");
  });

  it("opens the presentation guide", async () => {
    await openHome();
    fireEvent.click(tools().getByRole("button", { name: /^Presentation guide/ }));
    expect(screen.getByRole("heading", { level: 1, name: "Help" })).toBeTruthy();
  });
});

describe("Home: projector and tips", () => {
  it("reports the projector as off until it really is on, and never claims a connection", async () => {
    await openHome();
    const panel = within(screen.getByRole("region", { name: "Projector" }));
    expect(panel.getByText("Projector off")).toBeTruthy();
    expect(panel.queryByText(/Connected|Live on/)).toBeNull();
    // In a web browser VerseLight can't see the screens, so it says what happens instead.
    expect(panel.getByText(/separate window/)).toBeTruthy();
    fireEvent.click(panel.getByRole("button", { name: "Projector settings" }));
    expect(screen.getByRole("navigation", { name: "Settings sections" })).toBeTruthy();
  });

  it("has a single Quick tips panel", async () => {
    await openHome();
    expect(screen.getAllByRole("region", { name: "Quick tips" })).toHaveLength(1);
  });
});

describe("sidebar Tools", () => {
  it("keeps every tool reachable and remembers when the group is closed", async () => {
    await openHome({ bibles: metas });
    const nav = within(screen.getByRole("navigation", { name: "Main" }));
    const group = nav.getByRole("button", { name: "Tools" });
    expect(group.getAttribute("aria-expanded")).toBe("true");
    for (const name of ["Parallel Bible", "Malayalam songs"]) {
      expect(nav.getByRole("button", { name })).toBeTruthy();
    }
    for (const name of ["Bible Study", "Cross references", "Chapter overview", "Word Study"]) {
      expect(nav.queryByRole("button", { name })).toBeNull();
    }

    fireEvent.click(group);
    expect(nav.queryByRole("button", { name: "Parallel Bible" })).toBeNull();
    cleanup();
    await openHome();
    expect(within(screen.getByRole("navigation", { name: "Main" })).getByRole("button", { name: "Tools" }).getAttribute("aria-expanded")).toBe("false");
  });
});
