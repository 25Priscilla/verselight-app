import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { loadBible, type BibleData } from "../lib/bible";
import { on, send, type NavCommand } from "../lib/bridge";
import { closePresentation, listDisplays, openPresentation, type DisplayInfo } from "../lib/display";
import { lookForSlide } from "../lib/looks";
import { chapterSlides, initialSession, neighbourChapter, sessionReducer, sessionSlides, verseKey, type ScriptureSpec } from "../lib/session";
import { saveFileAs } from "../lib/storage";
import type { Library, LiveState, Slide, Song } from "../lib/types";
import { useLibrary } from "../state/library";
import { BackgroundsWorkspace } from "./BackgroundsWorkspace";
import { BibleWorkspace, type OpenVerseRequest } from "./BibleWorkspace";
import { Icon } from "./Icon";
import { PresentationPanel, type ProjectorStatus } from "./PresentationPanel";
import { Rail, type Mode } from "./Rail";
import { SongImportDialog } from "./SongImportDialog";
import { SongsWorkspace } from "./SongsWorkspace";
import { WordStudyWorkspace, type VerseTarget } from "./WordStudyWorkspace";

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && !!el.closest("input:not([type=checkbox]):not([type=radio]):not([type=range]), textarea, select, [contenteditable]");

export function ControlApp() {
  const { library, update, replace, saveError } = useLibrary();
  const [mode, setMode] = useState<Mode>(library.bibles.length ? "bible" : "songs");
  const [notice, setNotice] = useState<string | null>(null);
  const [songImport, setSongImport] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  // ---- Word Study ↔ Bible: which translation is being read, and "open this verse" requests ----
  const [readingBibleId, setReadingBibleId] = useState(library.bibles[0]?.id ?? "");
  const [openRequest, setOpenRequest] = useState<OpenVerseRequest | null>(null);
  const openInBible = useCallback((t: VerseTarget) => {
    setOpenRequest({ ...t, nonce: Date.now() });
    setMode("bible");
  }, []);

  // ---- the presentation session: the single source of truth for what is shown ----
  const [state, dispatch] = useReducer(sessionReducer, initialSession);
  const songs = useMemo(() => new Map(library.items.filter((i): i is Song => i.kind === "song").map((s) => [s.id, s])), [library.items]);
  const slides = useMemo(() => sessionSlides(state.session, songs), [state.session, songs]);
  const index = Math.min(state.index, Math.max(0, slides.length - 1));
  const liveSlide: Slide | null = slides[index] ?? null;

  // Projector window: "off" → "opening" (window requested) → "live" (window reported back).
  const [projector, setProjector] = useState<ProjectorStatus>("off");
  const [displayName, setDisplayName] = useState("");
  const [displays, setDisplays] = useState<DisplayInfo[]>([]);

  const liveState: LiveState = useMemo(
    () => ({ slide: liveSlide, theme: lookForSlide(library, liveSlide).theme, blackout: state.blackout, clear: state.clear }),
    [liveSlide, library, state.blackout, state.clear],
  );
  // The projector draws exactly what the laptop preview draws: the same slide, look and black state.
  const stateRef = useRef(liveState);
  stateRef.current = liveState;
  useEffect(() => { send("live-state", liveState); }, [liveState]);
  useEffect(() => on("request-state", () => { setProjector((p) => (p === "off" ? p : "live")); send("live-state", stateRef.current); }), []);
  useEffect(() => on("presentation-closed", () => setProjector("off")), []);

  const refreshDisplays = useCallback(() => { listDisplays().then(setDisplays).catch(() => setDisplays([])); }, []);
  useEffect(refreshDisplays, [refreshDisplays]);

  const openProjector = useCallback(async () => {
    setProjector("opening");
    try {
      const name = await openPresentation(library.displayIndex);
      setDisplayName(name || "");
      // In a plain browser there is no handshake from a separate window yet; the popup reports back on load.
    } catch (e) {
      setProjector("off");
      setNotice(`The projector window didn't open: ${e}`);
    }
  }, [library.displayIndex]);

  const stopPresenting = useCallback(async () => {
    await closePresentation().catch(() => undefined);
    setProjector("off");
  }, []);

  // ---- Bible data for scripture sessions ----
  const bibleSources = useCallback(async (spec: ScriptureSpec) => {
    const [primary, second] = await Promise.all([loadBible(spec.primaryId), spec.secondId ? loadBible(spec.secondId) : Promise.resolve(null)]);
    if (!primary) throw new Error("the Bible file is missing");
    const meta = library.bibles.find((b) => b.id === spec.primaryId)!;
    const meta2 = spec.secondId ? library.bibles.find((b) => b.id === spec.secondId) ?? null : null;
    return { primary, second: second as BibleData | null, meta, meta2 };
  }, [library.bibles]);

  /** ▶ Present Now: build the session, show the first slide and open the projector if it isn't open. */
  const presentScripture = useCallback(async (spec: ScriptureSpec) => {
    try {
      const src = await bibleSources(spec);
      const chapter = chapterSlides(spec, spec.chapter, src);
      if (chapter.length === 0) return setNotice("That chapter has no verses in this translation.");
      // Start at the first selected verse (or the next one this translation has).
      let start = chapter.findIndex((sl) => sl.key === verseKey(spec.book, spec.chapter, spec.from));
      if (start < 0) start = Math.max(0, chapter.findIndex((sl) => Number(sl.key.split(".").pop()) >= spec.from));
      dispatch({ type: "start", session: { kind: "scripture", spec, chapters: [spec.chapter], slides: chapter }, index: start });
      (document.activeElement as HTMLElement | null)?.blur();
      if (projector === "off") await openProjector();
    } catch (e) {
      setNotice(`The passage couldn't be presented: ${e instanceof Error ? e.message : e}`);
    }
  }, [bibleSources, projector, openProjector]);

  const presentSong = useCallback(async (song: Song, fromSlideKey?: string) => {
    update((lib) => ({ ...lib, items: lib.items.map((i) => (i.id === song.id && i.kind === "song" ? { ...i, lastUsedAt: Date.now() } : i)) }));
    const list = sessionSlides({ kind: "song", songId: song.id }, new Map([[song.id, song]]));
    if (list.length === 0) return setNotice("This song has no slides yet. Add some lyrics first.");
    const start = fromSlideKey ? Math.max(0, list.findIndex((sl) => sl.key === fromSlideKey)) : 0;
    dispatch({ type: "start", session: { kind: "song", songId: song.id }, index: start });
    (document.activeElement as HTMLElement | null)?.blur();
    if (projector === "off") await openProjector();
  }, [update, projector, openProjector]);

  /** Next / Previous: one slide at a time; a Bible session loads the neighbouring chapter at either end. */
  const loading = useRef(false);
  const nav = useCallback(async (delta: number) => {
    const session = state.session;
    if (!session || loading.current) return;
    if (session.kind === "scripture") {
      const src = await bibleSources(session.spec).catch(() => null);
      const chaptersInBook = src?.primary.books[session.spec.book]?.chapters.length ?? 0;
      const n = neighbourChapter(session, index, slides.length, delta, chaptersInBook);
      if (n && src) {
        loading.current = true;
        try {
          dispatch({ type: "extend", where: n.where, chapter: n.chapter, slides: chapterSlides(session.spec, n.chapter, src), advance: true });
        } finally {
          loading.current = false;
        }
        return;
      }
    }
    dispatch({ type: "step", delta, count: slides.length });
  }, [state.session, index, slides.length, bibleSources]);

  const gotoSlide = useCallback((i: number) => dispatch({ type: "goto", index: i, count: slides.length }), [slides.length]);

  const handleNav = useCallback((cmd: NavCommand) => {
    if (cmd === "next") nav(1);
    else if (cmd === "prev") nav(-1);
    else if (cmd === "blackout") dispatch({ type: "blackout" });
    else if (cmd === "clear") dispatch({ type: "clear" });
    else if (cmd === "exit") stopPresenting();
  }, [nav, stopPresenting]);

  // Keys pressed while the projector window has focus arrive here too.
  const navRef = useRef(handleNav);
  navRef.current = handleNav;
  useEffect(() => on("nav", (cmd) => navRef.current(cmd)), []);

  // Operator keyboard. Capture phase, so it works wherever focus is (except while typing), and a
  // focused button can't also react to Space or Enter.
  useEffect(() => {
    const map: Record<string, NavCommand> = {
      " ": "next", ArrowRight: "next", ArrowDown: "next", PageDown: "next",
      ArrowLeft: "prev", ArrowUp: "prev", PageUp: "prev",
      b: "blackout", B: "blackout", ".": "blackout",
      Escape: "exit",
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || document.querySelector(".modal")) return;
      if (isTyping(e.target)) {
        // Esc leaves a text field first, so the next Esc (or arrow) controls the presentation.
        if (e.key === "Escape") (e.target as HTMLElement).blur();
        return;
      }
      const cmd = map[e.key];
      if (!cmd) return;
      if (cmd === "exit" && projector === "off") return;
      if (cmd !== "exit" && !state.session) return;
      e.preventDefault();
      e.stopPropagation();
      handleNav(cmd);
    };
    const swallowKeyUp = (e: KeyboardEvent) => {
      if ((e.key === " " || e.key === "Enter") && state.session && !isTyping(e.target) && e.target instanceof HTMLButtonElement) e.preventDefault();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", swallowKeyUp, true);
    return () => { window.removeEventListener("keydown", onKey, true); window.removeEventListener("keyup", swallowKeyUp, true); };
  }, [handleNav, projector, state.session]);

  const sessionTitle = !state.session ? "" : state.session.kind === "song"
    ? songs.get(state.session.songId)?.title || "Song"
    : (() => { const sp = state.session.spec; const first = slides.find((x) => x.key === verseKey(sp.book, sp.chapter, sp.from)); return first?.label.replace(/:\d+$/, "") ?? "Bible"; })();
  const selectionKeys = useMemo(() => {
    if (state.session?.kind !== "scripture") return new Set<string>();
    const sp = state.session.spec;
    return new Set(Array.from({ length: sp.to - sp.from + 1 }, (_, i) => verseKey(sp.book, sp.chapter, sp.from + i)));
  }, [state.session]);
  const canExtend = state.session?.kind === "scripture";

  // ---- backup ----
  const backup = async () => {
    setMenuOpen(false);
    const date = new Date().toISOString().slice(0, 10);
    const ok = await saveFileAs(`verselight-backup-${date}.json`, JSON.stringify(library, null, 2)).catch(() => false);
    if (ok) setNotice("Library backed up.");
  };
  const restore = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as Library;
      if (!Array.isArray(parsed.items) || !Array.isArray(parsed.services)) throw new Error("it isn't a VerseLight backup");
      replace(parsed);
      dispatch({ type: "end" });
      setNotice("Library restored. On a new computer, import your Bibles again.");
    } catch (e) {
      setNotice(`${file.name} couldn't be restored: ${e instanceof Error ? e.message : e}`);
    }
  };

  // ---- looks ----
  const lookFor = useCallback((slide: Slide | null) => lookForSlide(library, slide), [library]);
  const themeFor = useCallback((slide: Slide | null) => lookForSlide(library, slide).theme, [library]);
  const assignLook = (level: "slides" | "items", key: string, lookId: string | null) =>
    update((lib) => {
      const map = { ...lib.assign[level] };
      if (lookId) map[key] = lookId;
      else delete map[key];
      return { ...lib, assign: { ...lib.assign, [level]: map } };
    });

  return (
    <div className="app">
      <Rail mode={mode} onMode={setMode} />
      <div className="rail-foot">
        <button className="icon-btn" onClick={() => setMenuOpen((o) => !o)} aria-label="Library menu" aria-expanded={menuOpen} title="Import songs and back up">
          <Icon name="more" />
        </button>
        {menuOpen && (
          <div className="menu" role="menu">
            <button role="menuitem" onClick={() => { setMenuOpen(false); setSongImport(true); }}>Import songs…</button>
            <button role="menuitem" onClick={backup}>Back up library…</button>
            <button role="menuitem" onClick={() => { setMenuOpen(false); importRef.current?.click(); }}>Restore from backup…</button>
          </div>
        )}
        <input ref={importRef} type="file" accept=".json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) restore(f); e.target.value = ""; }} />
      </div>

      {songImport && (
        <SongImportDialog
          onClose={() => setSongImport(false)}
          onImported={(n) => { setMode("songs"); setNotice(`Imported ${n} songs.`); }}
        />
      )}

      <BibleWorkspace active={mode === "bible"} onPresent={presentScripture} onTranslation={setReadingBibleId} openRequest={openRequest} />
      <WordStudyWorkspace active={mode === "study"} currentBibleId={readingBibleId} onOpenInBible={openInBible} />
      <SongsWorkspace active={mode === "songs"} themeFor={themeFor} onPresent={presentSong} />
      <BackgroundsWorkspace active={mode === "backgrounds"} liveSample={liveSlide} />

      <PresentationPanel
        title={sessionTitle}
        kind={state.session?.kind ?? null}
        slides={slides}
        index={index}
        selectionKeys={selectionKeys}
        canExtend={canExtend}
        blackout={state.blackout}
        projector={projector}
        displayName={displayName}
        displays={displays}
        displayIndex={library.displayIndex}
        onGoto={gotoSlide}
        onPrev={() => nav(-1)}
        onNext={() => nav(1)}
        onBlackout={() => dispatch({ type: "blackout" })}
        onStart={openProjector}
        onStop={stopPresenting}
        onEnd={() => { stopPresenting(); dispatch({ type: "end" }); }}
        onDisplay={(i) => update((lib) => ({ ...lib, displayIndex: i }))}
        onRefreshDisplays={refreshDisplays}
        theme={library.theme}
        onTheme={(t) => update((lib) => ({ ...lib, theme: t }))}
        lookFor={lookFor}
        looks={library.looks}
        slideLook={(key) => library.assign.slides[key] ?? null}
        onSlideLook={(key, lookId) => assignLook("slides", key, lookId)}
        onOpenBackgrounds={() => setMode("backgrounds")}
      />

      {(notice || saveError) && (
        <div className="toast" role="status">
          <span>{saveError ?? notice}</span>
          {!saveError && <button className="icon-btn sm" onClick={() => setNotice(null)} aria-label="Dismiss"><Icon name="x" size={14} /></button>}
        </div>
      )}
    </div>
  );
}
