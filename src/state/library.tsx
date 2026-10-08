import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { newId } from "../lib/id";
import { readData, writeData } from "../lib/storage";
import { CHURCH_BACKGROUND_ID } from "../lib/gallery";
import { detectLanguage } from "../lib/malayalam";
import { migrateSongSlideKeys } from "../lib/slides";
import type { Library, LibraryItem, Look, Song, Theme } from "../lib/types";

const FILE = "library.json";

/** The church background, with dark text that reads well on its light centre. */
export const DEFAULT_THEME: Theme = {
  backgroundKind: "gallery",
  backgroundColor: "#141a2b",
  gradientFrom: "#1d2742",
  gradientTo: "#0d1120",
  backgroundImage: "",
  imageDim: 0.45,
  gradientAngle: 160,
  galleryId: CHURCH_BACKGROUND_ID,
  brightness: 1,
  overlay: 0,
  blur: 0,
  bilingualLayout: "stacked",
  fontFamily: "lora",
  fontSize: 8.5,
  textColor: "#3b1f0e",
  align: "center",
  shadow: false,
  showReference: true,
};

function starterLibrary(): Library {
  const songId = newId();
  const now = Date.now();
  return {
    version: 2,
    items: [
      {
        kind: "song",
        id: songId,
        title: "Sample song",
        artist: "Replace with your own song",
        copyright: "",
        ccli: "",
        lyrics:
          "[Verse 1]\nType your first verse here\nEach line appears as a line on screen\n\nA blank line starts a new slide\nSo long verses stay readable\n\n" +
          "[Chorus]\nThis is where the chorus goes\nWrite it once and repeat it with a tag\n\n" +
          "[Verse 2]\nAdd Verse, Chorus and Bridge sections\nWith the buttons above the editor\n\n" +
          "[Chorus]\n\n" +
          "[Bridge]\nDrag the sections on the right\nTo change the order they're sung",
        linesPerSlide: 0,
        arrangement: [],
        hidden: [],
        updatedAt: now,
      },
    ],
    services: [{ id: newId(), name: SERVICE_NAME, itemIds: [], entries: [], updatedAt: now }],
    bibles: [],
    theme: DEFAULT_THEME,
    looks: starterLooks(),
    assign: { bible: null, songs: null, items: {}, slides: {} },
    bookmarks: [],
    activeServiceId: null,
    displayId: null,
    displayIndex: null,
  };
}

/** Converts v1 songs (separate sections) into v2 tagged lyrics. */
type V1Song = { kind: "song"; id: string; title: string; author?: string; copyright: string; ccli: string;
  sections?: { id: string; label: string; text: string }[]; order?: string[]; updatedAt: number };

function migrateItem(item: LibraryItem | V1Song): LibraryItem {
  if (item.kind === "song" && "lyrics" in item) {
    const song = item as Song;
    return song.language ? song : { ...song, language: detectLanguage(song) };
  }
  if (item.kind !== "song" || "lyrics" in item) return item as LibraryItem;
  const v1 = item as V1Song;
  const sections = v1.sections ?? [];
  const byId = new Map(sections.map((s) => [s.id, s.label]));
  return {
    kind: "song",
    id: v1.id,
    title: v1.title,
    artist: v1.author ?? "",
    copyright: v1.copyright ?? "",
    ccli: v1.ccli ?? "",
    lyrics: sections.map((s) => `[${s.label}]\n${s.text.trim()}`).join("\n\n"),
    linesPerSlide: 0,
    arrangement: (v1.order ?? []).map((id) => byId.get(id)).filter((l): l is string => !!l),
    hidden: [],
    updatedAt: v1.updatedAt,
  };
}

interface Ctx {
  library: Library;
  update: (fn: (lib: Library) => Library) => void;
  replace: (lib: Library) => void;
  saveError: string | null;
}

const LibraryContext = createContext<Ctx | null>(null);


/** A few ready-made looks so the gallery is useful straight away. */
export function starterLooks(): Look[] {
  const now = Date.now();
  const look = (name: string, patch: Partial<Theme>): Look => ({ id: newId(), name, theme: { ...DEFAULT_THEME, ...patch }, updatedAt: now });
  return [
    look("Dawn worship", { backgroundKind: "gallery", galleryId: "dawn", overlay: 0.3, textColor: "#fffaf0", fontFamily: "sourcesans" }),
    look("Scripture at night", { backgroundKind: "gallery", galleryId: "rays", overlay: 0.2, fontFamily: "lora" }),
    look("Candlelight", { backgroundKind: "gallery", galleryId: "candle", overlay: 0.25, blur: 4, textColor: "#fff4e0" }),
  ];
}

/** A default look nobody changed from the old navy gradient moves to the church background. */
function churchDefault(t: Partial<Theme> | undefined): Partial<Theme> | undefined {
  const untouched = t?.backgroundKind === "gradient" && t.gradientFrom === "#1d2742" && t.gradientTo === "#0d1120" && t.textColor === "#fbf7ee";
  return untouched ? { ...t, backgroundKind: "gallery", galleryId: CHURCH_BACKGROUND_ID, textColor: DEFAULT_THEME.textColor, shadow: false } : t;
}

function migrateTheme(t: Partial<Theme> | undefined): Theme {
  const theme = { ...DEFAULT_THEME, ...t };
  // v0.2 only darkened images; keep colour and gradient looks exactly as they were.
  if (t && t.overlay === undefined) theme.overlay = t.backgroundKind === "image" ? (t.imageDim ?? 0.45) : 0;
  return theme;
}

export function normalizeLibrary(parsed: Library): Library {
  const starter = starterLibrary();
  const lib: Library = {
    ...starter,
    ...parsed,
    version: 2,
    items: (parsed.items ?? starter.items).map(migrateItem),
    services: parsed.services?.length ? parsed.services : starter.services,
    theme: migrateTheme(churchDefault(parsed.theme)),
    looks: Array.isArray(parsed.looks)
      ? parsed.looks.map((l) => ({ ...l, theme: migrateTheme(l.theme) }))
      : starterLooks(),
    assign: { bible: null, songs: null, items: {}, slides: {}, ...(parsed.assign as Partial<Library["assign"]> | undefined) },
    bookmarks: Array.isArray(parsed.bookmarks) ? parsed.bookmarks : [],
  };
  lib.assign.slides = migrateSongSlideKeys(lib.assign.slides, lib.items.filter((i): i is Song => i.kind === "song"));
  if (!lib.services.some((s) => s.id === lib.activeServiceId)) {
    lib.activeServiceId = lib.services[0]?.id ?? null;
  }
  // The Planner shows the service's name. The placeholder service every library started with is named for it.
  lib.services = lib.services.map((s) => (s.name === "Presentation" && !s.itemIds.length && !s.entries?.length ? { ...s, name: SERVICE_NAME } : s));
  return lib;
}

/** The Planner's title until the operator names the service */
export const SERVICE_NAME = "Sunday Service";

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [library, setLibrary] = useState<Library | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const timer = useRef<number>();

  useEffect(() => {
    readData(FILE)
      .then((raw) => normalizeLibrary(raw ? JSON.parse(raw) : starterLibrary()))
      .catch(() => normalizeLibrary(starterLibrary()))
      .then(setLibrary);
  }, []);

  // Debounced autosave after every change.
  useEffect(() => {
    if (!library) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      writeData(FILE, JSON.stringify(library))
        .then(() => setSaveError(null))
        .catch((e) => setSaveError(`Your changes aren't being saved: ${e}`));
    }, 400);
  }, [library]);

  const update = useCallback((fn: (lib: Library) => Library) => {
    setLibrary((lib) => (lib ? fn(lib) : lib));
  }, []);
  const replace = useCallback((lib: Library) => setLibrary(normalizeLibrary(lib)), []);

  if (!library) return <div className="boot">Opening VerseLight…</div>;
  return (
    <LibraryContext.Provider value={{ library, update, replace, saveError }}>{children}</LibraryContext.Provider>
  );
}

export function useLibrary() {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error("useLibrary must be used inside LibraryProvider");
  return ctx;
}
