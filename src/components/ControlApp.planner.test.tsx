// @vitest-environment jsdom
// The Service Planner, end to end: preparing the order of service, presenting it with one press, and Next/Previous
// moving through each item's slides and then on to the next or previous item, through to what the projector is sent.
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BibleMeta, Library, LiveState, NewPlanEntry, PlanEntry, Song } from "../lib/types";
import { fakeEnglish, JOHN } from "../test/fakeBible";
import { LibraryProvider } from "../state/library";
import { ControlApp } from "./ControlApp";

const metas: BibleMeta[] = [
  { id: "ten", name: "Test English", abbreviation: "TEN", license: "Test licence line", language: "en", bookCount: 66, importedAt: 0 },
];
const song = (id: string, title: string, lyrics: string): Song => ({
  kind: "song", id, title, artist: "", copyright: "", ccli: "", lyrics, linesPerSlide: 0, arrangement: [], hidden: [], updatedAt: 0,
});
const SONGS = [
  song("grace", "Amazing Grace", "[Verse 1]\nGrace one\n\nGrace two"),
  song("great", "How Great Thou Art", "[Verse 1]\nGreat one"),
];
const reading = (from: number, to: number): NewPlanEntry =>
  ({ kind: "bible", passage: { primaryId: "ten", onScreen: "first", book: JOHN, chapter: 3, from, to } });
const SERVICE: PlanEntry[] = [
  { id: "e1", kind: "song", songId: "grace", label: "Opening Song" },
  { id: "e2", ...reading(16, 17) } as PlanEntry,
  { id: "e3", kind: "song", songId: "great", label: "Worship Song" },
];

let sent: LiveState[] = [];
const onScreen = () => sent[sent.length - 1]?.slide?.lines.join(" ");

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
});

async function openPlanner(entries: PlanEntry[] = SERVICE, items: Song[] = SONGS) {
  localStorage.setItem("verselight:library.json", JSON.stringify({
    items, bibles: metas, bookmarks: [], activeServiceId: "svc",
    services: [{ id: "svc", name: "Sunday Service", itemIds: [], entries, updatedAt: 0 }],
  }));
  render(<LibraryProvider><ControlApp /></LibraryProvider>);
  fireEvent.click(await screen.findByRole("button", { name: "Planner" }));
}

const rows = () => Array.from(document.querySelectorAll<HTMLElement>(".plan-row"));
const rowTitles = () => rows().map((r) => r.querySelector(".plan-title")!.textContent);
const key = async (k: string) => { await act(async () => { fireEvent.keyDown(window, { key: k }); }); };
const present = async () => { await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Present" })); }); };
const savedEntries = (): PlanEntry[] => {
  const lib = JSON.parse(localStorage.getItem("verselight:library.json") ?? "{}") as Library;
  return lib.services.find((s) => s.id === lib.activeServiceId)?.entries ?? [];
};

describe("the Planner screen", () => {
  it("shows a simple empty state with one way to start", async () => {
    await openPlanner([]);
    expect(screen.getByRole("heading", { name: "Service Planner" })).toBeTruthy();
    expect(screen.getByText("Add songs and Bible passages to prepare your service.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Present" })).toBeNull();
    expect(screen.getAllByRole("button", { name: "Add" })).toHaveLength(1);
  });

  it("lists the service in order: number, role and title", async () => {
    await openPlanner();
    expect(rows().map((r) => r.querySelector(".plan-num")!.textContent)).toEqual(["1", "2", "3"]);
    expect(rows().map((r) => r.querySelector(".plan-label")!.textContent)).toEqual(["Opening Song", "Bible Reading", "Worship Song"]);
    expect(rowTitles()).toEqual(["Amazing Grace", "John 3:16–17TEN", "How Great Thou Art"]);
    expect((screen.getByRole("textbox", { name: "Service name" }) as HTMLInputElement).value).toBe("Sunday Service");
  });

  it("adds a song and a Bible passage from the existing library and Bibles", async () => {
    await openPlanner([]);
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    const dialog = within(screen.getByRole("dialog", { name: "Add to service" }));
    fireEvent.change(dialog.getByRole("textbox", { name: "Search songs" }), { target: { value: "great" } });
    fireEvent.click(dialog.getByRole("button", { name: /How Great Thou Art/ }));
    expect(rowTitles()).toEqual(["How Great Thou Art"]);

    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    const again = within(screen.getByRole("dialog", { name: "Add to service" }));
    fireEvent.click(again.getByRole("radio", { name: "Bible passage" }));
    const box = again.getByRole("textbox", { name: "Bible reference or words" });
    fireEvent.change(box, { target: { value: "jn 3:16" } });
    await again.findByRole("button", { name: /John 3:16/ });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(rowTitles()).toEqual(["How Great Thou Art", "John 3:16TEN"]);
  });

  it("saves the plan with the library, as references only", async () => {
    await openPlanner([]);
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Amazing Grace/ }));
    await waitFor(() => expect(savedEntries()).toHaveLength(1), { timeout: 2000 });
    expect(savedEntries()[0]).toMatchObject({ kind: "song", songId: "grace" });
    expect(JSON.stringify(savedEntries())).not.toContain("Grace one");
  });

  it("renames, reorders and removes items", async () => {
    await openPlanner();
    fireEvent.click(screen.getByRole("button", { name: "More for How Great Thou Art" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename label" }));
    const label = screen.getByRole("textbox", { name: "Item label" });
    fireEvent.change(label, { target: { value: "Closing Song" } });
    fireEvent.blur(label);
    expect(rows()[2].querySelector(".plan-label")!.textContent).toBe("Closing Song");

    fireEvent.keyDown(rows()[0].querySelector(".plan-grip")!, { key: "ArrowDown", altKey: true });
    expect(rowTitles()[1]).toBe("Amazing Grace");

    fireEvent.click(screen.getByRole("button", { name: "More for Amazing Grace" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove" }));
    expect(rowTitles()).toEqual(["John 3:16–17TEN", "How Great Thou Art"]);
  });
});

describe("presenting the service", () => {
  it("Present puts the first item on the projector, through the existing Presentation Panel", async () => {
    await openPlanner();
    await present();
    expect(window.open).toHaveBeenCalledTimes(1);
    expect(onScreen()).toBe("Grace one");
    const panel = within(screen.getByRole("complementary", { name: "Presentation" }));
    expect(panel.getByText("Slide 1 of 2")).toBeTruthy();
    expect(rows()[0].classList.contains("on")).toBe(true);
  });

  it("Next goes through the item's slides first, then on to the next item; Previous comes back the same way", async () => {
    await openPlanner();
    await present();
    await key("ArrowRight");
    expect(onScreen()).toBe("Grace two");
    await key("ArrowRight");
    expect(onScreen()).toBe("placeholder love and faith words"); // John 3:16
    expect(rows()[1].classList.contains("on")).toBe(true);
    await key("ArrowRight");
    expect(onScreen()).toBe("filler 42.3.17");
    await key("ArrowRight");
    expect(onScreen()).toBe("Great one");
    // The last slide of the last item: Next stays put.
    await key("ArrowRight");
    expect(onScreen()).toBe("Great one");

    await key("ArrowLeft");
    expect(onScreen()).toBe("filler 42.3.17"); // the reading's last verse, not its first
    await key("ArrowLeft");
    expect(onScreen()).toBe("placeholder love and faith words");
    await key("ArrowLeft");
    expect(onScreen()).toBe("Grace two");
    await key("ArrowLeft");
    expect(onScreen()).toBe("Grace one");
  });

  it("a reading shows only its planned verses", async () => {
    await openPlanner([{ id: "r", ...reading(16, 16) } as PlanEntry]);
    await present();
    const panel = within(screen.getByRole("complementary", { name: "Presentation" }));
    expect(panel.getByText("Slide 1 of 1")).toBeTruthy();
    expect(onScreen()).toBe("placeholder love and faith words");
    await key("ArrowRight");
    expect(onScreen()).toBe("placeholder love and faith words");
  });

  it("the panel's Next button crosses items, and its preview names the next item", async () => {
    await openPlanner();
    await present();
    const panel = within(screen.getByRole("complementary", { name: "Presentation" }));
    await act(async () => { fireEvent.click(panel.getByRole("button", { name: /^Next/ })); });
    expect(panel.getByLabelText("Next slide").textContent).toContain("2. John 3:16–17");
    const next = panel.getByRole("button", { name: /^Next/ }) as HTMLButtonElement;
    expect(next.disabled).toBe(false);
    await act(async () => { fireEvent.click(next); });
    expect(onScreen()).toBe("placeholder love and faith words");
  });

  it("clicking a row while presenting puts that item on screen", async () => {
    await openPlanner();
    await present();
    await act(async () => { fireEvent.click(rows()[2].querySelector("button.plan-main")!); });
    expect(onScreen()).toBe("Great one");
    expect(rows()[2].getAttribute("aria-current")).toBe("true");
  });

  it("rows aren't clickable before presenting, so a stray click can't change anything", async () => {
    await openPlanner();
    expect(rows()[0].querySelector("button.plan-main")).toBeNull();
    expect(rows()[0].querySelector(".plan-main")).not.toBeNull();
  });

  it("skips an item that can't be shown, and says so", async () => {
    await openPlanner([
      { id: "a", kind: "song", songId: "grace" },
      { id: "gone", kind: "song", songId: "deleted-song" },
      { id: "c", kind: "song", songId: "great" },
    ]);
    await present();
    await key("ArrowRight");
    await key("ArrowRight");
    expect(onScreen()).toBe("Great one");
    expect(screen.getByText(/Skipped 2\. Song not found/)).toBeTruthy();
  });

  it("presenting a song from the Songs screen still works as before, outside the plan", async () => {
    await openPlanner();
    await present();
    fireEvent.click(screen.getByRole("button", { name: "Songs" }));
    await act(async () => { fireEvent.click(screen.getAllByRole("button", { name: /Present/ })[0]); });
    await key("ArrowRight");
    await key("ArrowRight");
    // At the end of a song presented on its own, Next doesn't move into the service.
    expect(onScreen()).toBe("Grace two");
  });
});
