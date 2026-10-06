import { useEffect, useMemo, useRef, useState } from "react";
import { newId } from "../lib/id";
import { nextLabel, parseLyrics, songOrder } from "../lib/lyrics";
import { songSlidesAll } from "../lib/slides";
import { songLanguage, songMatches, songRank } from "../lib/malayalam";
import type { Slide, Song, SongLanguage, Theme } from "../lib/types";

const collator = new Intl.Collator(["ml", "en"], { sensitivity: "base", numeric: true });
import { useLibrary } from "../state/library";
import { Icon } from "./Icon";
import { SlideRenderer } from "./SlideRenderer";
import { EmptyState } from "./ui";

interface Props {
  active: boolean;
  themeFor: (slide: Slide) => Theme;
  onPresent: (song: Song, fromSlideKey?: string) => void;
  /** Changes when Home asks for the search box to be ready for typing */
  focusSearch?: number;
  /** A song Home asked to open */
  openSong?: { id: string; nonce: number } | null;
}

export function SongsWorkspace({ active, themeFor, onPresent, focusSearch, openSong }: Props) {
  const { library, update } = useLibrary();
  const songs = library.items.filter((i): i is Song => i.kind === "song");
  const [selectedId, setSelectedId] = useState<string | null>(songs[0]?.id ?? null);
  const [query, setQuery] = useState("");
  const [lang, setLang] = useState<"all" | SongLanguage>("all");
  const [view, setView] = useState<"all" | "fav" | "recent">("all");
  const song = songs.find((s) => s.id === selectedId) ?? null;
  const searchRef = useRef<HTMLInputElement>(null);

  // Home's "Find a song": the search box, ready for typing.
  useEffect(() => {
    if (focusSearch) requestAnimationFrame(() => searchRef.current?.focus());
  }, [focusSearch]);

  // Home's recently used songs: open that song, clearing any filter that would hide it in the list.
  useEffect(() => {
    if (!openSong) return;
    setSelectedId(openSong.id);
    setQuery("");
    setView("all");
    setLang("all");
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
  };

  const remove = (id: string) => {
    update((lib) => ({
      ...lib,
      items: lib.items.filter((i) => i.id !== id),
      services: lib.services.map((sv) => ({ ...sv, itemIds: sv.itemIds.filter((x) => x !== id) })),
    }));
    setSelectedId(null);
  };

  return (
    <div className="workspace" style={{ display: active ? "contents" : "none" }}>
      <aside className="context">
        <div className="context-head">
          <div className="search compact">
            <Icon name="search" />
            <input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search songs · പാട്ട് തിരയുക" aria-label="Search songs" />
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
          <button className="btn wide" onClick={create}><Icon name="plus" />{lang === "ml" ? "New Malayalam song" : "New song"}</button>
        </div>
        <ul className="song-list">
          {filtered.map((s) => (
            <li key={s.id} className="song-row">
              <button className={s.id === selectedId ? "on" : ""} onClick={() => setSelectedId(s.id)}>
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
          {filtered.length === 0 && (
            <li className="muted small pad">
              {query ? `No songs match “${query}”.`
                : view === "fav" ? "No favorites yet. Tap the star on a song to keep it here."
                : view === "recent" ? "Songs you present or add to a presentation will appear here."
                : lang === "ml" ? "No Malayalam songs yet. Add one with New Malayalam song, or import OpenLyrics files in Settings → Songs."
                : "No songs yet."}
            </li>
          )}
        </ul>
      </aside>

      <main className="work">
        {song ? (
          <SongEditor key={song.id} song={song} themeFor={themeFor} onChange={save}
            onDelete={() => remove(song.id)} onPresent={(from) => onPresent(song, from)} />
        ) : (
          <div className="work-empty">
            <EmptyState title="Pick a song or write a new one">
              <p>Paste lyrics with section tags like [Verse 1], [Chorus] and [Bridge], and VerseLight builds the slides for you.</p>
              <button className="btn primary" onClick={create}><Icon name="plus" />New song</button>
            </EmptyState>
          </div>
        )}
      </main>
    </div>
  );
}

function SongEditor({ song, themeFor, onChange, onDelete, onPresent }: {
  song: Song; themeFor: (slide: Slide) => Theme; onChange: (s: Song) => void; onDelete: () => void;
  /** Present the song, optionally starting at one slide */
  onPresent: (fromSlideKey?: string) => void;
}) {
  const set = (patch: Partial<Song>) => onChange({ ...song, ...patch });
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { sections } = parseLyrics(song.lyrics);
  const order = songOrder(song);
  const slides = songSlidesAll(song);
  const shown = slides.filter((s) => !s.hidden).length;
  const groups = order.map((label, occ) => ({ label, occ, slides: slides.filter((s) => s.occ === occ) }));

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
          <button className="btn present" onClick={() => onPresent()} disabled={shown === 0} title="Show it on the projector now">
            <Icon name="play" size={14} />Present Now
          </button>
        </div>
      </header>
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
            <h2>Slides <span className="muted">{shown}</span></h2>
            <label className="inline-select">
              <span className="muted small">Lines per slide</span>
              <select value={song.linesPerSlide} onChange={(e) => set({ linesPerSlide: Number(e.target.value) })}>
                <option value={0}>Auto</option>
                {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          </div>

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
                      <button className="icon-btn sm" onClick={() => setOrder(order.filter((_, j) => j !== i))} aria-label={`Remove ${g.label} from order`}><Icon name="x" size={15} /></button>
                    </span>
                  </div>
                  <div className="arr-slides">
                    {g.slides.map((s) => (
                      <div key={s.key} className="mini-wrap">
                        <button className={`mini ${s.hidden ? "off" : ""}`} onClick={() => toggle(s.sourceKey)}
                          aria-pressed={!s.hidden} title={s.hidden ? "Include this slide" : "Leave this slide out"}>
                          <SlideRenderer slide={s} theme={themeFor(s)} />
                          {s.hidden && <span className="mini-off"><Icon name="eyeOff" size={16} /></span>}
                        </button>
                        {!s.hidden && (
                          <button className="mini-present" onClick={() => onPresent(s.key)} aria-label={`Present from ${s.label}`} title="Present from this slide">
                            <Icon name="play" size={11} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </li>
              ))}
            </ol>
          )}

          {sections.size > 0 && (
            <div className="arr-add">
              <span className="muted small">Add to order</span>
              {[...sections.keys()].map((l) => (
                <button key={l} className="tag-btn" onClick={() => setOrder([...order, l])}><Icon name="plus" size={14} />{l}</button>
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
