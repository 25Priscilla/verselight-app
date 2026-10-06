// @vitest-environment jsdom
// The Bible, end to end: navigation, search, selection, saved verses, cross references, Chapter Overview,
// Word Study, English and Malayalam, and presenting a passage through to what the projector is sent.
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { verseId } from "../lib/crossrefs";
import type { BibleMeta, LiveState } from "../lib/types";
import { fakeEnglish, fakeMalayalam, JOHN } from "../test/fakeBible";
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

async function openBible({ xrefs = true, bibles = metas } = {}) {
  localStorage.setItem("verselight:library.json", JSON.stringify({
    items: [], services: [], bibles, bookmarks: [],
    ...(xrefs ? { crossRefs: { count: 2, credit: "test", importedAt: 1 } } : {}),
  }));
  if (xrefs) {
    localStorage.setItem("verselight:crossrefs.json", JSON.stringify({
      format: "verselight-xrefs", credit: "", license: "", source: "", changes: "", count: 2,
      refs: { [verseId(JOHN, 3, 16)]: [verseId(44, 5, 8), verseId(44, 5, 8), 40, verseId(61, 4, 9), verseId(61, 4, 10), 30] },
    }));
  }
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

  it("saves a passage, lists it in Bible Study, opens, presents and removes it", async () => {
    await openBible();
    await search("John 3:16-17");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("button", { name: "Saved" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    fireEvent.click(screen.getByRole("button", { name: /Saved verses · 1/ }));

    const saved = await screen.findByRole("list", { name: "Saved verses" });
    expect(within(saved).getByText("John 3:16–17")).toBeTruthy();
    expect(within(saved).getByText(/placeholder love and faith words/)).toBeTruthy();

    fireEvent.click(within(saved).getByRole("button", { name: "Open John 3:16–17" }));
    await screen.findByRole("heading", { level: 1, name: "John 3" });
    expect(selectionBar().textContent).toContain("John 3:16–17");

    fireEvent.click(screen.getByRole("button", { name: "Bible Study" }));
    await act(async () => { fireEvent.click(within(saved).getByRole("button", { name: "Present John 3:16–17" })); });
    const panel = within(screen.getByRole("complementary", { name: "Presentation" }));
    expect(panel.getByText("Slide 16 of 18")).toBeTruthy();
    expect(onScreen()).toBe("placeholder love and faith words");

    fireEvent.click(within(saved).getByRole("button", { name: /Remove John 3:16–17/ }));
    expect(screen.getByText(/No saved verses yet/)).toBeTruthy();
  });

  it("shows a saved verse in another translation, and says when that translation lacks it", async () => {
    await openBible();
    await search("John 3:18");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    // Word Study follows the translation being read on the Bible screen.
    fireEvent.click(screen.getByRole("radio", { name: "മലയാളം" }));
    await screen.findByRole("heading", { level: 1, name: "യോഹന്നാൻ 3" });
    fireEvent.click(screen.getByRole("button", { name: "Bible Study" }));
    fireEvent.click(screen.getByRole("tab", { name: /Saved/ }));
    const saved = await screen.findByRole("list", { name: "Saved verses" });
    await waitFor(() => expect(within(saved).getByText("Not in TML")).toBeTruthy());
    expect(within(saved).getByText("യോഹന്നാൻ 3:18")).toBeTruthy();
  });
});

describe("cross references", () => {
  it("lists related passages for the selected verse and opens one", async () => {
    await openBible();
    await search("John 3:16");
    fireEvent.click(screen.getByRole("button", { name: /Cross references/ }));
    const panel = within(await screen.findByRole("complementary", { name: "Cross references" }));
    await panel.findByText("Romans 5:8");
    expect(panel.getByText("1 John 4:9–10")).toBeTruthy();
    fireEvent.click(panel.getAllByRole("button", { name: "Open" })[0]);
    expect(heading()).toBe("Romans 5");
    expect(verse(8).getAttribute("aria-pressed")).toBe("true");
  });

  it("shows a clean empty state for a verse without references", async () => {
    await openBible();
    await search("John 3:17");
    fireEvent.click(screen.getByRole("button", { name: /Cross references/ }));
    const panel = within(await screen.findByRole("complementary", { name: "Cross references" }));
    expect(await panel.findByText("No cross references for John 3:17.")).toBeTruthy();
  });

  it("offers to import cross references when there are none", async () => {
    await openBible({ xrefs: false });
    await search("John 3:16");
    fireEvent.click(screen.getByRole("button", { name: /Cross references/ }));
    const panel = within(screen.getByRole("complementary", { name: "Cross references" }));
    expect(panel.getByText("Cross references aren't imported yet.")).toBeTruthy();
    expect(panel.getByRole("button", { name: /Import cross references/ })).toBeTruthy();
  });
});

describe("Chapter Overview", () => {
  it("shows this chapter's own sections and key verses, and switches back to reading", async () => {
    await openBible();
    await search("John 3");
    fireEvent.click(screen.getByRole("radio", { name: "Overview" }));
    const ov = within(screen.getByLabelText("John 3 overview"));
    expect(await ov.findByText("Jesus and Nicodemus")).toBeTruthy();
    expect(await ov.findByText("John 3:16")).toBeTruthy();
    expect(ov.getByRole("note").textContent).toContain("doesn't include written summaries");

    fireEvent.click(ov.getByRole("button", { name: /Chapter 4/ }));
    const ov4 = within(screen.getByLabelText("John 4 overview"));
    expect(await ov4.findByText(/Samaritan/)).toBeTruthy();
    expect(ov4.queryByText("Jesus and Nicodemus")).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: "Reading" }));
    expect(document.querySelectorAll(".verses .verse")).toHaveLength(6);
  });

  it("goes to a section's first verse in the reading view", async () => {
    await openBible();
    await search("Genesis 1");
    fireEvent.click(screen.getByRole("radio", { name: "Overview" }));
    fireEvent.click(await screen.findByRole("button", { name: /The First Day/ }));
    expect(verse(3).getAttribute("aria-pressed")).toBe("true");
  });
});

describe("Word Study", () => {
  it("studies a word from a keyword search, with counts and every occurrence", async () => {
    await openBible();
    await search("faith", "Keyword");
    fireEvent.click(screen.getByRole("button", { name: /Word Study/ }));
    const status = await screen.findByText(/Found 2 occurrences/);
    expect(status).toBeTruthy();
    const facts = within(screen.getByLabelText("Word facts"));
    expect(facts.getByText("New Testament").nextElementSibling!.textContent).toBe("2 verses");
    expect(screen.getByRole("note").textContent).toContain("Hebrew and Greek:");
    expect(screen.getByRole("note").textContent).toContain("not available");
    // Open an occurrence in the Bible.
    fireEvent.click(screen.getAllByRole("button", { name: /Open in Bible/ })[1]);
    await screen.findByRole("heading", { level: 1, name: "Ephesians 2" });
    expect(verse(8).getAttribute("aria-pressed")).toBe("true");
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
    expect(panel.getByText("John 4 (next chapter)")).toBeTruthy();
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

  it("black, show, stop, start and close work, and so do the keys", async () => {
    await openBible();
    await search("John 3:1");
    const panel = await present();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(projector().slide?.label).toBe("John 3:2");
    fireEvent.keyDown(window, { key: "b" });
    expect(projector().blackout).toBe(true);
    fireEvent.click(panel.getByRole("button", { name: /Show/ }));
    expect(projector().blackout).toBe(false);
    fireEvent.click(panel.getByRole("button", { name: /Black/ }));
    expect(projector().blackout).toBe(true);
    fireEvent.keyDown(window, { key: "ArrowLeft" }); // moving on shows the screen again
    expect(projector()).toMatchObject({ blackout: false, slide: { label: "John 3:1" } });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    await act(async () => { fireEvent.click(panel.getByRole("button", { name: /Stop presentation/ })); });
    expect(panel.getByText("Projector off")).toBeTruthy();
    expect(panel.getByText("Slide 2 of 18")).toBeTruthy();
    await act(async () => { fireEvent.click(panel.getByRole("button", { name: /Start presenting/ })); });
    expect(onScreen()).toBe("filler 42.3.2");
    await act(async () => { fireEvent.click(panel.getByRole("button", { name: "Close presentation" })); });
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
    expect(Object.keys(projector()).sort()).toEqual(["blackout", "clear", "slide", "theme"]);
  });
});
