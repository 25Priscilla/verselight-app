import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { loadBible, matchRanges, searchWords, type MatchMode } from "../lib/bible";
import { BIBLE_MATCH, globalSearch, snippetPlace, type BibleResult, type BibleSource } from "../lib/globalSearch";
import { languageName } from "../lib/languages";
import { songLanguage, songLanguages } from "../lib/malayalam";
import type { Song } from "../lib/types";
import { useLibrary } from "../state/library";
import { Icon } from "./Icon";
import { cx } from "./ui";

interface Props {
  /** The sidebar shows icons only: the box opens from a search button */
  compact: boolean;
  /** The translation being read on the Bible screen; its verses come first */
  readingBibleId: string;
  onOpenVerse: (r: BibleResult) => void;
  onOpenSong: (id: string) => void;
  /** Every verse with these words, in Bible Study */
  onStudyWord: (word: string) => void;
}

/** How long typing pauses before searching, so a long Bible isn't searched on every key */
export const SEARCH_DELAY_MS = 120;
const PANEL_W = 480;

/** The matched parts of `text` in <mark>, using the same matching as the search itself. */
function Highlight({ text, words, mode }: { text: string; words: string[]; mode: MatchMode }) {
  const ranges = matchRanges(text, words, mode);
  if (!ranges.length) return <>{text}</>;
  const out: ReactNode[] = [];
  let at = 0;
  ranges.forEach(([a, z], i) => {
    if (a > at) out.push(text.slice(at, a));
    out.push(<mark key={i}>{text.slice(a, z)}</mark>);
    at = z;
  });
  out.push(text.slice(at));
  return <>{out}</>;
}

/**
 * Global Quick Search (Ctrl+K): Bible references, Bible words, song titles, lyrics and translations in one box.
 * It sits in the sidebar, so it is there on every screen; the results open the verse or song on its own screen,
 * where Present Now works as usual. Keys typed here never reach the presentation controls.
 */
export function GlobalSearch({ compact, readingBibleId, onOpenVerse, onOpenSong, onStudyWord }: Props) {
  const { library } = useLibrary();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState("");
  const [active, setActive] = useState(0);
  const [sources, setSources] = useState<BibleSource[]>([]);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  /** Where focus was before Ctrl+K, to go back to on Esc */
  const returnTo = useRef<HTMLElement | null>(null);

  const songs = useMemo(() => library.items.filter((i): i is Song => i.kind === "song"), [library.items]);

  // The Bibles, the one being read first. loadBible keeps them in memory, so this is quick after the first time.
  useEffect(() => {
    if (!open) return;
    let live = true;
    const order = [...library.bibles].sort((a, b) => Number(b.id === readingBibleId) - Number(a.id === readingBibleId));
    Promise.all(order.map(async (meta) => ({ meta, data: await loadBible(meta.id).catch(() => null) })))
      .then((list) => { if (live) setSources(list.filter((s): s is BibleSource => !!s.data)); });
    return () => { live = false; };
  }, [open, library.bibles, readingBibleId]);

  useEffect(() => {
    const t = window.setTimeout(() => setSearched(query), SEARCH_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [query]);

  const results = useMemo(() => globalSearch(searched, sources, songs), [searched, sources, songs]);
  const options = useMemo(() => [
    ...results.bible.map((r) => ({ id: `gs-b-${r.book}-${r.chapter}-${r.verse}-${r.reference ? "r" : "w"}`, choose: () => onOpenVerse(r) })),
    ...results.songs.map((r) => ({ id: `gs-s-${r.song.id}`, choose: () => onOpenSong(r.song.id) })),
  ], [results, onOpenVerse, onOpenSong]);
  useEffect(() => setActive(0), [results]);

  // The results float beside the sidebar: under the box, or next to the search button when the sidebar is icons only.
  const place = () => {
    const r = rootRef.current?.getBoundingClientRect();
    if (!r) return;
    const left = compact ? r.right + 8 : r.left;
    setPos({ top: compact ? r.top : r.bottom + 6, left: Math.max(8, Math.min(left, window.innerWidth - PANEL_W - 16)) });
  };

  /** Set by Ctrl+K and the search button; the box is focused as soon as it is on screen */
  const wantFocus = useRef(false);
  /** Ctrl+K or the search button: open and focus the box, remembering where focus was for Esc. */
  const show = () => {
    if (!rootRef.current?.contains(document.activeElement)) returnTo.current = document.activeElement as HTMLElement | null;
    wantFocus.current = true;
    // Focus at once when the box is already there (the full sidebar), so nothing typed straight after Ctrl+K is lost.
    if (inputRef.current) { inputRef.current.focus(); inputRef.current.select(); wantFocus.current = false; }
    setOpen(true);
  };
  // Placed after rendering, so it follows the sidebar switching between full and icons only while open.
  // In the icons-only sidebar the box appears with the results and is focused here.
  useLayoutEffect(() => {
    if (!open) return;
    place();
    if (wantFocus.current && inputRef.current) { inputRef.current.focus(); inputRef.current.select(); wantFocus.current = false; }
  }, [open, compact]);
  const close = (restoreFocus: boolean) => {
    setOpen(false);
    const back = returnTo.current;
    returnTo.current = null;
    if (!restoreFocus) return;
    if (back && back !== document.body && document.contains(back)) back.focus();
    else inputRef.current?.blur();
  };
  /** Opens a result. Focus leaves the box, so Enter (present the verses) and the presentation keys work straight away. */
  const openResult = (go: () => void) => {
    setOpen(false);
    returnTo.current = null;
    inputRef.current?.blur();
    go();
  };
  const choose = (i: number) => { const o = options[i]; if (o) openResult(o.choose); };

  // Ctrl+K (⌘K on a Mac) from anywhere, except while a dialog is open.
  const showRef = useRef(show);
  showRef.current = show;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== "k") return;
      if (document.querySelector(".modal")) return;
      e.preventDefault();
      e.stopPropagation();
      showRef.current();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  // A click anywhere else closes the results.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!rootRef.current?.contains(t) && !document.querySelector(".gsearch-panel")?.contains(t)) close(false);
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("resize", place);
    return () => { window.removeEventListener("pointerdown", onDown); window.removeEventListener("resize", place); };
  }, [open, compact]);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(true); return; }
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) { setOpen(true); return; }
    if (e.key === "ArrowDown" && options.length) { e.preventDefault(); setActive((a) => (a + 1) % options.length); }
    else if (e.key === "ArrowUp" && options.length) { e.preventDefault(); setActive((a) => (a - 1 + options.length) % options.length); }
    else if (e.key === "Enter") {
      e.preventDefault();
      // Enter straight after typing opens the first result for what was typed, even before the short pause has passed.
      if (searched !== query) {
        const now = globalSearch(query, sources, songs);
        setSearched(query);
        const verse = now.bible[0], song = now.songs[0]?.song;
        if (verse) openResult(() => onOpenVerse(verse));
        else if (song) openResult(() => onOpenSong(song.id));
        return;
      }
      choose(active);
    }
  };

  const input = (
    <div className={cx("search", "compact", "gsearch-box")}>
      <Icon name="search" size={15} />
      <input ref={inputRef} value={query} placeholder="Search Bible, songs..." aria-label="Search Bible and songs"
        role="combobox" aria-expanded={open} aria-controls="gsearch-results" aria-autocomplete="list"
        aria-activedescendant={open && options[active] ? options[active].id : undefined}
        onChange={(e) => { setQuery(e.target.value); if (!open) setOpen(true); }}
        onFocus={() => { if (!open) setOpen(true); }}
        onBlur={(e) => { if (open && !rootRef.current?.contains(e.relatedTarget as Node) && !document.querySelector(".gsearch-panel")?.contains(e.relatedTarget as Node)) setOpen(false); }}
        onKeyDown={onKeyDown} spellCheck={false} autoComplete="off" />
      {query ? (
        <button className="icon-btn sm" aria-label="Clear search" onMouseDown={(e) => e.preventDefault()}
          onClick={() => { setQuery(""); setSearched(""); inputRef.current?.focus(); }}><Icon name="x" size={13} /></button>
      ) : !compact && <kbd className="gsearch-kbd" aria-hidden>Ctrl K</kbd>}
    </div>
  );

  const words = searchWords(results.query);
  const typed = query.trim().length > 0;
  const pending = typed && query !== searched;
  const keywordHits = results.bible.filter((r) => !r.reference).length;
  const optionProps = (i: number) => ({
    id: options[i]?.id, role: "option", "aria-selected": i === active, className: cx("gsearch-option", i === active && "on"),
    onMouseDown: (e: ReactMouseEvent) => e.preventDefault(),
    onMouseMove: () => { if (active !== i) setActive(i); },
    onClick: () => choose(i),
  } as const);

  return (
    <div className={cx("gsearch", compact && "is-compact")} ref={rootRef}>
      {compact ? (
        <button className="nav-item gsearch-icon" onClick={() => (open ? close(true) : show())} title="Search Bible and songs (Ctrl+K)"
          aria-label="Search Bible and songs" aria-expanded={open}>
          <Icon name="search" size={20} />
        </button>
      ) : input}

      {open && (
        <div className="gsearch-panel" style={{ top: pos.top, left: pos.left }} onMouseDown={(e) => { if (e.target !== inputRef.current) e.preventDefault(); }}>
          {compact && <div className="gsearch-panel-head">{input}</div>}
          <div id="gsearch-results" role="listbox" aria-label="Search results" className="gsearch-results">
            {!typed ? (
              <div className="gsearch-empty">
                <p className="gsearch-empty-title">Search Bible verses, references, songs or lyrics</p>
                <p className="muted small">Try <em>John 3:16</em>, <em>Psalm 23</em>, <em>grace</em>, a song title or a line from a song, in any language.</p>
              </div>
            ) : !pending && results.bible.length === 0 && results.songs.length === 0 ? (
              <div className="gsearch-empty" role="status">
                <p className="gsearch-empty-title">No results found</p>
                <p className="muted small">
                  {library.bibles.length === 0 && songs.length === 0 ? "Import a Bible or add songs to search them here."
                    : "Check the spelling, try fewer words, or a reference like John 3:16."}
                </p>
              </div>
            ) : (
              <>
                {results.bible.length > 0 && (
                  <div role="group" aria-labelledby="gsearch-bible" className="gsearch-group">
                    <h3 id="gsearch-bible" className="gsearch-group-title"><Icon name="book" size={14} />Bible</h3>
                    {results.bible.map((r, i) => (
                      <div key={options[i]?.id} {...optionProps(i)}>
                        <span className="gsearch-line">
                          <span className="gsearch-ref" lang={r.lang}>{r.label}</span>
                          <span className="gsearch-tag">{r.translation}</span>
                        </span>
                        <span className="gsearch-text" lang={r.lang}>
                          {r.reference ? r.text : <Highlight text={r.text} words={words} mode={BIBLE_MATCH} />}
                        </span>
                      </div>
                    ))}
                    {keywordHits > 0 && results.bibleTotal > keywordHits && (
                      <button className="linklike gsearch-more" onMouseDown={(e) => e.preventDefault()}
                        onClick={() => openResult(() => onStudyWord(results.query))}>
                        See all {results.bibleTotal} verses in Bible Study
                      </button>
                    )}
                  </div>
                )}
                {results.songs.length > 0 && (
                  <div role="group" aria-labelledby="gsearch-songs" className="gsearch-group">
                    <h3 id="gsearch-songs" className="gsearch-group-title"><Icon name="music" size={14} />Songs</h3>
                    {results.songs.map(({ song, snippet }, j) => (
                      <div key={song.id} {...optionProps(results.bible.length + j)}>
                        <span className="gsearch-line">
                          <span className="gsearch-title" lang={songLanguage(song)}>
                            <Highlight text={song.title || song.altTitle || "Untitled song"} words={words} mode="anywhere" />
                          </span>
                          <span className="gsearch-tag">{songLanguages(song).map(languageName).join(" + ")}</span>
                        </span>
                        {song.title && song.altTitle && <span className="gsearch-sub">{song.altTitle}</span>}
                        {snippet && (
                          <span className="gsearch-text gsearch-snippet">
                            <span className="gsearch-place">{snippetPlace(snippet)}</span>
                            <span lang={snippet.lang}><Highlight text={snippet.text} words={words} mode="anywhere" /></span>
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {pending && results.bible.length === 0 && results.songs.length === 0 && <p className="muted small gsearch-wait">Searching…</p>}
              </>
            )}
          </div>
          <div className="gsearch-foot muted" aria-hidden>
            <span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span><span><kbd>Esc</kbd> close</span>
          </div>
        </div>
      )}
    </div>
  );
}
