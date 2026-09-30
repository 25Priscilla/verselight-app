import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { loadBible, type BibleData } from "../lib/bible";
import { on, send, type NavCommand } from "../lib/bridge";
import { canChooseDisplays, closePresentation, listDisplays, openPresentation, type DisplayInfo } from "../lib/display";
import { chooseDisplay, displayConnected, displayLabel, sameDisplays } from "../lib/projector";
import { liveKeyAction } from "../lib/liveKeys";
import { lookForSlide } from "../lib/looks";
import { atEdge, chapterNeighbours, chapterSlides, followSlide, initialSession, neighbourChapter, sessionReducer, sessionSlides, verseKey, type ScriptureSpec } from "../lib/session";
import { saveFileAs } from "../lib/storage";
import type { Library, LiveState, Slide, Song } from "../lib/types";
import { useLibrary } from "../state/library";
import { BackgroundsWorkspace } from "./BackgroundsWorkspace";
import { BibleWorkspace, type OpenVerseRequest } from "./BibleWorkspace";
import { HelpScreen } from "./HelpScreen";
import { HomeScreen } from "./HomeScreen";
import { PresentationPanel, type ProjectorStatus } from "./PresentationPanel";
import { SettingsScreen, type SettingsSection } from "./SettingsScreen";
import { Sidebar, type Mode } from "./Sidebar";
import { SongsWorkspace } from "./SongsWorkspace";
import { ConfirmDialog, Toast, cx } from "./ui";
import { WordStudyWorkspace, type StudyRequest, type VerseTarget } from "./WordStudyWorkspace";

function useMediaQuery(query: string) {
  const [match, setMatch] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const mq = matchMedia(query);
    const on = () => setMatch(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return match;
}

/** How often screens are checked while presenting (to notice an unplugged projector) */
export const DISPLAY_POLL_MS = 2000;
/** How long the projector window has to load and report back before it is given up on */
export const PROJECTOR_TIMEOUT_MS = 15000;

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && !!el.closest("input:not([type=checkbox]):not([type=radio]):not([type=range]), textarea, select, [contenteditable]");

export function ControlApp() {
  const { library, update, replace, saveError } = useLibrary();
  const [mode, setMode] = useState<Mode>("home");
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("projector");
  const [notice, setNotice] = useState<string | null>(null);

  // ---- Word Study ↔ Bible: which translation is being read, and "open this verse" requests ----
  const [readingBibleId, setReadingBibleId] = useState(library.bibles[0]?.id ?? "");
  const [openRequest, setOpenRequest] = useState<OpenVerseRequest | null>(null);
  const openInBible = useCallback((t: VerseTarget) => {
    setOpenRequest({ ...t, nonce: Date.now() });
    setMode("bible");
  }, []);
  // Bible → Bible Study: study a word from a keyword search, or see the saved verses.
  const [studyRequest, setStudyRequest] = useState<StudyRequest | null>(null);
  const openStudy = useCallback((r: Omit<StudyRequest, "nonce">) => {
    setStudyRequest({ ...r, nonce: Date.now() });
    setMode("study");
  }, []);

  // ---- Home's shortcuts into the Bible and Songs screens ----
  const [bibleSearch, setBibleSearch] = useState(0);
  const [songSearch, setSongSearch] = useState(0);
  const [openSong, setOpenSong] = useState<{ id: string; nonce: number } | null>(null);
  const openSettings = (section: SettingsSection) => { setSettingsSection(section); setMode("settings"); };

  // ---- the presentation session: the single source of truth for what is shown ----
  const [state, dispatch] = useReducer(sessionReducer, initialSession);
  const songs = useMemo(() => new Map(library.items.filter((i): i is Song => i.kind === "song").map((s) => [s.id, s])), [library.items]);
  const slides = useMemo(() => sessionSlides(state.session, songs), [state.session, songs]);
  const index = Math.min(state.index, Math.max(0, slides.length - 1));
  const liveSlide: Slide | null = slides[index] ?? null;

  // When the song on screen is edited (a section moved, a slide left out), stay on the same words
  // rather than on the same slide number. Only reacts to the slides changing within one session.
  const lastLive = useRef<{ session: typeof state.session; slides: Slide[]; key: string | null }>({ session: null, slides: [], key: null });
  useEffect(() => {
    const last = lastLive.current;
    const moved = last.session === state.session && last.slides !== slides ? followSlide(last.key, slides, index) : null;
    if (moved !== null) {
      lastLive.current = { session: state.session, slides, key: last.key };
      dispatch({ type: "follow", index: moved });
      return;
    }
    lastLive.current = { session: state.session, slides, key: liveSlide?.key ?? null };
  }, [state.session, slides, index, liveSlide]);

  // Projector window: "off" → "opening" (window requested) → "live" (window reported back).
  const [projector, setProjector] = useState<ProjectorStatus>("off");
  const [displayName, setDisplayName] = useState("");
  const [displays, setDisplays] = useState<DisplayInfo[]>([]);
  /** Why the projector isn't showing the slides, while that is still true (no second screen, screen unplugged, …) */
  const [projectorProblem, setProjectorProblem] = useState<string | null>(null);
  /** The screen the projector window is on, so unplugging it can be noticed */
  const liveDisplay = useRef<DisplayInfo | null>(null);

  const liveState: LiveState = useMemo(
    () => ({ slide: liveSlide, theme: lookForSlide(library, liveSlide).theme, blackout: state.blackout, clear: state.clear }),
    [liveSlide, library, state.blackout, state.clear],
  );
  // The projector draws exactly what the laptop preview draws: the same slide, look and black state.
  const stateRef = useRef(liveState);
  stateRef.current = liveState;
  useEffect(() => { send("live-state", liveState); }, [liveState]);
  useEffect(() => on("request-state", () => { setProjector((p) => (p === "off" ? p : "live")); send("live-state", stateRef.current); }), []);
  // The projector window was closed some other way (e.g. Alt+F4 on the projector): the place is kept.
  useEffect(() => on("presentation-closed", () => { liveDisplay.current = null; setProjector("off"); }), []);

  const fetchDisplays = useCallback(async () => {
    const list = await listDisplays().catch(() => [] as DisplayInfo[]);
    setDisplays((old) => (sameDisplays(old, list) ? old : list));
    return list;
  }, []);
  const refreshDisplays = useCallback(() => { void fetchDisplays(); }, [fetchDisplays]);
  useEffect(refreshDisplays, [refreshDisplays]);

  // After the control window is reloaded the session is gone, so a projector window left open from before is stale.
  useEffect(() => { if (canChooseDisplays()) closePresentation().catch(() => undefined); }, []);

  /**
   * Start presenting: open the projector window on the chosen screen. Only one open runs at a time, and it is
   * skipped while the window is already open, so repeated presses never make a second projector window.
   */
  const opening = useRef(false);
  const projectorRef = useRef(projector);
  projectorRef.current = projector;
  /** Bumped by Stop, so a window that finishes opening after Stop is closed again */
  const generation = useRef(0);
  const choice = useMemo(() => ({ id: library.displayId ?? null, index: library.displayIndex }), [library.displayId, library.displayIndex]);
  const openProjector = useCallback(async () => {
    if (opening.current || projectorRef.current !== "off") return;
    opening.current = true;
    const gen = generation.current;
    setProjector("opening");
    try {
      let target: DisplayInfo | null = null;
      if (canChooseDisplays()) {
        const pick = chooseDisplay(await fetchDisplays(), choice);
        if (!pick.ok) {
          setProjector("off");
          setProjectorProblem(pick.message);
          setNotice(pick.message);
          return;
        }
        target = pick.display;
      }
      await openPresentation(target);
      if (gen !== generation.current) { await closePresentation().catch(() => undefined); return; }
      liveDisplay.current = target;
      setDisplayName(target ? displayLabel(target) : "browser window");
      setProjectorProblem(null);
      // The projector window reports back (request-state) once it has loaded; that turns the status to Live.
    } catch (e) {
      setProjector("off");
      const message = `The projector window couldn't be opened: ${e instanceof Error ? e.message : e}`;
      setProjectorProblem(message);
      setNotice(message);
    } finally {
      opening.current = false;
    }
  }, [choice, fetchDisplays]);

  const stopPresenting = useCallback(async () => {
    generation.current++;
    liveDisplay.current = null;
    setProjector("off");
    await closePresentation().catch(() => undefined);
  }, []);

  // A projector window that never reports back (it failed to load) is closed rather than left "Connecting…" forever.
  useEffect(() => {
    if (projector !== "opening") return;
    const t = window.setTimeout(() => {
      if (projectorRef.current !== "opening") return;
      void stopPresenting();
      const message = "The projector window didn't respond, so it was closed. Choose Start presenting to try again.";
      setProjectorProblem(message);
      setNotice(message);
    }, PROJECTOR_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, [projector, stopPresenting]);

  // Screens come and go (a cable is unplugged, a wireless display drops). While presenting, and while choosing a
  // screen in Settings, check the list regularly. If the projector's screen disappears, close its window before
  // Windows moves it over the operator's screen, and keep the place so Start presenting carries on.
  const watchDisplays = canChooseDisplays() && (projector !== "off" || !!state.session || mode === "settings");
  useEffect(() => {
    if (!watchDisplays) return;
    const t = window.setInterval(async () => {
      const list = await fetchDisplays();
      const on = liveDisplay.current;
      if (on && projectorRef.current !== "off" && !displayConnected(list, on.id)) {
        void stopPresenting();
        const message = `${displayLabel(on)} was disconnected, so the projector was turned off. Your place is kept: reconnect the projector and choose Start presenting.`;
        setProjectorProblem(message);
        setNotice(message);
      }
    }, DISPLAY_POLL_MS);
    return () => window.clearInterval(t);
  }, [watchDisplays, fetchDisplays, stopPresenting]);

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
      const chaptersInBook = src.primary.books[spec.book]?.chapters.length ?? spec.chapter;
      const bookName = chapter[0].label.replace(/ \d+:\d+$/, "");
      dispatch({ type: "start", session: { kind: "scripture", spec, chapters: [spec.chapter], slides: chapter, bookName, chaptersInBook }, index: start });
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

  /**
   * Next / Previous: one slide at a time. Inside the loaded slides this is immediate; only at an end of a Bible
   * session does it wait to load the neighbouring chapter (and ignores presses until that chapter is in).
   */
  const loading = useRef(false);
  const nav = useCallback(async (delta: number) => {
    const session = state.session;
    if (!session || loading.current) return;
    const n = session.kind === "scripture" && atEdge(index, slides.length, delta)
      ? neighbourChapter(session, index, slides.length, delta, session.chaptersInBook) : null;
    if (session.kind === "scripture" && n) {
      loading.current = true;
      try {
        const src = await bibleSources(session.spec);
        return dispatch({ type: "extend", where: n.where, chapter: n.chapter, slides: chapterSlides(session.spec, n.chapter, src), advance: true });
      } catch {
        return setNotice("The next chapter couldn't be loaded: the Bible file is missing.");
      } finally {
        loading.current = false;
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
    const onKey = (e: KeyboardEvent) => {
      const action = liveKeyAction(e, {
        typing: isTyping(e.target),
        modal: !!document.querySelector(".modal"),
        // An open menu (such as a slide's background menu) handles its own keys: Esc closes it and nothing else.
        menu: !!document.querySelector(".look-picker, .menu, .popover"),
        session: !!state.session,
        projectorOn: projector !== "off",
      });
      if (!action) return;
      // Esc leaves a text field first, so the next Esc (or arrow) controls the presentation.
      if (action === "blur") return (e.target as HTMLElement).blur();
      e.preventDefault();
      e.stopPropagation();
      handleNav(action);
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
  const neighbours = useMemo(() => chapterNeighbours(state.session), [state.session]);

  // The presentation panel only appears while something is loaded or the projector is on; the rest of the
  // time the workspace gets the full width. While it shows, the sidebar shrinks to icons to make room.
  const presenting = !!state.session || projector !== "off";
  const narrow = useMediaQuery("(max-width: 1100px)");

  // ---- backup ----
  const backup = async () => {
    const date = new Date().toISOString().slice(0, 10);
    const ok = await saveFileAs(`verselight-backup-${date}.json`, JSON.stringify(library, null, 2)).catch(() => false);
    if (ok) setNotice("Library backed up.");
  };
  // Restoring replaces the whole library, so the file is checked first and then the operator confirms.
  const [pendingRestore, setPendingRestore] = useState<{ name: string; library: Library } | null>(null);
  const restore = async (file: File) => {
    try {
      let parsed: Library | null = null;
      try { parsed = JSON.parse(await file.text()) as Library; } catch { /* not JSON: reported below */ }
      if (!parsed || !Array.isArray(parsed.items) || !Array.isArray(parsed.services)) throw new Error("it isn't a VerseLight backup file");
      setPendingRestore({ name: file.name, library: parsed });
    } catch (e) {
      setNotice(`${file.name} couldn't be restored: ${e instanceof Error ? e.message : e}.`);
    }
  };
  const confirmRestore = () => {
    if (!pendingRestore) return;
    replace(pendingRestore.library);
    dispatch({ type: "end" });
    setPendingRestore(null);
    setNotice("Library restored. On a new computer, import your Bibles again.");
  };
  const restoreSongs = pendingRestore ? pendingRestore.library.items.filter((i) => i.kind === "song").length : 0;

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
    <div className={cx("app", presenting && "presenting", (presenting || narrow) && "nav-compact")}>
      <Sidebar mode={mode} onMode={setMode} onProjector={() => openSettings("projector")} projector={projector} displayName={displayName} />


      <BibleWorkspace active={mode === "bible"} onPresent={presentScripture} onTranslation={setReadingBibleId} openRequest={openRequest}
        onManageBibles={() => openSettings("bibles")} focusSearch={bibleSearch}
        onStudyWord={(word) => openStudy({ word })} onSaved={() => openStudy({ tab: "saved" })} />
      <WordStudyWorkspace active={mode === "study"} currentBibleId={readingBibleId} onOpenInBible={openInBible}
        request={studyRequest} onPresent={presentScripture} />
      <SongsWorkspace active={mode === "songs"} themeFor={themeFor} onPresent={presentSong} focusSearch={songSearch} openSong={openSong}
        liveKey={state.session?.kind === "song" && liveSlide ? liveSlide.key : null} notify={setNotice} />
      <BackgroundsWorkspace active={mode === "backgrounds"} liveSample={liveSlide} />
      {mode === "home" && (
        <HomeScreen
          presenting={state.session && liveSlide ? { kind: state.session.kind, title: sessionTitle, slideLabel: liveSlide.label, index, count: slides.length } : null}
          projector={projector} displayName={displayName} readingBibleId={readingBibleId}
          onFindVerse={() => { setMode("bible"); setBibleSearch(Date.now()); }}
          onFindSong={() => { setMode("songs"); setSongSearch(Date.now()); }}
          onBackgrounds={() => setMode("backgrounds")}
          onManage={() => openSettings("bibles")}
          onOpenSong={(id) => { setOpenSong({ id, nonce: Date.now() }); setMode("songs"); }}
          onOpenVerse={(bibleId, b) => openInBible({ bibleId, book: b.book, chapter: b.chapter, verse: b.verse, to: b.to })} />
      )}
      {mode === "settings" && (
        <SettingsScreen section={settingsSection} onSection={setSettingsSection}
          projector={projector} displayName={displayName} displays={displays} canChooseDisplays={canChooseDisplays()}
          displayChoice={choice} projectorProblem={projectorProblem}
          onDisplay={(id) => { setProjectorProblem(null); update((lib) => ({ ...lib, displayId: id, displayIndex: null })); }}
          onRefreshDisplays={refreshDisplays}
          onBackup={backup} onRestore={restore} notify={setNotice} />
      )}
      {pendingRestore && (
        <ConfirmDialog title="Replace your library with this backup?" confirmLabel="Restore backup"
          message={<>Everything in VerseLight will be replaced with <strong>{pendingRestore.name}</strong> ({restoreSongs} {restoreSongs === 1 ? "song" : "songs"}):
            songs, backgrounds, saved verses and settings. Anything added since that backup will be lost. To keep what you have now, back it up first.</>}
          onCancel={() => setPendingRestore(null)} onConfirm={confirmRestore} />
      )}
      {mode === "help" && <HelpScreen onOpen={setMode} onSettings={openSettings} />}

      {presenting && <PresentationPanel
        title={sessionTitle}
        kind={state.session?.kind ?? null}
        slides={slides}
        index={index}
        selectionKeys={selectionKeys}
        neighbours={neighbours}
        blackout={state.blackout}
        projector={projector}
        displayName={displayName}
        problem={projector === "off" ? projectorProblem : null}
        onGoto={gotoSlide}
        onPrev={() => nav(-1)}
        onNext={() => nav(1)}
        onBlackout={() => dispatch({ type: "blackout" })}
        onStart={openProjector}
        onStop={stopPresenting}
        onEnd={() => { stopPresenting(); setProjectorProblem(null); dispatch({ type: "end" }); }}
        defaultTheme={library.theme}
        lookFor={lookFor}
        looks={library.looks}
        slideLook={(key) => library.assign.slides[key] ?? null}
        onSlideLook={(key, lookId) => assignLook("slides", key, lookId)}
      />}

      {(notice || saveError) && (
        <Toast message={saveError ?? notice} onDismiss={saveError ? undefined : () => setNotice(null)} />
      )}
    </div>
  );
}
