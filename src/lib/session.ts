/**
 * The presentation session: the one source of truth for what is being presented.
 *
 *   selection → session.slides → session.index → laptop preview + slide list + projector
 *
 * Bible: a session covers whole chapters, one verse per slide, and starts at the selected verse,
 * so Next/Previous always move exactly one verse and can run past the selection and into the
 * next or previous chapter. Songs: one slide per section slide, in the song's play order.
 */
import type { BibleData } from "./bible";
import { slidesFor } from "./slides";
import type { BibleMeta, Slide, Song } from "./types";

export type OnScreen = "both" | "first" | "second";

/** What to present from the Bible. Chapter and verse numbers are 1-based; book is 0-based. */
export interface ScriptureSpec {
  primaryId: string;
  secondId?: string;
  onScreen: OnScreen;
  book: number;
  chapter: number;
  from: number;
  to: number;
}

export type Session =
  | {
      kind: "scripture";
      spec: ScriptureSpec;
      /** The chapters loaded so far, in order */
      chapters: number[];
      slides: Slide[];
      /** The book's name as shown on the slides, and how many chapters it has */
      bookName: string;
      chaptersInBook: number;
    }
  | { kind: "song"; songId: string };

export interface SessionState {
  session: Session | null;
  index: number;
  blackout: boolean;
  /** Text hidden, background still shown */
  clear: boolean;
}

export const initialSession: SessionState = { session: null, index: 0, blackout: false, clear: false };

/** A stable key per verse, so per-slide looks stay attached to that verse across sessions. */
export const verseKey = (book: number, chapter: number, verse: number) => `v:${book}.${chapter}.${verse}`;

interface Sources {
  primary: BibleData;
  second?: BibleData | null;
  meta: Pick<BibleMeta, "abbreviation" | "language">;
  meta2?: Pick<BibleMeta, "abbreviation" | "language"> | null;
}

/** One slide per verse of a chapter, honouring the bilingual "show on screen" choice. */
export function chapterSlides(spec: ScriptureSpec, chapter: number, src: Sources): Slide[] {
  const { primary, second, meta, meta2 } = src;
  const book = primary.books[spec.book];
  const verses = book?.chapters[chapter - 1] ?? [];
  const other = second?.books[spec.book]?.chapters[chapter - 1] ?? [];
  const bilingual = !!(second && meta2);
  const mode: OnScreen = bilingual ? spec.onScreen : "first";
  const lang = meta.language ?? "en";
  const lang2 = meta2?.language ?? "ml";

  if (mode === "second" && second && meta2) {
    const name = second.books[spec.book]?.name ?? "";
    return other.flatMap((text, i) => {
      if (!text) return [];
      const label = `${name} ${chapter}:${i + 1}`;
      return [{ key: verseKey(spec.book, chapter, i + 1), itemId: "bible", kind: "scripture" as const, label,
        lines: [text.trim()], footer: `${label} (${meta2.abbreviation})`, lang: lang2 }];
    });
  }
  const translations = mode === "both" && meta2 ? `${meta.abbreviation} · ${meta2.abbreviation}` : meta.abbreviation;
  return verses.flatMap((text, i) => {
    // A verse number with no text in either translation (the ESV keeps omitted verses, like Matthew 17:21, as gaps) gets no slide.
    if (!text && !(mode === "both" && other[i])) return [];
    const label = `${book.name} ${chapter}:${i + 1}`;
    return [{
      key: verseKey(spec.book, chapter, i + 1),
      itemId: "bible",
      kind: "scripture" as const,
      label,
      lines: [text.trim()],
      footer: `${label} (${translations})`,
      lang,
      ...(mode === "both" ? { parallelLines: [(other[i] ?? "").trim()], parallelLang: lang2 } : {}),
    }];
  });
}

/** The session's slides. Song slides are read from the library each time, so edits show at once. */
export function sessionSlides(session: Session | null, songs: Map<string, Song>): Slide[] {
  if (!session) return [];
  if (session.kind === "scripture") return session.slides;
  const song = songs.get(session.songId);
  return song ? slidesFor(song) : [];
}

export type SessionAction =
  | { type: "start"; session: Session; index: number }
  | { type: "goto"; index: number; count: number }
  | { type: "step"; delta: number; count: number }
  /** The slides changed under the live slide (a song was edited): stay on it, without changing Black */
  | { type: "follow"; index: number }
  | { type: "extend"; where: "before" | "after"; chapter: number; slides: Slide[]; advance: boolean }
  | { type: "blackout" }
  | { type: "clear" }
  | { type: "end" };

const clamp = (i: number, count: number) => Math.max(0, Math.min(Math.max(0, count - 1), i));

/** Every change to what is presented goes through here, so the state can never disagree with itself. */
export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case "start":
      return { session: action.session, index: action.index, blackout: false, clear: false };
    case "goto":
      return state.session ? { ...state, index: clamp(action.index, action.count), blackout: false, clear: false } : state;
    case "step":
      return state.session ? { ...state, index: clamp(state.index + action.delta, action.count), blackout: false, clear: false } : state;
    case "follow":
      return state.session ? { ...state, index: Math.max(0, action.index) } : state;
    case "extend": {
      const s = state.session;
      if (!s || s.kind !== "scripture" || s.chapters.includes(action.chapter) || action.slides.length === 0) return state;
      if (action.where === "after") {
        const slides = [...s.slides, ...action.slides];
        return {
          ...state,
          session: { ...s, slides, chapters: [...s.chapters, action.chapter] },
          index: action.advance ? s.slides.length : state.index,
          blackout: action.advance ? false : state.blackout,
          clear: action.advance ? false : state.clear,
        };
      }
      const slides = [...action.slides, ...s.slides];
      const shifted = state.index + action.slides.length;
      return {
        ...state,
        session: { ...s, slides, chapters: [action.chapter, ...s.chapters] },
        index: action.advance ? shifted - 1 : shifted,
        blackout: action.advance ? false : state.blackout,
        clear: action.advance ? false : state.clear,
      };
    }
    case "blackout":
      return { ...state, blackout: !state.blackout };
    case "clear":
      return { ...state, clear: !state.clear };
    case "end":
      return initialSession;
  }
}

/**
 * After a song being presented is edited, where the slide that was on screen is now.
 * Returns null when nothing needs to move (same place, or the slide was left out or deleted).
 */
export function followSlide(liveKey: string | null | undefined, slides: Slide[], index: number): number | null {
  if (!liveKey) return null;
  const at = slides.findIndex((s) => s.key === liveKey);
  return at >= 0 && at !== index ? at : null;
}

/** Is a step of `delta` at an end of the loaded slides (where a Bible session may need the next chapter)? */
export const atEdge = (index: number, count: number, delta: number) => (delta > 0 ? index >= count - 1 : index <= 0);

/** For a Bible session: the chapters it can still run into, named for the operator ("John 4"), or null at the book's ends. */
export function chapterNeighbours(session: Session | null): { before: string | null; after: string | null } {
  if (!session || session.kind !== "scripture") return { before: null, after: null };
  const first = Math.min(...session.chapters);
  const last = Math.max(...session.chapters);
  return {
    before: first > 1 ? `${session.bookName} ${first - 1}` : null,
    after: last < session.chaptersInBook ? `${session.bookName} ${last + 1}` : null,
  };
}

/** For a Bible session: the chapter Next or Previous should load when the operator runs off an end. */
export function neighbourChapter(session: Session | null, index: number, count: number, delta: number, chaptersInBook: number) {
  if (!session || session.kind !== "scripture") return null;
  if (delta > 0 && index >= count - 1) {
    const next = Math.max(...session.chapters) + 1;
    return next <= chaptersInBook ? { where: "after" as const, chapter: next } : null;
  }
  if (delta < 0 && index <= 0) {
    const prev = Math.min(...session.chapters) - 1;
    return prev >= 1 ? { where: "before" as const, chapter: prev } : null;
  }
  return null;
}
