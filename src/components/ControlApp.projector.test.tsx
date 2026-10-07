// @vitest-environment jsdom
// The projector as a second screen: choosing the screen, opening one projector window, keeping it in step with the
// laptop, and failing gracefully when there is no second screen or it is unplugged. The screens are simulated;
// this cannot prove a physical projector works, only that VerseLight drives the window correctly.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DisplayInfo } from "../lib/display";
import { songSlideKey } from "../lib/slides";
import type { BibleMeta, LiveState, Look, Song } from "../lib/types";
import { DEFAULT_THEME, LibraryProvider } from "../state/library";
import { fakeEnglish } from "../test/fakeBible";
import { ControlApp, DISPLAY_POLL_MS, PROJECTOR_TIMEOUT_MS } from "./ControlApp";

const hw = vi.hoisted(() => ({
  displays: [] as DisplayInfo[],
  open: (async () => undefined) as (d: DisplayInfo | null) => Promise<void>,
  opened: [] as (string | null)[],
  closed: 0,
}));
// The messages between the control window and the projector window, in memory.
const bus = vi.hoisted(() => ({ handlers: new Map<string, Set<(payload: unknown) => void>>() }));
vi.mock("../lib/bridge", () => ({
  send: async (event: string, payload: unknown) => { bus.handlers.get(event)?.forEach((h) => h(payload)); },
  on: (event: string, h: (payload: unknown) => void) => {
    if (!bus.handlers.has(event)) bus.handlers.set(event, new Set());
    bus.handlers.get(event)!.add(h);
    return () => bus.handlers.get(event)!.delete(h);
  },
}));
vi.mock("../lib/display", () => ({
  canChooseDisplays: () => true,
  listDisplays: async () => hw.displays,
  openPresentation: (d: DisplayInfo | null) => { hw.opened.push(d?.id ?? null); return hw.open(d); },
  closePresentation: async () => { hw.closed++; },
  isPresentationWindow: () => false,
}));

const laptop: DisplayInfo = { id: "\\\\.\\DISPLAY1", index: 0, name: "\\\\.\\DISPLAY1", width: 1920, height: 1200, x: 0, y: 0, primary: true };
const beamer: DisplayInfo = { id: "\\\\.\\DISPLAY2", index: 1, name: "\\\\.\\DISPLAY2", width: 1920, height: 1080, x: 1920, y: 0, primary: false };

// Placeholder words only: VerseLight never ships song lyrics.
const song: Song = {
  kind: "song", id: "s1", title: "Morning Song", artist: "Writer", copyright: "", ccli: "", linesPerSlide: 0, updatedAt: 0, language: "en",
  lyrics: "[Verse 1]\nSun is rising\n\n[Chorus]\nSing along now\n\n[Verse 2]\nEvening comes", arrangement: [], hidden: [],
};
const blue: Look = { id: "blue", name: "Blue", theme: { ...DEFAULT_THEME, backgroundKind: "color", backgroundColor: "#0000ff" }, updatedAt: 0 };
const bible: BibleMeta = { id: "ten", name: "Test English", abbreviation: "TEN", license: "", language: "en", bookCount: 66, importedAt: 0 };

let sent: LiveState[] = [];
const projector = () => sent[sent.length - 1];
const onScreen = () => projector()?.slide?.lines.join(" ");

/** The projector window finishing loading and asking for the current slide, as PresentationView does. */
async function projectorReportsBack() {
  await act(async () => { bus.handlers.get("request-state")?.forEach((h) => h(null)); });
  await waitFor(() => expect(within(screen.getByRole("complementary", { name: "Presentation" })).getByText(/^Live on/)).toBeTruthy());
}

/** Runs the screen check the control window does every few seconds while presenting. */
async function checkScreens() {
  const calls = vi.mocked(window.setInterval).mock.calls.filter((c) => c[1] === DISPLAY_POLL_MS);
  await act(async () => { await (calls[calls.length - 1][0] as () => Promise<void>)(); });
}

beforeEach(() => {
  localStorage.clear();
  sent = [];
  hw.displays = [laptop, beamer];
  hw.open = async () => undefined;
  hw.opened = [];
  hw.closed = 0;
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof matchMedia;
  Element.prototype.scrollIntoView ??= function () {};
  Element.prototype.scrollTo ??= function () {};
  vi.spyOn(window, "setInterval");
  vi.spyOn(window, "setTimeout");
  bus.handlers.clear();
  bus.handlers.set("live-state", new Set([(s) => sent.push(s as LiveState)]));
});
afterEach(() => vi.restoreAllMocks());

async function start(library: Record<string, unknown> = {}) {
  localStorage.setItem("verselight:library.json", JSON.stringify({
    items: [song], services: [], looks: [blue],
    assign: { bible: null, songs: null, items: {}, slides: { [songSlideKey("s1", "Chorus", 0, 0)]: "blue" } },
    ...library,
  }));
  render(<LibraryProvider><ControlApp /></LibraryProvider>);
  await screen.findByRole("button", { name: "Songs" });
}
async function presentSong() {
  fireEvent.click(within(screen.getByRole("navigation", { name: "Main" })).getByRole("button", { name: "Songs" }));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Present Now/ })); });
  return within(screen.getByRole("complementary", { name: "Presentation" }));
}

describe("the projector on a second screen", () => {
  it("opens the projector window on the second screen, never the laptop's, and goes Live when it reports back", async () => {
    await start();
    const panel = await presentSong();
    expect(hw.opened).toEqual([beamer.id]);
    expect(panel.getByText("Connecting to projector…")).toBeTruthy();
    await projectorReportsBack();
    expect(panel.getByText("Live on Display 2")).toBeTruthy();
    expect(panel.getByText("On screen now")).toBeTruthy();
    expect(onScreen()).toBe("Sun is rising");
  });

  it("never opens a second projector window, however often Present Now or Start is pressed", async () => {
    let finish!: () => void;
    hw.open = () => new Promise<void>((r) => { finish = r; });
    await start();
    const panel = await presentSong();
    // Still opening: pressing Present Now again must not open another window.
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Present Now/ })); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Present Now/ })); });
    await act(async () => { finish(); });
    await projectorReportsBack();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Present Now/ })); });
    expect(hw.opened).toHaveLength(1);
    expect(panel.queryByRole("button", { name: /Start presenting/ })).toBeNull();
  });

  it("keeps the projector in step with the laptop: Next, Previous, Blank, Show and each slide's background", async () => {
    await start();
    const panel = await presentSong();
    await projectorReportsBack();
    expect(projector().theme.backgroundColor).toBe(DEFAULT_THEME.backgroundColor);
    fireEvent.click(panel.getByRole("button", { name: /^Next/ }));
    expect(onScreen()).toBe("Sing along now");
    expect(projector().theme.backgroundColor).toBe("#0000ff");
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(onScreen()).toBe("Evening comes");
    fireEvent.click(panel.getByRole("button", { name: /Previous/ }));
    expect(onScreen()).toBe("Sing along now");
    fireEvent.click(panel.getByRole("button", { name: /Blank/ }));
    expect(projector()).toMatchObject({ blackout: true, slide: { lines: ["Sing along now"] } });
    expect(panel.getByText("Blank screen")).toBeTruthy();
    fireEvent.click(panel.getByRole("button", { name: /Show/ }));
    expect(projector().blackout).toBe(false);
  });

  it("stop closes the projector window, and Start presenting reopens it on the same slide", async () => {
    await start();
    const panel = await presentSong();
    await projectorReportsBack();
    fireEvent.click(panel.getByRole("button", { name: /^Next/ }));
    const closedBefore = hw.closed;
    await act(async () => { fireEvent.click(panel.getByRole("button", { name: /Stop presentation/ })); });
    expect(hw.closed).toBe(closedBefore + 1);
    expect(panel.getByText("Projector off")).toBeTruthy();
    expect(panel.getByText("Slide 2 of 3")).toBeTruthy();
    await act(async () => { fireEvent.click(panel.getByRole("button", { name: /Start presenting/ })); });
    expect(hw.opened).toEqual([beamer.id, beamer.id]);
    // The new window asks for the current slide and gets the one the laptop is on.
    sent = [];
    await projectorReportsBack();
    expect(onScreen()).toBe("Sing along now");
    // Esc stops it too.
    await act(async () => { fireEvent.keyDown(window, { key: "Escape" }); });
    expect(panel.getByText("Projector off")).toBeTruthy();
    expect(hw.closed).toBe(closedBefore + 2);
  });

  it("with only one screen, presents in the preview only and says a second screen is needed", async () => {
    hw.displays = [laptop];
    await start();
    const panel = await presentSong();
    expect(hw.opened).toEqual([]);
    expect(panel.getByText("Projector off")).toBeTruthy();
    expect(panel.getByText("Preview only")).toBeTruthy();
    expect(panel.getByRole("note").textContent).toMatch(/No second screen found/);
    // The laptop controls still work.
    fireEvent.click(panel.getByRole("button", { name: /^Next/ }));
    expect(panel.getByText("Slide 2 of 3")).toBeTruthy();
    // Connect the projector, then Start presenting.
    hw.displays = [laptop, beamer];
    await act(async () => { fireEvent.click(panel.getByRole("button", { name: /Start presenting/ })); });
    expect(hw.opened).toEqual([beamer.id]);
    await projectorReportsBack();
    expect(onScreen()).toBe("Sing along now");
    expect(panel.queryByRole("note")).toBeNull();
  });

  it("says so when the chosen screen isn't connected, instead of using another one", async () => {
    await start({ displayId: "\\\\.\\DISPLAY3" });
    const panel = await presentSong();
    expect(hw.opened).toEqual([]);
    expect(panel.getByRole("note").textContent).toMatch(/chosen for the projector isn't connected/);
  });

  it("turns the projector off, keeping the place, when its screen is unplugged, and starts again when it is back", async () => {
    await start();
    const panel = await presentSong();
    await projectorReportsBack();
    fireEvent.click(panel.getByRole("button", { name: /^Next/ }));
    await checkScreens();
    expect(panel.getByText("Live on Display 2")).toBeTruthy();

    hw.displays = [laptop];
    await checkScreens();
    expect(hw.closed).toBeGreaterThan(0);
    expect(panel.getByText("Projector off")).toBeTruthy();
    expect(panel.getByRole("note").textContent).toMatch(/Display 2 was disconnected/);
    expect(panel.getByText("Slide 2 of 3")).toBeTruthy();

    hw.displays = [laptop, beamer];
    await act(async () => { fireEvent.click(panel.getByRole("button", { name: /Start presenting/ })); });
    await projectorReportsBack();
    expect(hw.opened).toEqual([beamer.id, beamer.id]);
    expect(onScreen()).toBe("Sing along now");
  });

  it("reports a projector window that can't be opened, without crashing", async () => {
    hw.open = async () => { throw new Error("the chosen screen isn't connected"); };
    await start();
    const panel = await presentSong();
    expect(panel.getByText("Projector off")).toBeTruthy();
    expect(panel.getByRole("note").textContent).toMatch(/couldn't be opened: the chosen screen isn't connected/);
    expect(panel.getByText("Slide 1 of 3")).toBeTruthy();
  });

  it("closes a projector window that never reports back", async () => {
    await start();
    const panel = await presentSong();
    expect(panel.getByText("Connecting to projector…")).toBeTruthy();
    const timeouts = vi.mocked(window.setTimeout).mock.calls.filter((c) => c[1] === PROJECTOR_TIMEOUT_MS);
    await act(async () => { (timeouts[timeouts.length - 1][0] as () => void)(); });
    expect(panel.getByText("Projector off")).toBeTruthy();
    expect(panel.getByRole("note").textContent).toMatch(/didn't respond/);
  });

  it("presents a Bible passage on the projector screen", async () => {
    localStorage.setItem("verselight:bible-ten.json", JSON.stringify(fakeEnglish()));
    await start({ bibles: [bible], bookmarks: [] });
    fireEvent.click(screen.getByRole("button", { name: "Bible" }));
    await screen.findByRole("heading", { level: 1, name: "Genesis 1" });
    fireEvent.click(screen.getByRole("radio", { name: "Reference" }));
    const box = screen.getByRole("textbox", { name: "Search by reference" });
    fireEvent.change(box, { target: { value: "John 3:16" } });
    await act(async () => { fireEvent.keyDown(box, { key: "Enter" }); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Present Now/ })); });
    const panel = within(screen.getByRole("complementary", { name: "Presentation" }));
    expect(hw.opened).toEqual([beamer.id]);
    await projectorReportsBack();
    expect(projector().slide).toMatchObject({ label: "John 3:16", footer: "John 3:16 (TEN)" });
    fireEvent.click(panel.getByRole("button", { name: /^Next/ }));
    expect(projector().slide?.label).toBe("John 3:17");
  });
});

describe("Settings → Projector", () => {
  it("lists the screens, and the chosen one is where the projector opens", async () => {
    const tv: DisplayInfo = { ...beamer, id: "\\\\.\\DISPLAY3", index: 2, name: "\\\\.\\DISPLAY3", x: -1920 };
    hw.displays = [laptop, beamer, tv];
    await start();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    const select = await screen.findByRole("combobox", { name: "Projector display" }) as HTMLSelectElement;
    await waitFor(() => expect(select.options).toHaveLength(4));
    expect([...select.options].map((o) => o.textContent)).toEqual([
      "Automatic: the second screen (now Display 2)",
      "Display 1 · 1920×1200 · this computer's main screen",
      "Display 2 · 1920×1080",
      "Display 3 · 1920×1080",
    ]);
    fireEvent.change(select, { target: { value: tv.id } });
    await presentSong();
    expect(hw.opened).toEqual([tv.id]);
  });

  it("says when there is no second screen", async () => {
    hw.displays = [laptop];
    await start();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    await waitFor(() => expect(screen.getByText(/1 screen found/)).toBeTruthy());
    expect(screen.getByText(/No second screen found, so there is nowhere separate/)).toBeTruthy();
  });
});

describe("the projector window's lifetime", () => {
  it("closes a projector window left over from before the control window was reloaded", async () => {
    await start();
    // Nothing has been presented yet: the only close is the clean-up of a stale window.
    expect(hw.closed).toBe(1);
    expect(hw.opened).toEqual([]);
  });

  it("closes the window again if Stop is pressed while it is still opening", async () => {
    let finish!: () => void;
    hw.open = () => new Promise<void>((r) => { finish = r; });
    await start();
    const panel = await presentSong();
    expect(panel.getByText("Connecting to projector…")).toBeTruthy();
    const closedBefore = hw.closed;
    await act(async () => { fireEvent.click(panel.getByRole("button", { name: /Stop presentation/ })); });
    expect(panel.getByText("Projector off")).toBeTruthy();
    // The window finishes opening after Stop: it is closed rather than left on the projector.
    await act(async () => { finish(); });
    expect(hw.closed).toBe(closedBefore + 2);
    expect(panel.getByText("Projector off")).toBeTruthy();
    // Start presenting afterwards opens it normally.
    hw.open = async () => undefined;
    await act(async () => { fireEvent.click(panel.getByRole("button", { name: /Start presenting/ })); });
    await projectorReportsBack();
    expect(hw.opened).toHaveLength(2);
  });

  it("remembers the chosen screen after VerseLight is restarted", async () => {
    const tv: DisplayInfo = { ...beamer, id: "\\\\.\\DISPLAY3", index: 2, name: "\\\\.\\DISPLAY3", x: -1920 };
    hw.displays = [laptop, beamer, tv];
    await start();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    const select = await screen.findByRole("combobox", { name: "Projector display" }) as HTMLSelectElement;
    await waitFor(() => expect(select.options).toHaveLength(4));
    fireEvent.change(select, { target: { value: tv.id } });
    await waitFor(() => expect(JSON.parse(localStorage.getItem("verselight:library.json")!).displayId).toBe(tv.id));

    // Restart: a fresh control window reading the saved library, with the screens listed in a different order.
    cleanup();
    hw.displays = [tv, laptop, beamer];
    render(<LibraryProvider><ControlApp /></LibraryProvider>);
    await screen.findByRole("button", { name: "Songs" });
    await presentSong();
    expect(hw.opened).toEqual([tv.id]);
  });
});

describe("Settings → Church logo", () => {
  const logoBox = () => screen.findByRole("checkbox", { name: "Show the church logo on the projector" }) as Promise<HTMLInputElement>;
  const savedLibrary = () => localStorage.getItem("verselight:library.json");
  const savedSettings = () => JSON.parse(localStorage.getItem("verselight:settings.json") ?? "null");

  it("is on by default, with nothing saved yet", async () => {
    await start();
    await presentSong();
    await projectorReportsBack();
    expect(projector().logo).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect((await logoBox()).checked).toBe(true);
    expect(savedSettings()).toBeNull();
  });

  it("turns off and on again, and the projector follows at once", async () => {
    await start();
    await presentSong();
    await projectorReportsBack();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(await logoBox());
    expect(projector().logo).toBe(false);
    expect(onScreen()).toBe("Sun is rising");
    fireEvent.click(await logoBox());
    expect(projector().logo).toBe(true);
  });

  it("is saved in its own settings file, never in the library, and stays off after VerseLight is restarted", async () => {
    await start();
    // Let the library finish its usual save after opening, then keep an exact copy of it.
    await waitFor(() => expect(JSON.parse(savedLibrary()!).items).toEqual([song]));
    await new Promise((r) => setTimeout(r, 600));
    const before = savedLibrary();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(await logoBox());
    await waitFor(() => expect(savedSettings()).toEqual({ showLogo: false }));
    await new Promise((r) => setTimeout(r, 600));
    expect(savedLibrary()).toBe(before);

    cleanup();
    render(<LibraryProvider><ControlApp /></LibraryProvider>);
    await screen.findByRole("button", { name: "Songs" });
    await presentSong();
    await projectorReportsBack();
    expect(projector().logo).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect((await logoBox()).checked).toBe(false);
  });
});
