// @vitest-environment jsdom
// The ESV read online, end to end: the translation selector, reading, reference and keyword search, the bilingual view,
// Word Study, and presenting through to what the projector is sent. The ESV API is a stand-in and every "verse" is
// made-up placeholder text: VerseLight never contains ESV text, and tests never reach the real API.
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ESV_BIBLE_ID } from "../lib/bible";
import { clearEsv, ESV_COPYRIGHT, saveEsvKey } from "../lib/esv";
import type { BibleMeta, LiveState } from "../lib/types";
import { fakeEnglish, fakeMalayalam } from "../test/fakeBible";
import { LibraryProvider } from "../state/library";
import { ControlApp } from "./ControlApp";

const metas: BibleMeta[] = [
  { id: "ten", name: "Test English", abbreviation: "TEN", license: "Test licence line", language: "en", bookCount: 66, importedAt: 0 },
  { id: ESV_BIBLE_ID, name: "English Standard Version", abbreviation: "ESV", license: ESV_COPYRIGHT, language: "en", bookCount: 66, importedAt: 0, source: "esv-api" },
  { id: "tml", name: "പരീക്ഷണ ബൈബിൾ", abbreviation: "TML", license: "Test Malayalam licence", language: "ml", bookCount: 66, importedAt: 0 },
];

/** Verse counts the stand-in API gives; John 3:17 is left out, like a verse the ESV keeps only in a footnote. */
const VERSES: Record<string, number> = { "John 3": 18, "John 4": 4 };
const OMITTED = new Set(["John 3:17"]);
let requests: string[] = [];

function fakeEsvApi() {
  return vi.fn(async (url: string) => {
    const u = new URL(url);
    const q = u.searchParams.get("q") ?? "";
    requests.push(`${u.pathname} ${q}`);
    if (u.pathname.includes("/search/")) {
      return { ok: true, status: 200, json: async () => ({ total_results: 1, results: [{ reference: "John 3:16", content: "esv placeholder hope" }] }) } as Response;
    }
    const n = VERSES[q] ?? 5;
    const text = Array.from({ length: n }, (_, i) => (OMITTED.has(`${q}:${i + 1}`) ? "" : `[${i + 1}] esv ${q}:${i + 1} `)).join("");
    return { ok: true, status: 200, json: async () => ({ passages: [text] }) } as Response;
  });
}

let sent: LiveState[] = [];
const projector = () => sent[sent.length - 1];
const onScreen = () => projector()?.slide?.lines.join(" ");

beforeEach(async () => {
  localStorage.clear();
  await clearEsv();
  await saveEsvKey("test-key");
  sent = [];
  requests = [];
  vi.stubGlobal("fetch", fakeEsvApi());
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
afterEach(() => vi.unstubAllGlobals());

async function openBible() {
  localStorage.setItem("verselight:library.json", JSON.stringify({ items: [], services: [], bibles: metas, bookmarks: [] }));
  render(<LibraryProvider><ControlApp /></LibraryProvider>);
  fireEvent.click(await screen.findByRole("button", { name: "Bible" }));
  await screen.findByRole("heading", { level: 1, name: "Genesis 1" });
}

const translation = () => screen.getByRole("combobox", { name: "English translation" }) as HTMLSelectElement;
async function chooseEsv() {
  fireEvent.change(translation(), { target: { value: ESV_BIBLE_ID } });
  await screen.findByText(/esv Genesis 1:1/);
}
const heading = () => screen.getByRole("heading", { level: 1 }).textContent;
const verse = (n: number) => document.querySelectorAll<HTMLElement>(".verses .verse")[n - 1];

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

describe("the ESV in the translation selector", () => {
  it("is listed with the other English Bibles and reads a chapter from the API", async () => {
    await openBible();
    expect([...translation().options].map((o) => o.textContent)).toEqual(
      ["TEN · Test English", "ESV · English Standard Version", "──────────", "Manage Bibles…"]);
    expect(requests).toEqual([]); // nothing is fetched until the ESV is chosen
    await chooseEsv();
    expect(requests).toEqual(["/v3/passage/text/ Genesis 1"]);
    expect(screen.getByLabelText("Current location").textContent).toContain("ESV");
    expect(document.querySelectorAll(".verses .verse")).toHaveLength(5);
  });

  it("shows Crossway's notice and a link to www.esv.org under the text", async () => {
    await openBible();
    await chooseEsv();
    const notice = document.querySelector(".reading-license")!;
    expect(notice.textContent).toContain("© 2001 by Crossway");
    expect(within(notice as HTMLElement).getByRole("link", { name: "www.esv.org" }).getAttribute("href")).toBe("https://www.esv.org");
  });

  it("switches back to the imported Bible unchanged", async () => {
    await openBible();
    await chooseEsv();
    fireEvent.change(translation(), { target: { value: "ten" } });
    await screen.findByText(/first words of the placeholder book/);
    expect(document.querySelector(".reading-license")!.textContent).toBe("Test licence line");
    expect(screen.queryByRole("link", { name: "www.esv.org" })).toBeNull();
  });

  it("says what to do when the API key is missing", async () => {
    await clearEsv();
    await openBible();
    fireEvent.change(translation(), { target: { value: ESV_BIBLE_ID } });
    expect(await screen.findByText(/needs your ESV API key/)).toBeTruthy();
  });
});

describe("ESV navigation and search", () => {
  it("chooses a book and chapter, fetching each chapter as it is opened", async () => {
    await openBible();
    await chooseEsv();
    fireEvent.click(within(document.querySelector(".book-list")!).getByRole("button", { name: "John" }));
    await screen.findByText(/esv John 1:1/);
    fireEvent.click(screen.getByRole("option", { name: "4" }));
    await screen.findByText(/esv John 4:1/);
    expect(screen.getByLabelText("Current location").textContent).toContain("Chapter 4 of 21");
    expect(requests).toContain("/v3/passage/text/ John 4");
  });

  it("opens a reference with the verse selected once the chapter arrives", async () => {
    await openBible();
    await chooseEsv();
    await search("John 3:16");
    expect(heading()).toBe("John 3");
    await waitFor(() => expect(verse(16)?.getAttribute("aria-pressed")).toBe("true"));
    expect(verse(16).textContent).toContain("esv John 3:16");
  });

  it("searches words with the ESV API and opens a result", async () => {
    await openBible();
    await chooseEsv();
    await search("hope", "Keyword");
    const results = await waitFor(() => document.querySelector<HTMLElement>(".results")!);
    expect(results.querySelector(".hit-text")!.textContent).toBe("esv placeholder hope");
    expect(results.querySelector("mark")!.textContent).toBe("hope");
    expect(requests).toContain("/v3/passage/search/ hope");
    fireEvent.click(within(results).getByText("John 3:16"));
    await waitFor(() => expect(verse(16)?.getAttribute("aria-pressed")).toBe("true"));
  });

  it("reads side by side with the Malayalam Bible", async () => {
    await openBible();
    await chooseEsv();
    fireEvent.click(screen.getByRole("radio", { name: /EN \+/ }));
    await waitFor(() => expect(document.querySelectorAll(".prow").length).toBeGreaterThan(0));
    const row = document.querySelector(".prow")!;
    expect(row.textContent).toContain("esv Genesis 1:1");
    expect(row.textContent).toContain("മലയാളം 0.1.1");
  });

  it("explains that Word Study isn't available for the ESV", async () => {
    await openBible();
    await chooseEsv();
    fireEvent.click(screen.getByRole("button", { name: "Bible Study" }));
    expect(await screen.findByText(/Word Study isn't available for the ESV/)).toBeTruthy();
  });
});

describe("presenting the ESV", () => {
  it("presents a verse credited to the ESV and steps into the next chapter, skipping an omitted verse", async () => {
    await openBible();
    await chooseEsv();
    await search("John 3:16");
    await waitFor(() => expect(verse(16)?.getAttribute("aria-pressed")).toBe("true"));
    const panel = await present();
    expect(onScreen()).toBe("esv John 3:16");
    expect(projector().slide?.footer).toBe("John 3:16 (ESV)");
    // John 3:17 is a gap in this chapter, so it has no blank slide.
    fireEvent.click(panel.getByRole("button", { name: /^Next/ }));
    expect(projector().slide?.label).toBe("John 3:18");
    await act(async () => { fireEvent.click(panel.getByRole("button", { name: /^Next/ })); });
    await waitFor(() => expect(projector().slide?.label).toBe("John 4:1"));
    expect(projector().slide?.footer).toBe("John 4:1 (ESV)");
    fireEvent.click(panel.getByRole("button", { name: /Previous/ }));
    expect(projector().slide?.label).toBe("John 3:18");
  });

  it("presents the ESV and Malayalam together", async () => {
    await openBible();
    await chooseEsv();
    fireEvent.click(screen.getByRole("radio", { name: /EN \+/ }));
    await search("John 3:16");
    await waitFor(() => expect(document.querySelector(".prow.on")).toBeTruthy());
    await present();
    expect(projector().slide).toMatchObject({ lines: ["esv John 3:16"], parallelLines: ["സ്നേഹം വാക്കുകൾ"], footer: "John 3:16 (ESV · TML)" });
  });
});

describe("connecting the ESV", () => {
  it("checks the key, adds the ESV to the Bibles, and keeps the key out of the library", async () => {
    await clearEsv();
    localStorage.setItem("verselight:library.json", JSON.stringify({ items: [], services: [], bibles: [metas[0]], bookmarks: [] }));
    render(<LibraryProvider><ControlApp /></LibraryProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "Settings" }));
    fireEvent.click(within(await screen.findByRole("navigation", { name: "Settings sections" })).getByRole("button", { name: "Bibles" }));
    fireEvent.click(await screen.findByRole("button", { name: "Import a Bible" }));
    fireEvent.click(screen.getByRole("button", { name: "Use the ESV online…" }));
    const connect = screen.getByRole("button", { name: "Connect ESV" }) as HTMLButtonElement;
    fireEvent.change(screen.getByLabelText("ESV API key"), { target: { value: "church-key" } });
    expect(connect.disabled).toBe(true); // the terms must be accepted first
    fireEvent.click(screen.getByRole("checkbox"));
    await act(async () => { fireEvent.click(connect); });
    await screen.findByText("English Standard Version");
    expect(requests).toEqual(["/v3/passage/text/ John 1:1"]);
    expect(localStorage.getItem("verselight:esv-api-key.json")).toContain("church-key");
    await waitFor(() => expect(localStorage.getItem("verselight:library.json")).toContain(ESV_BIBLE_ID));
    expect(localStorage.getItem("verselight:library.json")).not.toContain("church-key");
  });
});
