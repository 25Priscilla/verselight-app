import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { bibleLang, ESV_BIBLE_ID, loadBible, matchRanges, searchBible, searchWords, type BibleData, type MatchMode, type SearchHit } from "../lib/bible";
import { addBookmark, bookmarkLabel, bookmarkVerses, findBookmark, lastVerse, removeBookmark } from "../lib/bookmarks";
import { splitId } from "../lib/crossrefs";
import type { ScriptureSpec } from "../lib/session";
import type { Bookmark } from "../lib/types";
import { originalLanguage, summarizeHits } from "../lib/wordStudy";
import { useLibrary } from "../state/library";
import { ImportCrossRefsDialog } from "./BibleDialogs";
import { CrossRefPanel, type Passage } from "./CrossRefPanel";
import { Icon } from "./Icon";
import { EmptyState } from "./ui";

/** Where to open a verse (or, with `to`, a passage) on the Bible screen. */
export interface VerseTarget { bibleId: string; book: number; chapter: number; verse: number; to?: number }

/** A request from another screen: search a word, or show the saved verses. */
export interface StudyRequest { word?: string; tab?: "books" | "saved"; nonce: number }

interface Props {
  active: boolean;
  /** The translation currently selected on the Bible screen */
  currentBibleId: string;
  onOpenInBible: (target: VerseTarget) => void;
  request?: StudyRequest | null;
  /** Presents a saved verse or passage. Word search results are for study and are never presented from here. */
  onPresent?: (spec: ScriptureSpec) => void;
}

/** Groups at or below this many verses start expanded; larger searches start with books collapsed. */
const EXPAND_ALL_UP_TO = 300;
/** Verses shown per book before "Show all". */
const PER_BOOK = 50;

const MODES: [MatchMode, string, string][] = [
  ["word", "Exact word", "Whole word only: grace, not graces or disgrace"],
  ["prefix", "Starts with", "Words that begin with it: grace, graces. Best for Malayalam word endings"],
  ["anywhere", "Anywhere", "Also inside longer words: grace, disgrace"],
];

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for webviews without clipboard permission.
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

/**
 * Word Study: find every verse where a word appears in the selected translation.
 * Bible study only: it never presents anything. Reuses the Bible search index, verse data and cross references.
 */
export function WordStudyWorkspace({ active, currentBibleId, onOpenInBible, request, onPresent }: Props) {
  const { library, update } = useLibrary();
  const [bibleId, setBibleId] = useState(currentBibleId);
  const [bible, setBible] = useState<BibleData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [mode, setMode] = useState<MatchMode>("word");
  const modeTouched = useRef(false);
  const [tab, setTab] = useState<"books" | "saved">("books");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [showAll, setShowAll] = useState<Set<number>>(new Set());
  const [xref, setXref] = useState<{ passage: Passage; reference: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [importXrefs, setImportXrefs] = useState(false);
  const groupRefs = useRef(new Map<number, HTMLElement>());
  const resultsRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Follow the translation selected on the Bible screen.
  useEffect(() => { if (currentBibleId) setBibleId(currentBibleId); }, [currentBibleId]);
  useEffect(() => {
    if (!library.bibles.some((b) => b.id === bibleId)) setBibleId(currentBibleId || library.bibles[0]?.id || "");
  }, [library.bibles, bibleId, currentBibleId]);

  const meta = library.bibles.find((b) => b.id === bibleId);
  const lang = bibleLang(meta);

  useEffect(() => {
    setBible(null);
    setLoadError(null);
    if (!bibleId) return;
    // Word Study counts every verse, which needs the whole text on this computer. Crossway's terms don't allow that for the ESV.
    if (bibleId === ESV_BIBLE_ID) return setLoadError("Word Study isn't available for the ESV, which is read online a chapter at a time. Choose another translation in the Translation menu.");
    loadBible(bibleId)
      .then((b) => {
        if (!b) return setLoadError("This Bible's file is missing. Import it again on the Bible screen.");
        setBible(b);
        setTimeout(() => searchBible(b, "a", { limit: 0 }), 300); // build the search index in the background
      })
      .catch((e) => setLoadError(String(e)));
  }, [bibleId]);

  // Another screen asked for a word to be studied, or for the saved verses.
  useEffect(() => {
    if (!request) return;
    if (request.word) { setQuery(request.word); setSubmitted(request.word.trim()); }
    setTab(request.tab ?? "books");
  }, [request?.nonce]);

  // Malayalam joins endings to words (കൃപ → കൃപയാൽ), so "Starts with" suits it better, unless the user chose a mode.
  useEffect(() => { if (!modeTouched.current) setMode(lang === "ml" ? "prefix" : "word"); }, [lang]);

  // ---- search: the same index and matching as the Bible screen's keyword search ----
  const result = useMemo(
    () => (bible && submitted.trim() ? searchBible(bible, submitted, { limit: Infinity, mode }) : null),
    [bible, submitted, mode],
  );
  const words = useMemo(() => searchWords(submitted), [submitted]);
  const canonical = bible?.books.length === 66;
  const summary = useMemo(() => (result && result.total ? summarizeHits(result.hits, canonical) : null), [result, canonical]);
  const groups = useMemo(() => {
    const byBook = new Map<number, SearchHit[]>();
    for (const h of result?.hits ?? []) {
      const list = byBook.get(h.bookIndex) ?? [];
      list.push(h);
      byBook.set(h.bookIndex, list);
    }
    return [...byBook.entries()].map(([book, hits]) => ({ book, hits }));
  }, [result]);

  // New results: expand every book for small searches, collapse for big ones.
  useEffect(() => {
    setExpanded(new Set(result && result.total <= EXPAND_ALL_UP_TO ? groups.map((g) => g.book) : []));
    setShowAll(new Set());
    resultsRef.current?.scrollTo({ top: 0 });
  }, [result]);

  const run = () => {
    const q = query.trim();
    setSubmitted(q);
    if (q) setTab("books");
  };

  const bookName = (i: number) => bible?.books[i]?.name ?? "";
  const refOf = (book: number, chapter: number, verse: number) => `${bookName(book)} ${chapter}:${verse}`;
  const verseText = (book: number, chapter: number, verse: number) => bible?.books[book]?.chapters[chapter - 1]?.[verse - 1] ?? "";

  const highlight = (text: string): ReactNode => {
    const ranges = matchRanges(text, words, mode);
    if (!ranges.length) return text;
    const out: ReactNode[] = [];
    let at = 0;
    ranges.forEach(([a, b], i) => {
      if (a > at) out.push(text.slice(at, a));
      out.push(<mark key={i}>{text.slice(a, b)}</mark>);
      at = b;
    });
    if (at < text.length) out.push(text.slice(at));
    return out;
  };

  // ---- actions (none of these present anything) ----
  const open = (book: number, chapter: number, verse: number) => { if (bibleId) onOpenInBible({ bibleId, book, chapter, verse }); };

  const copy = async (book: number, chapter: number, verse: number) => {
    const text = verseText(book, chapter, verse).trim();
    const key = `${book}.${chapter}.${verse}`;
    if (await copyText(`${text}\n— ${refOf(book, chapter, verse)}${meta ? ` (${meta.abbreviation})` : ""}`)) {
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1600);
    }
  };

  const bookmarkOf = (book: number, chapter: number, verse: number) => findBookmark(library.bookmarks, book, chapter, verse);
  const toggleBookmark = (book: number, chapter: number, verse: number) => {
    const existing = bookmarkOf(book, chapter, verse);
    if (existing) update((lib) => ({ ...lib, bookmarks: removeBookmark(lib.bookmarks, existing.id) }));
    else update((lib) => ({ ...lib, bookmarks: addBookmark(lib.bookmarks, { book, chapter, from: verse, translation: meta?.abbreviation ?? "" }) }));
  };
  const forget = (b: Bookmark) => update((lib) => ({ ...lib, bookmarks: removeBookmark(lib.bookmarks, b.id) }));
  const openSaved = (b: Bookmark) => { if (bibleId) onOpenInBible({ bibleId, book: b.book, chapter: b.chapter, verse: b.verse, to: lastVerse(b) }); };
  const presentSaved = (b: Bookmark) => {
    if (bibleId && onPresent) onPresent({ primaryId: bibleId, onScreen: "first", book: b.book, chapter: b.chapter, from: b.verse, to: lastVerse(b) });
  };

  const showXrefs = (book: number, chapter: number, verse: number) =>
    setXref({ passage: { book, chapter, from: verse, to: verse }, reference: refOf(book, chapter, verse) });
  const isXref = (book: number, chapter: number, verse: number) =>
    !!xref && xref.passage.book === book && xref.passage.chapter === chapter && xref.passage.from === verse;

  const jumpToBook = (book: number) => {
    setExpanded((s) => new Set(s).add(book));
    // Scroll only the results list, never the window around it.
    requestAnimationFrame(() => {
      const list = resultsRef.current, el = groupRefs.current.get(book);
      if (list && el) list.scrollTo({ top: el.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop - 4, behavior: "smooth" });
    });
  };

  const verseRow = (book: number, chapter: number, verse: number, text: string, extra?: ReactNode) => {
    const saved = !!bookmarkOf(book, chapter, verse);
    const ref = refOf(book, chapter, verse);
    return (
      <li key={`${book}.${chapter}.${verse}`} className={`ws-row ${isXref(book, chapter, verse) ? "on" : ""}`}>
        <button className="ws-open" onClick={() => open(book, chapter, verse)} title={`Open ${ref} in the Bible`}>
          <span className="ws-ref" lang={lang}>{ref}{extra}</span>
          <span className="ws-text" lang={lang}>{text ? highlight(text) : <em className="muted">Not in this translation</em>}</span>
        </button>
        <div className="ws-actions">
          <button className="btn ghost small" onClick={() => open(book, chapter, verse)}><Icon name="book" size={13} />Open in Bible</button>
          <button className="btn ghost small" onClick={() => copy(book, chapter, verse)} disabled={!text} aria-live="polite">
            <Icon name={copied === `${book}.${chapter}.${verse}` ? "check" : "copy"} size={13} />
            {copied === `${book}.${chapter}.${verse}` ? "Copied" : "Copy"}
          </button>
          <button className={`btn ghost small ${saved ? "saved" : ""}`} onClick={() => toggleBookmark(book, chapter, verse)} aria-pressed={saved}
            title={saved ? "Remove from saved verses" : "Save this verse"}>
            <Icon name="bookmark" size={13} />{saved ? "Saved" : "Save"}
          </button>
          <button className={`btn ghost small ${isXref(book, chapter, verse) ? "on-soft" : ""}`} onClick={() => showXrefs(book, chapter, verse)}>
            <Icon name="link" size={13} />Cross references
          </button>
        </div>
      </li>
    );
  };

  const bookmarks = [...library.bookmarks].sort((a, b) => b.savedAt - a.savedAt);

  return (
    <div className="workspace" style={{ display: active ? "contents" : "none" }}>
      <aside className="context">
        <div className="context-head">
          <h2 className="context-title">Word Study</h2>
          <div className="seg full" role="tablist" aria-label="Show">
            <button role="tab" aria-selected={tab === "books"} className={tab === "books" ? "on" : ""} onClick={() => setTab("books")}>Books</button>
            <button role="tab" aria-selected={tab === "saved"} className={tab === "saved" ? "on" : ""} onClick={() => setTab("saved")}>
              Saved{library.bookmarks.length ? ` · ${library.bookmarks.length}` : ""}
            </button>
          </div>
        </div>
        {tab === "books" ? (
          groups.length ? (
            <ul className="ws-books">
              {groups.map((g) => (
                <li key={g.book}>
                  <button onClick={() => jumpToBook(g.book)}>
                    <span lang={lang}>{bookName(g.book)}</span>
                    <span className="ws-count">{g.hits.length}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small pad">{submitted ? "No books to show." : "Books with matching verses will be listed here, with how many verses each has."}</p>
          )
        ) : bookmarks.length ? (
          <ul className="ws-books ws-saved" aria-label="Saved verses">
            {bookmarks.map((b) => {
              const label = bookmarkLabel(b, bible);
              const { verses, missing } = bookmarkVerses(bible, b);
              return (
                <li key={b.id}>
                  <button onClick={() => openSaved(b)} title={`Open ${label} in the Bible`}>
                    <span lang={lang}>{label}</span>
                    {bible && (verses.length ? (
                      <span className="ws-saved-text" lang={lang}>{verses.map((v) => v.text).join(" ")}</span>
                    ) : (
                      <em className="ws-saved-text">Not in {meta?.abbreviation ?? "this translation"}</em>
                    ))}
                    {bible && verses.length > 0 && missing && <em className="ws-saved-note">Some verses aren't in {meta?.abbreviation}</em>}
                  </button>
                  <div className="ws-saved-actions">
                    <button className="btn ghost small" onClick={() => openSaved(b)} aria-label={`Open ${label}`}><Icon name="book" size={13} />Open</button>
                    {onPresent && (
                      <button className="btn ghost small" onClick={() => presentSaved(b)} disabled={!verses.length} aria-label={`Present ${label}`}>
                        <Icon name="play" size={12} />Present
                      </button>
                    )}
                    <button className="btn ghost small" onClick={() => forget(b)} aria-label={`Remove ${label} from saved verses`} title="Remove from saved verses">
                      <Icon name="trash" size={13} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="muted small pad">No saved verses yet. Choose <strong>Save</strong> on a result here, or select verses on the Bible screen and choose <strong>Save</strong>.</p>
        )}
      </aside>

      <main className="work">
        {library.bibles.length === 0 ? (
          <div className="work-empty">
            <EmptyState title="Import a Bible first">
              <p>Word Study searches the Bible text stored in VerseLight. Import a Bible on the Bible screen, then come back here.</p>
            </EmptyState>
          </div>
        ) : (
          <>
            <div className="toolbar ws-toolbar">
              <div className="search">
                <Icon name="search" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && run()}
                  placeholder={lang === "ml" ? "Search a word, e.g. കൃപ" : "Search a word, e.g. grace"}
                  aria-label="Word to study"
                  lang={lang}
                  disabled={!bible}
                />
                {query && <button className="icon-btn sm" onClick={() => { setQuery(""); setSubmitted(""); inputRef.current?.focus(); }} aria-label="Clear"><Icon name="x" size={14} /></button>}
                <button className="btn small primary" onClick={run} disabled={!bible || !query.trim()}>Search</button>
              </div>
              <div className="ws-options">
                <div className="seg" role="radiogroup" aria-label="Match">
                  {MODES.map(([m, label, hint]) => (
                    <button key={m} role="radio" aria-checked={mode === m} className={mode === m ? "on" : ""} title={hint}
                      onClick={() => { modeTouched.current = true; setMode(m); }}>{label}</button>
                  ))}
                </div>
                <label className="inline-select">
                  <span className="muted small">Translation</span>
                  <select value={bibleId} onChange={(e) => setBibleId(e.target.value)} aria-label="Translation to search">
                    {library.bibles.map((b) => <option key={b.id} value={b.id}>{b.abbreviation} · {b.name}</option>)}
                  </select>
                </label>
              </div>
            </div>

            {loadError && <div className="alert">{loadError}</div>}

            <div className="bible-body">
              <div className="results ws-results" ref={resultsRef}>
                {!bible && !loadError ? (
                  <p className="muted pad">Opening {meta?.abbreviation ?? "Bible"}…</p>
                ) : !result ? (
                  <div className="work-empty">
                    <EmptyState title="Study a word">
                      <p>Search a word to see every verse where it appears in {meta?.abbreviation}, grouped by book. Everything is searched on this computer, so it works offline.</p>
                    </EmptyState>
                  </div>
                ) : result.total === 0 ? (
                  <div className="ws-none">
                    <p>No verses contain “{submitted}” in {meta?.abbreviation}.</p>
                    {mode !== "anywhere" && (
                      <p className="muted small">Try <button className="linklike" onClick={() => { modeTouched.current = true; setMode(mode === "word" ? "prefix" : "anywhere"); }}>
                        {mode === "word" ? "Starts with" : "Anywhere"}</button> to include other forms of the word.</p>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="ws-summary" role="status">
                      <strong>Found {result.occurrences.toLocaleString()} {result.occurrences === 1 ? "occurrence" : "occurrences"}</strong>
                      <span className="muted">
                        {" "}of “<span lang={lang}>{submitted}</span>” in {result.total.toLocaleString()} {result.total === 1 ? "verse" : "verses"},
                        {" "}{groups.length} {groups.length === 1 ? "book" : "books"} · {meta?.abbreviation}
                      </span>
                      {groups.length > 1 && (
                        <span className="ws-expand">
                          <button className="linklike" onClick={() => setExpanded(new Set(groups.map((g) => g.book)))}>Expand all</button>
                          <button className="linklike" onClick={() => setExpanded(new Set())}>Collapse all</button>
                        </span>
                      )}
                    </div>
                    {summary && (
                      <dl className="ws-facts" aria-label="Word facts">
                        {canonical && <div><dt>Old Testament</dt><dd>{summary.oldTestament.toLocaleString()} {summary.oldTestament === 1 ? "verse" : "verses"}</dd></div>}
                        {canonical && <div><dt>New Testament</dt><dd>{summary.newTestament.toLocaleString()} {summary.newTestament === 1 ? "verse" : "verses"}</dd></div>}
                        {summary.topBook && groups.length > 1 && (
                          <div><dt>Most often in</dt><dd><button className="linklike" onClick={() => jumpToBook(summary.topBook!.book)} lang={lang}>{bookName(summary.topBook.book)}</button> ({summary.topBook.verses})</dd></div>
                        )}
                        {summary.first && (
                          <div><dt>First</dt><dd><button className="linklike" lang={lang} onClick={() => open(summary.first!.bookIndex, summary.first!.chapter, summary.first!.verse)}>
                            {refOf(summary.first.bookIndex, summary.first.chapter, summary.first.verse)}</button></dd></div>
                        )}
                        {summary.last && summary.verses > 1 && (
                          <div><dt>Last</dt><dd><button className="linklike" lang={lang} onClick={() => open(summary.last!.bookIndex, summary.last!.chapter, summary.last!.verse)}>
                            {refOf(summary.last.bookIndex, summary.last.chapter, summary.last.verse)}</button></dd></div>
                        )}
                      </dl>
                    )}
                    <OriginalLanguage word={submitted} />
                    {groups.map((g) => {
                      const open = expanded.has(g.book);
                      const all = showAll.has(g.book);
                      const hits = all ? g.hits : g.hits.slice(0, PER_BOOK);
                      return (
                        <section key={g.book} className="ws-group" ref={(el) => { if (el) groupRefs.current.set(g.book, el); else groupRefs.current.delete(g.book); }}>
                          <h3>
                            <button onClick={() => setExpanded((s) => { const n = new Set(s); if (n.has(g.book)) n.delete(g.book); else n.add(g.book); return n; })} aria-expanded={open}>
                              <Icon name={open ? "down" : "next"} size={14} />
                              <span lang={lang}>{bookName(g.book)}</span>
                              <span className="ws-count">{g.hits.length} {g.hits.length === 1 ? "verse" : "verses"}</span>
                            </button>
                          </h3>
                          {open && (
                            <ol className="ws-list">
                              {hits.map((h) => verseRow(h.bookIndex, h.chapter, h.verse, h.text,
                                h.occurrences > words.length ? <span className="ws-times">×{h.occurrences}</span> : undefined))}
                              {g.hits.length > hits.length && (
                                <li className="ws-more">
                                  <button className="btn ghost small" onClick={() => setShowAll((s) => new Set(s).add(g.book))}>
                                    Show all {g.hits.length} verses in <span lang={lang}>{bookName(g.book)}</span>
                                  </button>
                                </li>
                              )}
                            </ol>
                          )}
                        </section>
                      );
                    })}
                  </>
                )}
              </div>
              {xref && (
                <CrossRefPanel
                  passage={xref.passage}
                  reference={xref.reference}
                  bible={bible}
                  meta={meta}
                  onOpen={(start) => { const a = splitId(start); open(a.book, a.chapter, a.verse); }}
                  onImport={() => setImportXrefs(true)}
                  onClose={() => setXref(null)}
                />
              )}
            </div>
          </>
        )}
      </main>
      {importXrefs && <ImportCrossRefsDialog onClose={() => setImportXrefs(false)} onImported={() => setImportXrefs(false)} />}
    </div>
  );
}

/**
 * Hebrew and Greek information for a word, when a lexical dataset is installed. VerseLight doesn't include one,
 * so this says so plainly rather than showing guessed words, Strong's numbers or definitions.
 */
function OriginalLanguage({ word }: { word: string }) {
  const { available, entries } = originalLanguage(word);
  if (!available) {
    return (
      <p className="ws-original muted small" role="note">
        <Icon name="info" size={14} />
        <span><strong>Hebrew and Greek:</strong> not available. No original-language data (Hebrew or Greek words, transliterations,
          Strong's numbers or definitions) is installed, so the counts above come from the translation's own words.</span>
      </p>
    );
  }
  if (!entries.length) return <p className="ws-original muted small" role="note"><Icon name="info" size={14} /><span>No Hebrew or Greek entry for “{word}”.</span></p>;
  return (
    <section className="ws-lexicon" aria-label="Hebrew and Greek">
      <h3>Hebrew and Greek</h3>
      <ul>
        {entries.map((e) => (
          <li key={`${e.strongs}-${e.lemma}`}>
            <span className="ws-lemma" lang={e.language === "greek" ? "grc" : "hbo"}>{e.lemma}</span>
            <span className="ws-translit">{e.transliteration}</span>
            <span className="ws-strongs">{e.strongs}</span>
            <span className="ws-def">{e.definition}</span>
            <span className="ws-src">{e.source}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
