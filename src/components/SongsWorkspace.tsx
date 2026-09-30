import { useEffect, useMemo, useRef, useState } from "react";
import { newId } from "../lib/id";
import { nextLabel, parseLyrics, songOrder, unusedSections } from "../lib/lyrics";
import { songSlidesAll } from "../lib/slides";
import { songLanguage, songMatches, songRank } from "../lib/malayalam";
import { findDuplicateSong } from "../lib/songImport";
import type { Slide, Song, SongLanguage, Theme } from "../lib/types";
import { useLibrary } from "../state/library";
import { Icon } from "./Icon";
import { SlideRenderer } from "./SlideRenderer";
import { SongImportDialog } from "./SongImportDialog";
import { Button, EmptyState, cx } from "./ui";

const collator = new Intl.Collator(["ml", "en"], { sensitivity: "base", numeric: true });

interface Props {
  active: boolean;
  themeFor: (slide: Slide) => Theme;
  onPresent: (song: Song, fromSlideKey?: string) => void;
  /** Changes when Home asks for the search box to be ready for typing */
  focusSearch?: number;
  /** A song Home asked to open */
  openSong?: { id: string; nonce: number } | null;
  /** The slide on the projector, when a song is being presented */
  liveKey: string | null;
  notify: (message: string) => void;
}

export function SongsWorkspace({ active, themeFor, onPresent, focusSearch, openSong, liveKey, notify }: Props) {
  const { library, update } = useLibrary();
  const songs = library.items.filter((i): i is Song => i.kind === "song");
  const [selectedId, setSelectedId] = useState<string | null>(songs[0]?.id ?? null);
  const [query, setQuery] = useState("");
  const [lang, setLang] = useState<"all" | SongLanguage>("all");
  const [view, setView] = useState<"all" | "fav" | "recent">("all");
  const [importing, setImporting] = useState(false);
  const song = songs.find((s) => s.id === selectedId) ?? null;
  const searchRef = useRef<HTMLInputElement>(null);

  // Home's "Find a song": the search box, ready for typing.
  useEffect(() => {
    if (focusSearch) requestAnimationFrame(() => searchRef.current?.focus());
  }, [focusSearch]);

  // Open a song, clearing any filter that would hide it in the list.
  const show = (id: string) => {
    setSelectedId(id);
    setQuery("");
    setView("all");
    setLang("all");
  };
  // Home's recently used songs.
  useEffect(() => {
    if (openSong) show(openSong.id);
  }, [openSong?.nonce]);

  const filtered = useMemo(() => {
    let list = songs.filter((s) => lang === "all" || songLanguage(s) === lang);
    if (view === "fav") list = list.filter((s) => s.favorite);
    if (view === "recent") list = list.filter((s) => s.lastUsedAt);
    if (query.trim()) list = list.filter((s) => songMatches(s, query));
    if (view === "recent") return list.sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0)).slice(0, 50);
    return list.sort((a, b) => (query.trim() ? songRank(a, query) - songRank(b, query) : 0) || collator.compare(a.title, b.title));
  }, [songs, query, lang, view]);

  const toggleFavorite = (s: Song) => save({ ...s, favorite: !s.favorite });
  const counts = useMemo(() => ({
    en: songs.filter((s) => songLanguage(s) === "en").length,
    ml: songs.filter((s) => songLanguage(s) === "ml").length,
  }), [songs]);

  const save = (s: Song) =>
    update((lib) => ({ ...lib, items: lib.items.map((i) => (i.id === s.id ? { ...s, updatedAt: Date.now() } : i)) }));

  const create = () => {
    const s: Song = {
      kind: "song", id: newId(), title: "", artist: "", copyright: "", ccli: "",
      language: lang === "ml" ? "ml" : "en", altTitle: "",
      lyrics: "[Verse 1]\n", linesPerSlide: 0, arrangement: [], hidden: [], updatedAt: Date.now(),
    };
    update((lib) => ({ ...lib, items: [...lib.items, s] }));
    setSelectedId(s.id);
    setQuery("");
    setView("all");
  };

  // Deleting a song also forgets the backgrounds chosen for it and its slides.
  const remove = (id: string) => {
    update((lib) => {
      const items = { ...lib.assign.items };
      delete items[id];
      const slides = Object.fromEntries(Object.entries(lib.assign.slides).filter(([k]) => !k.startsWith(`${id}/`)));
      return {
        ...lib,
        items: lib.items.filter((i) => i.id !== id),
        services: lib.services.map((sv) => ({ ...sv, itemIds: sv.itemIds.filter((x) => x !== id) })),
        assign: { ...lib.assign, items, slides },
      };
    });
    setSelectedId(null);
  };

  const imported = (count: number, firstId: string) => {
    notify(`Imported ${count} ${count === 1 ? "song" : "songs"}.`);
    show(firstId);
  };

  return (
    <div className="workspace" style={{ display: active ? "contents" : "none" }}>
      <aside className="context">
        <div className="context-head">
          <div className="search compact">
            <Icon name="search" />
            <input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search songs · പാട്ട് തിരയുക" aria-label="Search songs"
              onKeyDown={(e) => { if (e.key === "Enter" && filtered[0]) setSelectedId(filtered[0].id); }} title="Type a title or some words, then press Enter to open the first song" />
            {query && <button className="icon-btn" onClick={() => setQuery("")} aria-label="Clear search"><Icon name="x" size={14} /></button>}
          </div>
          <div className="seg lang-seg" role="radiogroup" aria-label="Language">
            <button role="radio" aria-checked={lang === "all"} className={lang === "all" ? "on" : ""} onClick={() => setLang("all")}>All</button>
            <button role="radio" aria-checked={lang === "en"} className={lang === "en" ? "on" : ""} onClick={() => setLang("en")} title={`${counts.en} English songs`}>English</button>
            <button role="radio" aria-checked={lang === "ml"} className={lang === "ml" ? "on" : ""} onClick={() => setLang("ml")} title={`${counts.ml} Malayalam songs`} lang="ml">മലയാളം</button>
          </div>
          <div className="view-tabs" role="tablist" aria-label="Show">
            <button role="tab" aria-selected={view === "all"} className={view === "all" ? "on" : ""} onClick={() => setView("all")}>All songs</button>
            <button role="tab" aria-selected={view === "fav"} className={view === "fav" ? "on" : ""} onClick={() => setView("fav")}><Icon name="star" size={13} />Favorites</button>
            <button role="tab" aria-selected={view === "recent"} className={view === "recent" ? "on" : ""} onClick={() => setView("recent")}><Icon name="clock" size={13} />Recent</button>
          </div>
          <div className="song-new">
            <button className="btn" onClick={create}><Icon name="plus" />{lang === "ml" ? "New Malayalam song" : "New song"}</button>
            <Button variant="quiet" icon="upload" onClick={() => setImporting(true)} title="Add songs from OpenLyrics (.xml) or VerseLight (.json) files">Import</Button>
          </div>
          <div className="song-count muted small" aria-live="polite">
            {query || view !== "all" || lang !== "all"
              ? `${filtered.length} of ${songs.length} ${songs.length === 1 ? "song" : "songs"}`
              : `${songs.length} ${songs.length === 1 ? "song" : "songs"}`}
          </div>
        </div>
        <ul className="song-list">
          {filtered.map((s) => (
            <li key={s.id} className="song-row">
              <button className={s.id === selectedId ? "on" : ""} onClick={() => setSelectedId(s.id)} aria-current={s.id === selectedId ? "true" : undefined}>
                <span className="song-title" lang={songLanguage(s)}>{s.title || s.altTitle || "Untitled song"}</span>
                <span className="song-artist">{[s.title && s.altTitle, s.artist].filter(Boolean).join(" · ") || "No artist"}</span>
              </button>
              <button className={`row-star ${s.favorite ? "on" : ""}`} onClick={() => toggleFavorite(s)}
                aria-label={s.favorite ? `Remove ${s.title} from favorites` : `Add ${s.title} to favorites`} aria-pressed={!!s.favorite}
                title={s.favorite ? "Favorite" : "Add to favorites"}>
                <Icon name="star" size={13} />
              </button>
              <button className="row-present" onClick={() => { setSelectedId(s.id); onPresent(s); }}
                aria-label={`Present ${s.title || "song"}`} title="Present now">
                <Icon name="play" size={12} />
              </button>
            </li>
          ))}
          {filtered.length === 0 && songs.length > 0 && (
            <li className="muted small pad">
              {query ? <>No songs match “{query}”. Try fewer words, or part of a line from the song. <button className="linklike" onClick={() => setQuery("")}>Show all songs</button></>
                : view === "fav" ? "No favorites yet. Tap the star on a song to keep it here."
                : view === "recent" ? "Songs you present will appear here."
                : lang === "ml" ? "No Malayalam songs yet. Add one with New Malayalam song, or import OpenLyrics files."
                : "No English songs yet."}
            </li>
          )}
          {songs.length === 0 && (
            <li className="muted small pad">Your song library is empty. Write a song or import song files to get started.</li>
          )}
        </ul>
      </aside>

      <main className="work">
        {song ? (
          <SongEditor key={song.id} song={song} themeFor={themeFor} onChange={save} liveKey={liveKey}
            duplicate={findDuplicateSong(song, library.items) ?? null} onOpen={show}
            onDelete={() => remove(song.id)} onPresent={(from) => onPresent(song, from)} />
        ) : songs.length === 0 ? (
          <div className="work-empty">
            <EmptyState icon="music" title="Add your first song"
              action={<div className="empty-actions">
                <Button variant="primary" icon="plus" onClick={create}>Write a song</Button>
                <Button icon="upload" onClick={() => setImporting(true)}>Import song files</Button>
              </div>}>
              <ol className="empty-steps">
                <li><strong>Write a song:</strong> type or paste the words. Put a tag like <code>[Verse 1]</code>, <code>[Chorus]</code> or <code>[Bridge]</code> above each part.</li>
                <li><strong>Or import:</strong> add OpenLyrics files (<code>.xml</code>, from OpenLP and other worship software) or VerseLight song files (<code>.json</code>).</li>
                <li>Each part becomes its own slide, ready to present.</li>
              </ol>
            </EmptyState>
          </div>
        ) : (
          <div className="work-empty">
            <EmptyState icon="music" title="Pick a song or write a new one"
              action={<Button variant="primary" icon="plus" onClick={create}>New song</Button>}>
              <p>Search on the left by title or by words from the song, then click it to see its slides.</p>
            </EmptyState>
          </div>
        )}
      </main>
      {importing && <SongImportDialog onClose={() => setImporting(false)} onImported={imported} />}
    </div>
  );
}

function SongEditor({ song, themeFor, onChange, onDelete, onPresent, liveKey, duplicate, onOpen }: {
  song: Song; themeFor: (slide: Slide) => Theme; onChange: (s: Song) => void; onDelete: () => void;
  /** Present the song, optionally starting at one slide */
  onPresent: (fromSlideKey?: string) => void;
  /** The slide on the projector, if any */
  liveKey: string | null;
  /** Another song with the same title and writer */
  duplicate: Song | null;
  onOpen: (songId: string) => void;
}) {
  const set = (patch: Partial<Song>) => onChange({ ...song, ...patch });
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { sections, duplicates } = parseLyrics(song.lyrics);
  const order = songOrder(song);
  const slides = songSlidesAll(song);
  const shown = slides.filter((s) => !s.hidden).length;
  const groups = order.map((label, occ) => ({ label, occ, slides: slides.filter((s) => s.occ === occ) }));
  const unused = unusedSections(song);
  const isLive = !!liveKey && slides.some((s) => s.key === liveKey);

  const insertTag = (base: string) => {
    const ta = textRef.current;
    const label = nextLabel(song.lyrics, base);
    const pos = ta ? ta.selectionEnd : song.lyrics.length;
    const before = song.lyrics.slice(0, pos).replace(/\s*$/, "");
    const after = song.lyrics.slice(pos).replace(/^\s*/, "");
    const tag = `${before ? "\n\n" : ""}[${label}]\n`;
    const next = before + tag + (after ? `\n\n${after}` : "");
    set({ lyrics: next });
    requestAnimationFrame(() => {
      if (!ta) return;
      const caret = (before + tag).length;
      ta.focus();
      ta.setSelectionRange(caret, caret);
    });
  };

  const setOrder = (labels: string[]) => set({ arrangement: labels });
  const move = (from: number, to: number) => {
    const next = [...order];
    const [l] = next.splice(from, 1);
    next.splice(to, 0, l);
    setOrder(next);
  };
  const toggle = (key: string) =>
    set({ hidden: song.hidden.includes(key) ? song.hidden.filter((k) => k !== key) : [...song.hidden, key] });
  // Left-out slides are remembered by their part number, which changes meaning when the split changes.
  const setLinesPerSlide = (n: number) => set({ linesPerSlide: n, hidden: [] });

  return (
    <div className="song-editor">
      <header className="song-head">
        <div className="song-names">
          <input className="song-title-input" lang={songLanguage(song)} value={song.title} placeholder={songLanguage(song) === "ml" ? "പാട്ടിന്റെ പേര് (Song title)" : "Song title"} onChange={(e) => set({ title: e.target.value })} aria-label="Song title" />
          <input className="song-alt-input" value={song.altTitle ?? ""} placeholder="English or transliterated title (optional)"
            onChange={(e) => set({ altTitle: e.target.value })} aria-label="English or transliterated title" />
          <input className="song-artist-input" value={song.artist} placeholder="Artist or writer" onChange={(e) => set({ artist: e.target.value })} aria-label="Artist" />
        </div>
        <div className="song-actions">
          <div className="seg" role="radiogroup" aria-label="Song language">
            <button role="radio" aria-checked={songLanguage(song) === "en"} className={songLanguage(song) === "en" ? "on" : ""} onClick={() => set({ language: "en" })}>EN</button>
            <button role="radio" aria-checked={songLanguage(song) === "ml"} className={songLanguage(song) === "ml" ? "on" : ""} onClick={() => set({ language: "ml" })} lang="ml">മല</button>
          </div>
          <button className={`icon-btn ${song.favorite ? "star-on" : ""}`} onClick={() => set({ favorite: !song.favorite })}
            aria-pressed={!!song.favorite} aria-label={song.favorite ? "Remove from favorites" : "Add to favorites"} title={song.favorite ? "Favorite" : "Add to favorites"}>
            <Icon name="star" />
          </button>
          {confirmDelete ? (
            <>
              <button className="btn ghost small" onClick={() => setConfirmDelete(false)}>Keep</button>
              <button className="btn danger-solid small" onClick={onDelete}>Delete song</button>
            </>
          ) : (
            <button className="icon-btn" onClick={() => setConfirmDelete(true)} aria-label="Delete song" title="Delete song"><Icon name="trash" /></button>
          )}
          <button className="btn present" onClick={() => onPresent()} disabled={shown === 0}
            title={shown === 0 ? "Add some lyrics, or include at least one slide, to present this song" : "Show it on the projector now, from the first slide"}>
            <Icon name="play" size={14} />Present Now
          </button>
        </div>
      </header>
      {duplicate && (
        <p className="song-note" role="status">
          <Icon name="info" size={15} />
          <span>Another song in your library has the same title and writer: <strong lang={songLanguage(duplicate)}>{duplicate.title}</strong>.{" "}
            <button className="linklike" onClick={() => onOpen(duplicate.id)}>Open it</button> to compare, or change this title so they're easy to tell apart.</span>
        </p>
      )}
      <div className="credits">
        <input value={song.copyright} placeholder="Copyright" onChange={(e) => set({ copyright: e.target.value })} aria-label="Copyright" />
        <input value={song.ccli} placeholder="CCLI song number" onChange={(e) => set({ ccli: e.target.value })} aria-label="CCLI song number" />
      </div>

      <div className="song-body">
        <section className="lyrics-pane">
          <div className="pane-head">
            <h2>Lyrics</h2>
            <div className="tag-buttons">
              {["Verse", "Chorus", "Bridge", "Pre-Chorus", "Tag", "Ending"].map((t) => (
                <button key={t} className="tag-btn" onClick={() => insertTag(t)}><Icon name="plus" size={14} />{t}</button>
              ))}
            </div>
          </div>
          <textarea lang={songLanguage(song)}
            ref={textRef}
            className="lyrics"
            value={song.lyrics}
            onChange={(e) => set({ lyrics: e.target.value })}
            spellCheck
            placeholder={"[Verse 1]\nFirst line\nSecond line\n\n[Chorus]\n…"}
            aria-label="Lyrics"
          />
          <p className="muted small">
            Put each section tag on its own line. A blank line starts a new slide; a tag with nothing under it repeats that section.
            Enter only lyrics your church is licensed to project.
          </p>
        </section>

        <section className="slides-pane">
          <div className="pane-head">
            <h2>Slides <span className="muted" aria-label={`${shown} of ${slides.length} slides will be shown`}>{shown === slides.length ? shown : `${shown} of ${slides.length}`}</span></h2>
            <label className="inline-select">
              <span className="muted small">Lines per slide</span>
              <select value={song.linesPerSlide} onChange={(e) => setLinesPerSlide(Number(e.target.value))}>
                <option value={0}>Auto</option>
                {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          </div>

          {groups.length > 0 && (
            <p className="muted small slides-hint">
              Slides are shown in this order. Drag a section or use the arrows to move it. Click a slide to leave it out
              (every time that part is sung); click it again to put it back.
            </p>
          )}
          {duplicates.length > 0 && (
            <p className="song-note">
              <Icon name="info" size={15} />
              <span>{duplicates.map((d) => `[${d}]`).join(", ")} {duplicates.length === 1 ? "is" : "are each"} written out more than once, so only the first one's words are used.
                Give the other one a new name, such as <strong>[{nextLabel(song.lyrics, duplicates[0].replace(/\s*\d+$/, ""))}]</strong>.</span>
            </p>
          )}
          {unused.length > 0 && (
            <p className="song-note">
              <Icon name="info" size={15} />
              <span>Not in the order, so not shown: <strong>{unused.join(", ")}</strong>. Add {unused.length === 1 ? "it" : "them"} below, or choose Use written order.</span>
            </p>
          )}
          {groups.length === 0 ? (
            <p className="muted small">Slides appear here as you type lyrics.</p>
          ) : (
            <ol className="arrangement">
              {groups.map((g, i) => (
                <li
                  key={`${g.label}-${g.occ}`}
                  className={`arr-group ${dragFrom === i ? "dragging" : ""} ${dragOver === i && dragFrom !== i ? "drop" : ""}`}
                  onDragOver={(e) => { if (dragFrom !== null) { e.preventDefault(); setDragOver(i); } }}
                  onDrop={(e) => { e.preventDefault(); if (dragFrom !== null && dragFrom !== i) move(dragFrom, i); setDragFrom(null); setDragOver(null); }}
                >
                  <div
                    className="arr-head"
                    draggable
                    onDragStart={(e) => { setDragFrom(i); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", g.label); }}
                    onDragEnd={() => { setDragFrom(null); setDragOver(null); }}
                  >
                    <span className="grip" aria-hidden><Icon name="grip" size={16} /></span>
                    <span className="arr-label">{g.label}</span>
                    <span className="arr-tools">
                      <button className="icon-btn sm" disabled={i === 0} onClick={() => move(i, i - 1)} aria-label={`Move ${g.label} up`}><Icon name="up" size={15} /></button>
                      <button className="icon-btn sm" disabled={i === groups.length - 1} onClick={() => move(i, i + 1)} aria-label={`Move ${g.label} down`}><Icon name="down" size={15} /></button>
                      <button className="icon-btn sm" disabled={groups.length === 1} onClick={() => setOrder(order.filter((_, j) => j !== i))}
                        aria-label={`Remove ${g.label} from order`} title={groups.length === 1 ? "A song needs at least one section" : "Remove from the order (the words stay in the lyrics)"}><Icon name="x" size={15} /></button>
                    </span>
                  </div>
                  <div className="arr-slides">
                    {g.slides.map((s) => {
                      const now = isLive && s.key === liveKey;
                      return (
                        <div key={s.key} className={cx("mini-wrap", now && "now")}>
                          <button className={cx("mini", s.hidden && "off")} onClick={() => toggle(s.sourceKey)}
                            aria-pressed={!s.hidden} aria-label={`${s.label}: ${s.hidden ? "left out. Click to include it" : "included. Click to leave it out"}`}
                            title={s.hidden ? "Include this slide" : "Leave this slide out"}>
                            <SlideRenderer slide={s} theme={themeFor(s)} />
                            {s.hidden && <span className="mini-off"><Icon name="eyeOff" size={16} /><span>Left out</span></span>}
                            {now && <span className="now-badge" aria-hidden>Now</span>}
                          </button>
                          {!s.hidden && (
                            <button className="mini-present" onClick={() => onPresent(s.key)} aria-label={`Present from ${s.label}`} title="Present from this slide">
                              <Icon name="play" size={11} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </li>
              ))}
            </ol>
          )}

          {sections.size > 0 && (
            <div className="arr-add">
              <span className="muted small">Add to order</span>
              {[...sections.keys()].map((l) => (
                <button key={l} className={cx("tag-btn", unused.includes(l) && "unused")} onClick={() => setOrder([...order, l])}
                  title={`Add ${l} to the end of the order`}><Icon name="plus" size={14} />{l}</button>
              ))}
              {song.arrangement.length > 0 && (
                <button className="btn ghost small" onClick={() => setOrder([])}>Use written order</button>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
