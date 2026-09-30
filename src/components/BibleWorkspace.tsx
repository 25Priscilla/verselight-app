import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import type { ScriptureSpec } from "../lib/session";
import { splitId } from "../lib/crossrefs";
import { bibleLang, BOOK_NAMES, detectBibleLanguage, getVerses, loadBible, parseReference, searchBible, type BibleData, type SearchHit } from "../lib/bible";
import { rangeLabel } from "../lib/slides";

import { useLibrary } from "../state/library";
import { ImportBibleDialog, ImportCrossRefsDialog } from "./BibleDialogs";
import { ChapterOverview } from "./ChapterOverview";
import { CrossRefPanel } from "./CrossRefPanel";
import { Icon } from "./Icon";
import { EmptyState } from "./ui";

interface Selection { anchor: number; from: number; to: number }

/** A request from another screen (Word Study) to open one verse in a given translation. */
export interface OpenVerseRequest { bibleId: string; book: number; chapter: number; verse: number; nonce: number }

export function BibleWorkspace({ active, onPresent, onTranslation, openRequest, onManageBibles, focusSearch }: {
  active: boolean;
  onPresent: (spec: ScriptureSpec) => void;
  /** Reports the translation being read, so Word Study can search the same one */
  onTranslation?: (bibleId: string) => void;
  openRequest?: OpenVerseRequest | null;
  /** Opens Settings → Bibles, where Bibles and cross references are imported and removed */
  onManageBibles: () => void;
  /** Changes when another screen (Home) asks for the search box to be ready for typing */
  focusSearch?: number;
}) {
  const { library, update } = useLibrary();
  const enBibles = library.bibles.filter((b) => bibleLang(b) === "en");
  const mlBibles = library.bibles.filter((b) => bibleLang(b) === "ml");
  const [view, setView] = useState<"en" | "ml" | "both">(enBibles.length ? "en" : "ml");
  const [enId, setEnId] = useState(enBibles[0]?.id ?? "");
  const [mlId, setMlId] = useState(mlBibles[0]?.id ?? "");
  // The primary Bible drives navigation; the second one (bilingual view) is matched by verse number.
  const bibleId = view === "ml" ? mlId : enId;
  const secondId = view === "both" ? mlId : "";
  const [bible, setBible] = useState<BibleData | null>(null);
  const [bible2, setBible2] = useState<BibleData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [book, setBook] = useState(0);
  const [chapter, setChapter] = useState(1);
  const [sel, setSel] = useState<Selection | null>(null);
  /** In the bilingual view: which languages go on the projector */
  const [onScreen, setOnScreen] = useState<"both" | "first" | "second">("both");
  const [xrOpen, setXrOpen] = useState(false);
  /** Chapter Overview instead of the verse-by-verse reading view (study only; never presents) */
  const [overview, setOverview] = useState(false);
  const [mode, setMode] = useState<"reference" | "keyword">("reference");
  const [query, setQuery] = useState("");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [results, setResults] = useState<{ query: string; hits: SearchHit[]; total: number } | null>(null);
  const [dialog, setDialog] = useState<"import" | "xrefs" | null>(null);
  const [scrollTo, setScrollTo] = useState<number | null>(null);
  const verseRefs = useRef(new Map<number, HTMLElement>());
  const readingRef = useRef<HTMLDivElement>(null);
  const chaptersRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Fall back to another Bible of the same language if the chosen one was removed.
  useEffect(() => {
    if (!enBibles.some((b) => b.id === enId)) setEnId(enBibles[0]?.id ?? "");
    if (!mlBibles.some((b) => b.id === mlId)) setMlId(mlBibles[0]?.id ?? "");
    if (view === "en" && !enBibles.length && mlBibles.length) setView("ml");
    if (view === "ml" && !mlBibles.length && enBibles.length) setView("en");
    if (view === "both" && (!enBibles.length || !mlBibles.length)) setView(enBibles.length ? "en" : "ml");
  }, [library.bibles, enId, mlId, view]);

  const load = (id: string, set: (b: BibleData | null) => void) => {
    set(null);
    if (!id) return;
    loadBible(id)
      .then((b) => {
        if (!b) return setLoadError("This Bible's file is missing. Remove it and import it again.");
        set(b);
        // Build the search index in the background so the first keyword search is instant.
        setTimeout(() => searchBible(b, "a"), 300);
        // Record the language of Bibles imported before languages were tracked.
        const meta = library.bibles.find((m) => m.id === id);
        if (meta && !meta.language) {
          const language = detectBibleLanguage(b);
          update((lib) => ({ ...lib, bibles: lib.bibles.map((m) => (m.id === id ? { ...m, language } : m)) }));
        }
      })
      .catch((e) => setLoadError(String(e)));
  };
  useEffect(() => { setLoadError(null); load(bibleId, setBible); }, [bibleId]);
  useEffect(() => { load(secondId, setBible2); }, [secondId]);

  // Scroll once the verse is on screen (it may still be loading, e.g. after switching translation).
  useEffect(() => {
    if (scrollTo === null || !active) return;
    const el = verseRefs.current.get(scrollTo);
    if (!el) return;
    el.scrollIntoView({ block: "center" });
    setScrollTo(null);
  }, [scrollTo, bible, book, chapter, active]);

  useEffect(() => { if (bibleId) onTranslation?.(bibleId); }, [bibleId, onTranslation]);

  // Home's "Find a Bible verse": show the search box ready for a reference.
  useEffect(() => {
    if (!focusSearch) return;
    setMode("reference");
    requestAnimationFrame(() => searchRef.current?.focus());
  }, [focusSearch]);

  // Open a verse sent from Word Study, in the translation it was found in.
  useEffect(() => {
    if (!openRequest) return;
    const target = library.bibles.find((b) => b.id === openRequest.bibleId);
    if (target) {
      if (bibleLang(target) === "ml") { setMlId(target.id); if (view === "en") setView("ml"); }
      else { setEnId(target.id); if (view === "ml") setView("en"); }
    }
    openChapter(openRequest.book, openRequest.chapter, { from: openRequest.verse, to: openRequest.verse });
  }, [openRequest?.nonce]);

  // Keep the current chapter chip visible in the scrolling strip.
  useEffect(() => {
    const strip = chaptersRef.current;
    const chip = strip?.querySelector<HTMLElement>("button.on");
    if (strip && chip) strip.scrollTo({ left: chip.offsetLeft - strip.clientWidth / 2 + chip.clientWidth / 2 });
  }, [book, chapter, bible, active]);

  const meta = library.bibles.find((b) => b.id === bibleId);
  const meta2 = view === "both" ? library.bibles.find((b) => b.id === secondId) : undefined;
  const bookData = bible?.books[book];
  const verses = bookData?.chapters[chapter - 1] ?? [];
  // Both Bibles use the standard 66-book order, so the same book index is the same book.
  const second = bible2 && bible2.books.length === bible?.books.length ? bible2 : null;
  const verses2 = second?.books[book]?.chapters[chapter - 1] ?? [];
  const rows = Math.max(verses.length, verses2.length);
  const selected = useMemo(
    () => (bible && sel ? getVerses(bible, book, chapter, sel.from, sel.to) : []),
    [bible, book, chapter, sel],
  );
  const reference = rangeLabel(selected.map((v) => v.ref));

  const openChapter = (b: number, c: number, select?: { from: number; to: number }) => {
    setBook(b);
    setChapter(c);
    setSel(select ? { anchor: select.from, ...select } : null);
    setResults(null);
    if (select) setScrollTo(select.from);
    else readingRef.current?.scrollTo({ top: 0 });
  };

  const clickVerse = (v: number, e: MouseEvent | { shiftKey: boolean }) => {
    if (e.shiftKey && sel) {
      setSel({ anchor: sel.anchor, from: Math.min(sel.anchor, v), to: Math.max(sel.anchor, v) });
    } else if (sel && sel.from === v && sel.to === v) {
      setSel(null);
    } else {
      setSel({ anchor: v, from: v, to: v });
    }
  };

  const runSearch = () => {
    setSearchError(null);
    if (!bible || !query.trim()) return;
    if (mode === "reference") {
      // English or Malayalam book names both work in the bilingual view.
      const ref = parseReference(bible, query) ?? (second ? parseReference(second, query) : null);
      if (!ref) return setSearchError(`No book matches “${query.trim()}”. Try a reference like John 3:16.`);
      openChapter(ref.bookIndex, ref.chapter, ref.from ? { from: ref.from, to: ref.to ?? ref.from } : undefined);
    } else {
      const a = searchBible(bible, query);
      if (!second) return setResults({ query, hits: a.hits, total: a.total });
      // Bilingual: search both translations and merge by verse, so English or Malayalam words find the passage.
      const b = searchBible(second, query);
      const seen = new Set(a.hits.map((h) => `${h.bookIndex}:${h.chapter}:${h.verse}`));
      const extra = b.hits.filter((h) => !seen.has(`${h.bookIndex}:${h.chapter}:${h.verse}`))
        .map((h) => ({ ...h, text: bible.books[h.bookIndex]?.chapters[h.chapter - 1]?.[h.verse - 1] ?? "" }));
      const hits = [...a.hits, ...extra].sort((x, y) => x.bookIndex - y.bookIndex || x.chapter - y.chapter || x.verse - y.verse);
      setResults({ query, hits, total: a.total + extra.length + Math.max(0, b.total - b.hits.length) });
    }
  };

  /** What ▶ Present Now sends: the verses to start from, in the translations on screen. The session covers the whole chapter. */
  const specFor = (b: number, c: number, from: number, to: number): ScriptureSpec | null =>
    bibleId ? { primaryId: bibleId, secondId: second && meta2 ? secondId : undefined, onScreen, book: b, chapter: c, from, to } : null;

  // ---- cross references (panel shared with Word Study) ----
  const openRef = (start: number, end: number) => {
    const a = splitId(start), z = splitId(end);
    const last = a.chapter === z.chapter ? z.verse : bible?.books[a.book]?.chapters[a.chapter - 1]?.length ?? a.verse;
    openChapter(a.book, a.chapter, { from: a.verse, to: last });
  };
  const refSpec = (start: number, end: number) => {
    const a = splitId(start), z = splitId(end);
    const last = a.chapter === z.chapter ? z.verse : bible?.books[a.book]?.chapters[a.chapter - 1]?.length ?? a.verse;
    return specFor(a.book, a.chapter, a.verse, last);
  };

  const present = () => {
    const spec = sel ? specFor(book, chapter, sel.from, Math.min(sel.to, verses.length)) : null;
    if (spec) onPresent(spec);
  };


  // Enter presents the selected passage (when not typing).
  useEffect(() => {
    if (!active || overview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || (e.target as HTMLElement).closest("input, textarea, select, button, .modal")) return;
      if (selected.length) { e.preventDefault(); present(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const canonical = bible?.books.length === 66;
  const translationSelect = (label: string, value: string, set: (id: string) => void, list: typeof library.bibles) => (
    <select className="translation" aria-label={label} value={value}
      onChange={(e) => {
        const v = e.target.value;
        if (v === "__manage") onManageBibles();
        else set(v);
      }}>
      {list.length === 0 && <option value="">No Bible imported</option>}
      {list.map((b) => <option key={b.id} value={b.id}>{b.abbreviation} · {b.name}</option>)}
      <option disabled>──────────</option>
      <option value="__manage">Manage Bibles…</option>
    </select>
  );
  const bookButton = (i: number) => (
    <li key={i}>
      <button className={i === book ? "on" : ""} onClick={() => openChapter(i, 1)}>
        <span lang={bibleLang(meta)}>{bible!.books[i].name}</span>
        {second && <span className="book-alt" lang="ml">{second.books[i]?.name}</span>}
      </button>
    </li>
  );

  const words = results?.query.toLowerCase().split(/\s+/).filter(Boolean) ?? [];
  const highlight = (text: string) => {
    if (!words.length) return text;
    const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
    return text.split(re).map((part, i) => (i % 2 ? <mark key={i}>{part}</mark> : part));
  };

  return (
    <div className="workspace" style={{ display: active ? "contents" : "none" }}>
      <aside className="context">
        <div className="context-head">
          <div className="seg bible-lang" role="radiogroup" aria-label="Bible language">
            <button role="radio" aria-checked={view === "en"} className={view === "en" ? "on" : ""} disabled={!enBibles.length} onClick={() => setView("en")}>English</button>
            <button role="radio" aria-checked={view === "ml"} className={view === "ml" ? "on" : ""} disabled={!mlBibles.length} onClick={() => setView("ml")} lang="ml">മലയാളം</button>
            <button role="radio" aria-checked={view === "both"} className={view === "both" ? "on" : ""} disabled={!enBibles.length || !mlBibles.length}
              onClick={() => setView("both")} title={!mlBibles.length ? "Import a Malayalam Bible to read side by side" : "English and Malayalam side by side"}>
              EN + <span lang="ml">മല</span>
            </button>
          </div>
          {view !== "ml" && translationSelect("English translation", enId, setEnId, enBibles)}
          {view !== "en" && translationSelect("Malayalam translation", mlId, setMlId, mlBibles)}
        </div>
        {bible && (
          <div className="book-list">
            {canonical ? (
              <>
                <h3>Old Testament</h3>
                <ul>{BOOK_NAMES.slice(0, 39).map((_, i) => bookButton(i))}</ul>
                <h3>New Testament</h3>
                <ul>{BOOK_NAMES.slice(39).map((_, i) => bookButton(i + 39))}</ul>
              </>
            ) : (
              <ul>{bible.books.map((_, i) => bookButton(i))}</ul>
            )}
          </div>
        )}
      </aside>

      <main className="work">
        {library.bibles.length === 0 ? (
          <div className="work-empty">
            <EmptyState title="Import a Bible to begin">
              <p>VerseLight doesn't include Bible text. Import a JSON file from a source you're allowed to use, such as the public-domain KJV (see the README).</p>
              <button className="btn primary" onClick={() => setDialog("import")}><Icon name="download" />Import a Bible</button>
            </EmptyState>
          </div>
        ) : (
          <>
            <div className="toolbar">
              <div className="search">
                <div className="seg" role="radiogroup" aria-label="Search type">
                  {(["reference", "keyword"] as const).map((m) => (
                    <button key={m} role="radio" aria-checked={mode === m} className={mode === m ? "on" : ""}
                      onClick={() => { setMode(m); setSearchError(null); }}>
                      {m === "reference" ? "Reference" : "Keyword"}
                    </button>
                  ))}
                </div>
                <Icon name="search" />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && runSearch()}
                  placeholder={mode === "reference" ? "Go to a reference, e.g. Psalm 23 or Jn 3:16-18" : "Search words, e.g. peace be still"}
                  aria-label={mode === "reference" ? "Search by reference" : "Search by keyword"}
                  disabled={!bible}
                />
                <button className="btn small" onClick={runSearch} disabled={!bible || !query.trim()}>
                  {mode === "reference" ? "Go" : "Search"}
                </button>
              </div>
              {searchError && <p className="search-error">{searchError}</p>}
            </div>

            {loadError && <div className="alert">{loadError}</div>}

            {results ? (
              <div className="results">
                <div className="results-head">
                  <button className="btn ghost small" onClick={() => setResults(null)}><Icon name="prev" />Back to {bookData?.name} {chapter}</button>
                  <span className="muted small">
                    {results.total === 0 ? "No verses found" : results.total > results.hits.length
                      ? `Showing ${results.hits.length} of ${results.total} verses` : `${results.total} verses`}
                  </span>
                </div>
                <ul>
                  {results.hits.map((h) => (
                    <li key={`${h.bookIndex}-${h.chapter}-${h.verse}`}>
                      <button onClick={() => openChapter(h.bookIndex, h.chapter, { from: h.verse, to: h.verse })}>
                        <span className="hit-ref">{bible!.books[h.bookIndex].name} {h.chapter}:{h.verse}</span>
                        <span className="hit-text" lang={bibleLang(meta)}>{highlight(h.text)}</span>
                        {second && (
                          <span className="hit-text hit-second" lang="ml">
                            {highlight(second.books[h.bookIndex]?.chapters[h.chapter - 1]?.[h.verse - 1] ?? "")}
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : bible && bookData ? (
              <>
                <div className="chapter-bar">
                  <div className="chapter-title-row">
                  <h1 className="book-title">
                    <span lang={bibleLang(meta)}>{bookData.name}</span>
                    {second && <span className="book-title-alt" lang="ml">{second.books[book]?.name}</span>}
                  </h1>
                  <div className="seg view-switch" role="radiogroup" aria-label="Chapter view">
                    <button role="radio" aria-checked={!overview} className={!overview ? "on" : ""} onClick={() => setOverview(false)}>Read</button>
                    <button role="radio" aria-checked={overview} className={overview ? "on" : ""} onClick={() => setOverview(true)}>Overview</button>
                  </div>
                  </div>
                  <div className="chapter-nav">
                    <button className="icon-btn sm" disabled={chapter <= 1} onClick={() => openChapter(book, chapter - 1)} aria-label="Previous chapter" title="Previous chapter">
                      <Icon name="prev" size={15} />
                    </button>
                    <div className="chapters" role="listbox" aria-label="Chapter" ref={chaptersRef}>
                      {bookData.chapters.map((_, i) => (
                        <button key={i} role="option" aria-selected={chapter === i + 1}
                          className={chapter === i + 1 ? "on" : ""} onClick={() => openChapter(book, i + 1)}>
                          {i + 1}
                        </button>
                      ))}
                    </div>
                    <button className="icon-btn sm" disabled={chapter >= bookData.chapters.length} onClick={() => openChapter(book, chapter + 1)} aria-label="Next chapter" title="Next chapter">
                      <Icon name="next" size={15} />
                    </button>
                  </div>
                </div>

                {overview ? (
                  <div className="bible-body">
                    <ChapterOverview
                      bible={bible}
                      meta={meta}
                      second={second}
                      book={book}
                      chapter={chapter}
                      onRead={(select) => { setOverview(false); openChapter(book, chapter, select); }}
                      onChapter={(b, c) => openChapter(b, c)}
                      onImportXrefs={() => setDialog("xrefs")}
                    />
                  </div>
                ) : (
                <div className="bible-body">
                <div className="reading" ref={readingRef}>
                  <p className="reading-hint muted small">Click a verse to select it. Shift-click another verse to select the passage between.</p>
                  <h2 className="chapter-heading">Chapter {chapter}</h2>
                  {second ? (
                    <div className="parallel" role="table" aria-label="Parallel Bible">
                      <div className="parallel-head" role="row">
                        <span role="columnheader" />
                        <span role="columnheader">{meta?.abbreviation}</span>
                        <span role="columnheader">{meta2?.abbreviation}</span>
                      </div>
                      {Array.from({ length: rows }, (_, i) => {
                        const v = i + 1;
                        const on = !!sel && v >= sel.from && v <= sel.to;
                        const inPrimary = v <= verses.length;
                        return (
                          <div
                            key={v}
                            ref={(el) => { if (el) verseRefs.current.set(v, el); else verseRefs.current.delete(v); }}
                            role="row"
                            tabIndex={inPrimary ? 0 : -1}
                            aria-selected={on}
                            className={`prow ${on ? "on" : ""} ${inPrimary ? "" : "only-second"}`}
                            onClick={(e) => inPrimary && clickVerse(v, e)}
                            onKeyDown={(e) => {
                              if (inPrimary && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); e.stopPropagation(); clickVerse(v, e); }
                            }}
                          >
                            <span className="pnum" role="cell">{v}</span>
                            <span className="ptext" role="cell" lang={bibleLang(meta)}>{verses[i] ?? <em className="pmissing">Not in this translation</em>}</span>
                            <span className="ptext" role="cell" lang="ml">{verses2[i] || <em className="pmissing">ഈ പരിഭാഷയിൽ ഇല്ല · not in this translation</em>}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                  <div className="verses" lang={bibleLang(meta)}>
                    {verses.map((text, i) => {
                      const v = i + 1;
                      const on = !!sel && v >= sel.from && v <= sel.to;
                      return (
                        <span
                          key={v}
                          ref={(el) => { if (el) verseRefs.current.set(v, el); else verseRefs.current.delete(v); }}
                          role="button"
                          tabIndex={0}
                          aria-pressed={on}
                          className={`verse ${on ? "on" : ""}`}
                          onClick={(e) => clickVerse(v, e)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); clickVerse(v, e); }
                          }}
                        >
                          <sup>{v}</sup>{text}{" "}
                        </span>
                      );
                    })}
                  </div>
                  )}
                  {meta?.license && <p className="reading-license">{meta.license}</p>}
                  {meta2?.license && <p className="reading-license" lang="ml">{meta2.license}</p>}
                </div>
                {xrOpen && (
                  <CrossRefPanel
                    passage={sel ? { book, chapter, from: sel.from, to: sel.to } : null}
                    reference={reference}
                    bible={bible}
                    meta={meta}
                    second={second}
                    onOpen={openRef}
                    onPresent={(start, end) => { const sp = refSpec(start, end); if (sp) onPresent(sp); }}
                    onImport={() => setDialog("xrefs")}
                    onClose={() => setXrOpen(false)}
                  />
                )}
                </div>
                )}
              </>
            ) : !loadError ? <p className="muted pad">Opening Bible…</p> : null}

            {!overview && (
            <div className={`addbar ${selected.length ? "has-sel" : ""}`}>
              {selected.length ? (
                <>
                  <div className="addbar-ref">
                    <strong>{reference}</strong>
                    <span className="muted small">{meta?.abbreviation} · {selected.length} {selected.length === 1 ? "verse" : "verses"}</span>
                  </div>
                  {second && (
                    <label className="inline-select">
                      <span className="muted small">Show on screen</span>
                      <select value={onScreen} onChange={(e) => setOnScreen(e.target.value as typeof onScreen)}>
                        <option value="both">{meta?.abbreviation} + {meta2?.abbreviation}</option>
                        <option value="first">{meta?.abbreviation} only</option>
                        <option value="second">{meta2?.abbreviation} only</option>
                      </select>
                    </label>
                  )}
                  <button className="btn ghost small" onClick={() => setSel(null)}>Clear</button>
                  <button className={`btn small ${xrOpen ? "on-soft" : ""}`} aria-pressed={xrOpen} onClick={() => setXrOpen((o) => !o)}
                    title="Show related passages"><Icon name="link" size={14} />Cross references</button>
                  <button className="btn present" onClick={present} title="Show it on the projector now, one verse per slide (Enter)">
                    <Icon name="play" size={14} />Present Now
                  </button>
                </>
              ) : (
                <span className="muted small">No verses selected</span>
              )}
            </div>
            )}
          </>
        )}
      </main>

      {dialog === "import" && (
        <ImportBibleDialog onClose={() => setDialog(null)} onImported={(m) => { if (bibleLang(m) === "ml") { setMlId(m.id); setView(enBibles.length ? "both" : "ml"); } else { setEnId(m.id); setView("en"); } openChapter(0, 1); }} />
      )}
      {dialog === "xrefs" && <ImportCrossRefsDialog onClose={() => setDialog(null)} onImported={() => setXrOpen(true)} />}
    </div>
  );
}
