// @vitest-environment jsdom
// The Bible, end to end: navigation, search, selection, saved verses, English and Malayalam,
// and presenting a passage through to what the projector is sent.
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BibleMeta, LiveState } from "../lib/types";
import { fakeEnglish, fakeMalayalam } from "../test/fakeBible";
import { LibraryProvider } from "../state/library";
import { ControlApp } from "./ControlApp";

const metas: BibleMeta[] = [
  { id: "ten", name: "Test English", abbreviation: "TEN", license: "Test licence line", language: "en", bookCount: 66, importedAt: 0 },
  { id: "tml", name: "പരീക്ഷണ ബൈബിൾ", abbreviation: "TML", license: "Test Malayalam licence", language: "ml", bookCount: 66, importedAt: 0 },
];

let sent: LiveState[] = [];
const projector = () => sent[sent.length - 1];
const onScreen = () => projector()?.slide?.lines.join(" ");

beforeEach(() => {
  localStorage.clear();
  sent = [];
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof matchMedia;
  // jsdom has no layout or scrolling.
  Element.prototype.scrollIntoView ??= function () {};
  Element.prototype.scrollTo ??= function () {};
  vi.spyOn(window, "open").mockImplementation(() => ({ close() {} }) as Window);
  vi.spyOn(BroadcastChannel.prototype, "postMessage").mockImplementation((m: { event: string; payload: LiveState }) => {
    if (m.event === "live-state") sent.push(m.payload);
  });
  localStorage.setItem("verselight:bible-ten.json", JSON.stringify(fakeEnglish()));
  localStorage.setItem("verselight:bible-tml.json", JSON.stringify(fakeMalayalam()));
});

async function openBible({ bibles = metas } = {}) {
  localStorage.setItem("verselight:library.json", JSON.stringify({ items: [], services: [], bibles, bookmarks: [] }));
  render(<LibraryProvider><ControlApp /></LibraryProvider>);
  fireEvent.click(await screen.findByRole("button", { name: "Bible" }));
  await screen.findByRole("heading", { level: 1, name: "Genesis 1" });
}

const heading = () => screen.getByRole("heading", { level: 1 }).textContent;
const verse = (n: number) => document.querySelectorAll<HTMLElement>(".verses .verse")[n - 1];
const selectionBar = () => document.querySelector(".addbar")!;
const book = (name: string) => fireEvent.click(within(document.querySelector(".book-list")!).getByRole("button", { name }));

async function search(text: string, mode: "Reference" | "Keyword" = "Reference") {
  fireEvent.click(screen.getByRole("radio", { name: mode }));
  const box = screen.getByRole("textbox", { name: mode === "Reference" ? "Search by reference" : "Search by keyword" });
  fireEvent.change(box, { target: { value: text } });
  await act(async () => { fireEvent.keyDown(box, { key: "Enter" }); });
}

async function present() {
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Present Now/ })); });
  return within(screen.getByRole("complementary", { name: "Presentation" }));
}

describe("Bible navigation", () => {
  it("chooses a book and chapter, and shows where you are", async () => {
    await openBible();
    book("John");
    expect(heading()).toBe("John 1");
    fireEvent.click(screen.getByRole("option", { name: "3" }));
    expect(heading()).toBe("John 3");
    const where = screen.getByLabelText("Current location");
    expect(where.textContent).toContain("TEN");
    expect(where.textContent).toContain("Chapter 3 of 4");
    expect(document.querySelectorAll(".verses .verse")).toHaveLength(18);
  });

  it("moves to the previous and next chapter, across books", async () => {
    await openBible();
    book("John");
    fireEvent.click(screen.getByRole("option", { name: "4" }));
    fireEvent.click(screen.getByRole("button", { name: "Next chapter" }));
    expect(heading()).toBe("Acts 1");
    fireEvent.click(screen.getByRole("button", { name: "Previous chapter" }));
    expect(heading()).toBe("John 4");
    fireEvent.click(screen.getByRole("button", { name: /Next: Acts 1/ }));
    expect(heading()).toBe("Acts 1");
    book("Genesis");
    expect((screen.getByRole("button", { name: "Previous chapter" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("goes to a verse from the verse menu", async () => {
    await openBible();
    book("John");
    fireEvent.click(screen.getByRole("option", { name: "3" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Go to verse" }), { target: { value: "16" } });
    expect(verse(16).getAttribute("aria-pressed")).toBe("true");
    expect(selectionBar().textContent).toContain("John 3:16");
  });
});

describe("Bible search", () => {
  it("opens a reference with the verse selected", async () => {
    await openBible();
    for (const [ref, title, v] of [["John 3:16", "John 3", 16], ["Genesis 1:1", "Genesis 1", 1], ["Romans 8:28", "Romans 8", 28]] as const) {
      await search(ref);
      expect(heading()).toBe(title);
      expect(verse(v).getAttribute("aria-pressed")).toBe("true");
    }
  });

  it("says when a chapter doesn't exist and opens the last one", async () => {
    await openBible();
    await search("John 30");
    expect(heading()).toBe("John 4");
    expect(screen.getByText(/John has 4 chapters/)).toBeTruthy();
  });

  it("finds verses by keyword and opens the one chosen", async () => {
    await openBible();
    await search("faith", "Keyword");
    const results = document.querySelector(".results")!;
    expect(within(results as HTMLElement).getByText("2 verses")).toBeTruthy();
    expect(within(results as HTMLElement).getByText("John 3:16")).toBeTruthy();
    fireEvent.click(within(results as HTMLElement).getByText("Ephesians 2:8"));
    expect(heading()).toBe("Ephesians 2");
    expect(verse(8).getAttribute("aria-pressed")).toBe("true");
  });

  it("treats a word typed as a reference as a keyword search", async () => {
    await openBible();
    await search("grace");
    expect(screen.getByText(/No book is called “grace”/)).toBeTruthy();
    expect(screen.getByText("Genesis 2:3")).toBeTruthy();
  });

  it("keeps the translation when searching", async () => {
    await openBible();
    fireEvent.click(screen.getByRole("radio", { name: "മലയാളം" }));
    await screen.findByRole("heading", { level: 1, name: "ഉല്പത്തി 1" });
    await search("യോഹന്നാൻ 3:16");
    expect(heading()).toBe("യോഹന്നാൻ 3");
    expect(screen.getByLabelText("Current location").textContent).toContain("TML");
  });
});

describe("selecting and saving verses", () => {
  it("selects one verse, then a passage with shift-click", async () => {
    await openBible();
    await search("John 3:16");
    fireEvent.click(verse(18), { shiftKey: true });
    expect([16, 17, 18].every((v) => verse(v).getAttribute("aria-pressed") === "true")).toBe(true);
    expect(selectionBar().textContent).toContain("John 3:16–18");
    expect(selectionBar().textContent).toContain("3 verses");
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(selectionBar().textContent).toContain("No verses selected");
  });

  it("saves a passage, lists it on Home, and unsaves it when chosen again", async () => {
    await openBible();
    await search("John 3:16-17");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("button", { name: "Saved" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    // With nothing selected the bar only says so: there is no Bible Study screen to open.
    expect(selectionBar().textContent).toBe("No verses selected");

    fireEvent.click(screen.getByRole("button", { name: "Home" }));
    const recent = within(await screen.findByRole("list", { name: "Recently saved verses" }));
    expect(await recent.findByText("John 3:16–17")).toBeTruthy();
    fireEvent.click(recent.getByTitle("Open in the Bible"));
    await screen.findByRole("heading", { level: 1, name: "John 3" });
    expect(selectionBar().textContent).toContain("John 3:16–17");

    fireEvent.click(screen.getByRole("button", { name: "Saved" }));
    expect(screen.getByRole("button", { name: "Save" }).getAttribute("aria-pressed")).toBe("false");
  });
});

describe("removed study tools", () => {
  it("has no Word Study, Cross references or Chapter Overview, and reading still works", async () => {
    await openBible();
    // No Overview / Reading switch above the chapter.
    expect(screen.queryByRole("radiogroup", { name: "Chapter view" })).toBeNull();
    expect(screen.queryByRole("radio", { name: "Overview" })).toBeNull();
    // Selecting verses offers Save and Present Now, but no Cross references.
    await search("John 3:16");
    const bar = within(selectionBar() as HTMLElement);
    expect(bar.getByRole("button", { name: "Save" })).toBeTruthy();
    expect(bar.getByRole("button", { name: /Present Now/ })).toBeTruthy();
    expect(bar.queryByRole("button", { name: /Cross references/ })).toBeNull();
    expect(screen.queryByRole("complementary", { name: "Cross references" })).toBeNull();
    // A keyword search lists its verses, with no Word Study button.
    await search("faith", "Keyword");
    expect(await screen.findByText("2 verses")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Word Study/ })).toBeNull();
    // There is no Bible Study screen any more.
    expect(screen.queryByRole("button", { name: "Bible Study" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Saved verses/ })).toBeNull();
  });
});

describe("presenting from the Bible", () => {
  it("presents one verse and steps verse by verse into the next chapter", async () => {
    await openBible();
    await search("John 3:17");
    const panel = await present();
    expect(panel.getByText("Slide 17 of 18")).toBeTruthy();
    expect(onScreen()).toBe("filler 42.3.17");
    expect(projector().slide?.footer).toBe("John 3:17 (TEN)");
    fireEvent.click(panel.getByRole("button", { name: /^Next/ }));
    expect(onScreen()).toBe("filler 42.3.18");
    // The slide list offers the next chapter after the last verse.
    expect(panel.getByRole("button", { name: /^John 4/ })).toBeTruthy();
    await act(async () => { fireEvent.click(panel.getByRole("button", { name: /^Next/ })); });
    expect(projector().slide?.label).toBe("John 4:1");
    fireEvent.click(panel.getByRole("button", { name: /Previous/ }));
    expect(projector().slide?.label).toBe("John 3:18");
  });

  it("presents a passage from the first selected verse, and Enter presents too", async () => {
    await openBible();
    await search("John 3:16-18");
    await act(async () => { fireEvent.keyDown(document.body, { key: "Enter" }); });
    const panel = within(screen.getByRole("complementary", { name: "Presentation" }));
    expect(onScreen()).toBe("placeholder love and faith words");
    // The selected verses are outlined in the slide list.
    expect(panel.getByRole("button", { name: /Slide 16: John 3:16 \(showing now\)/ })).toBeTruthy();
    fireEvent.click(panel.getByRole("button", { name: /Slide 18: John 3:18/ }));
    expect(onScreen()).toBe("filler 42.3.18");
  });

  it("blank, show, stop, start and close work, and so do the keys", async () => {
    await openBible();
    await search("John 3:1");
    const panel = await present();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(projector().slide?.label).toBe("John 3:2");
    fireEvent.keyDown(window, { key: "b" });
    expect(projector().blackout).toBe(true);
    fireEvent.click(panel.getByRole("button", { name: /Show/ }));
    expect(projector().blackout).toBe(false);
    fireEvent.click(panel.getByRole("button", { name: /Blank/ }));
    expect(projector().blackout).toBe(true);
    fireEvent.keyDown(window, { key: "ArrowLeft" }); // moving on shows the screen again
    expect(projector()).toMatchObject({ blackout: false, slide: { label: "John 3:1" } });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    await act(async () => { fireEvent.keyDown(window, { key: "Escape" }); });
    expect(panel.getByText("Projector off")).toBeTruthy();
    expect(panel.getByText("Slide 2 of 18")).toBeTruthy();
    await act(async () => { fireEvent.click(panel.getByRole("button", { name: /Start presenting/ })); });
    expect(onScreen()).toBe("filler 42.3.2");
    await act(async () => { fireEvent.click(panel.getByRole("button", { name: /Stop presentation/ })); });
    expect(screen.queryByRole("complementary", { name: "Presentation" })).toBeNull();
    expect(projector().slide).toBeNull();
  });

  it("presents Malayalam alone and both languages side by side", async () => {
    await openBible();
    fireEvent.click(screen.getByRole("radio", { name: "മലയാളം" }));
    await screen.findByRole("heading", { level: 1, name: "ഉല്പത്തി 1" });
    await search("യോഹന്നാൻ 3:16");
    expect(document.querySelectorAll(".verses .verse")).toHaveLength(17);
    await present();
    expect(onScreen()).toBe("സ്നേഹം വാക്കുകൾ");
    expect(projector().slide).toMatchObject({ lang: "ml", footer: "യോഹന്നാൻ 3:16 (TML)" });

    fireEvent.click(screen.getByRole("radio", { name: /EN \+/ }));
    await waitFor(() => expect(document.querySelectorAll(".prow")).toHaveLength(18));
    expect(screen.getByText(/not in this translation/)).toBeTruthy();
    await search("John 3:16");
    await present();
    expect(projector().slide).toMatchObject({ lines: ["placeholder love and faith words"], parallelLines: ["സ്നേഹം വാക്കുകൾ"], footer: "John 3:16 (TEN · TML)" });
  });

  it("shows only the slide on the projector: nothing about the Bible screen is sent", async () => {
    await openBible();
    await search("John 3:16");
    await present();
    expect(Object.keys(projector()).sort()).toEqual(["blackout", "clear", "logo", "slide", "theme"]);
  });
});
