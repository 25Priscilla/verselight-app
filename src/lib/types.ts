export type Id = string;

/** A BCP-47 language code, e.g. "en", "ml" (Malayalam), "ta" (Tamil), "kn" (Kannada). See lib/languages.ts. */
export type SongLanguage = string;

/** Which words of a song with a translation are shown on screen */
export type SongDisplay = "primary" | "translation" | "both";

export interface Song {
  kind: "song";
  id: Id;
  /** Title in the song's own language and script, e.g. Malayalam Unicode */
  title: string;
  /** Optional English or transliterated title, e.g. a Manglish spelling, used for search and display */
  altTitle?: string;
  /** Language of `lyrics`. Detected from the text when missing */
  language?: SongLanguage;
  favorite?: boolean;
  /** When the song was last presented or added to a presentation */
  lastUsedAt?: number;
  artist: string;
  copyright: string;
  ccli: string;
  /**
   * Lyrics with section tags on their own line, e.g. "[Verse 1]", "[Chorus]", "[Bridge]".
   * A tag with no lines under it repeats the earlier section with that name.
   */
  lyrics: string;
  /**
   * Optional translation of the lyrics in a second language, written with the same section tags ("[Verse 1]" in the
   * lyrics pairs with "[Verse 1]" here). Empty or missing means the song is in one language only.
   * Play order, left-out slides and lines per slide all come from `lyrics`.
   */
  translation?: string;
  /** Language of `translation` */
  translationLanguage?: SongLanguage;
  /** What a song with a translation shows on screen; missing means both together */
  display?: SongDisplay;
  /** 0 = automatic (blank lines, max 4 lines per slide); otherwise fixed lines per slide */
  linesPerSlide: number;
  /** Section names in play order; empty means the order written in the lyrics */
  arrangement: string[];
  /** Slide keys ("Chorus#0") switched off by the user */
  hidden: string[];
  updatedAt: number;
}

export interface ScriptureVerse {
  /** e.g. "John 3:16" */
  ref: string;
  /** Verse text exactly as provided by the source. Never edited by the app. */
  text: string;
}

export interface Scripture {
  kind: "scripture";
  id: Id;
  /** Human reference, e.g. "Psalm 23:1–6" */
  reference: string;
  /** Translation label from the source, e.g. "KJV" */
  translation: string;
  /** Attribution/copyright notice from the source */
  attribution: string;
  verses: ScriptureVerse[];
  /** Language of `verses` ("en", "ml") */
  lang?: string;
  /**
   * Optional second translation for bilingual display, matched by book, chapter and verse number.
   * A verse missing from one translation has empty text on that side.
   */
  parallel?: { translation: string; attribution: string; lang: string; verses: ScriptureVerse[] };
  /** Verses per slide */
  versesPerSlide: number;
  source: "bible-file" | "manual";
  updatedAt: number;
}

export interface TextItem {
  kind: "text";
  id: Id;
  title: string;
  /** Blank line starts a new slide. */
  text: string;
  updatedAt: number;
}

export type LibraryItem = Song | Scripture | TextItem;

export interface Service {
  id: Id;
  name: string;
  itemIds: Id[];
  updatedAt: number;
}

export type BackgroundKind = "color" | "gradient" | "image" | "gallery";

export interface Theme {
  backgroundKind: BackgroundKind;
  backgroundColor: string;
  gradientFrom: string;
  gradientTo: string;
  /** data: URL of an image the user picked */
  backgroundImage: string;
  /** Legacy (v0.2): darkening over images. Replaced by `overlay`. */
  imageDim: number;
  /** Gradient direction in degrees (180 = top to bottom) */
  gradientAngle: number;
  /** Id of a built-in gallery background (see lib/gallery.ts) */
  galleryId: string;
  /** Background brightness multiplier, 0.4–1.4 (1 = unchanged) */
  brightness: number;
  /** Dark overlay over the background for readable text, 0–0.85 */
  overlay: number;
  /** Background blur, 0–20, as pixels at 1080p (scaled to every screen size) */
  blur: number;
  /** How bilingual scripture and songs are laid out on screen */
  bilingualLayout: "stacked" | "columns";
  fontFamily: FontKey;
  /** Text height as percentage of screen height */
  fontSize: number;
  textColor: string;
  align: "left" | "center";
  shadow: boolean;
  showReference: boolean;
}

export type FontKey = "lora" | "crimson" | "sourcesans" | "montserrat";

// Bundled fonts for Malayalam, Tamil and Kannada. Each covers only its own script, so their order doesn't matter.
const INDIC_SERIF = "'Noto Serif Malayalam Variable', 'Noto Serif Tamil Variable', 'Noto Serif Kannada Variable', 'Nirmala UI'";
const INDIC_SANS = "'Noto Sans Malayalam Variable', 'Noto Sans Tamil Variable', 'Noto Sans Kannada Variable', 'Nirmala UI'";

export const FONTS: Record<FontKey, { label: string; css: string }> = {
  // Each font falls back to bundled Malayalam, Tamil and Kannada fonts, so those lyrics render correctly offline
  // whichever font is chosen. Latin letters keep the chosen font.
  lora: { label: "Lora (serif)", css: `'Lora Variable', ${INDIC_SERIF}, Georgia, serif` },
  crimson: { label: "Crimson Pro (classic serif)", css: `'Crimson Pro Variable', ${INDIC_SERIF}, 'Times New Roman', serif` },
  sourcesans: { label: "Source Sans (clean sans)", css: `'Source Sans 3 Variable', ${INDIC_SANS}, 'Segoe UI', Helvetica, sans-serif` },
  montserrat: { label: "Montserrat (bold sans)", css: `'Montserrat Variable', ${INDIC_SANS}, 'Segoe UI', Helvetica, sans-serif` },
};

export interface BibleMeta {
  id: Id;
  name: string;
  abbreviation: string;
  /** License / copyright statement recorded at import time */
  license: string;
  /** "en" or "ml"; detected from the text when missing */
  language?: "en" | "ml";
  bookCount: number;
  importedAt: number;
}

/** A saved background + text style preset. */
export interface Look {
  id: Id;
  name: string;
  theme: Theme;
  updatedAt: number;
}

/**
 * Which look each slide uses. The first match wins:
 * a single slide → a whole song or passage → all Bible or all song slides → the Default look.
 * Values are look ids; DEFAULT_LOOK_ID means the Default look (library.theme).
 */
export interface LookAssignments {
  bible: Id | null;
  songs: Id | null;
  items: Record<Id, Id>;
  slides: Record<string, Id>;
}

export const DEFAULT_LOOK_ID = "default";

/**
 * A saved verse. Stored by position (book in the standard 66-book order, chapter, verse), not by text,
 * so it shows in whichever translation is selected.
 */
export interface Bookmark {
  id: Id;
  book: number;
  chapter: number;
  verse: number;
  /** Last verse of a saved passage in the same chapter (missing for a single verse) */
  to?: number;
  /** Translation the verse was saved from, e.g. "KJV" (shown as a hint only) */
  translation: string;
  savedAt: number;
}

export interface Library {
  version: 2;
  looks: Look[];
  assign: LookAssignments;
  items: LibraryItem[];
  services: Service[];
  bibles: BibleMeta[];
  /** Imported cross-reference data (stored separately in crossrefs.json) */
  crossRefs?: { count: number; credit: string; importedAt: number };
  /** Verses saved from Word Study, newest first */
  bookmarks: Bookmark[];
  /** The Default look, used wherever no other look is assigned */
  theme: Theme;
  activeServiceId: Id | null;
  /** Projector screen chosen in Settings, by the display's id; null (or missing) means automatic */
  displayId?: string | null;
  /** Projector screen by list position, as saved before display ids. Only used while displayId is missing. */
  displayIndex: number | null;
}

/** A single rendered screen. */
export interface Slide {
  key: string;
  itemId: Id;
  /** Operator-facing label, e.g. "Chorus" or "John 3:16" */
  label: string;
  lines: string[];
  /** Shown small at the bottom (scripture reference, song credit) */
  footer: string;
  /** Stable key of the source chunk within a song, e.g. "Chorus#0" */
  sourceKey?: string;
  /** Verse numbers aligned with lines (scripture only) */
  verseNumbers?: string[];
  /** BCP-47 language of the text ("ml" for Malayalam), used for correct shaping */
  lang?: string;
  /** Second-language text for bilingual slides: scripture verses aligned with `lines`, or a song section's translation */
  parallelLines?: string[];
  parallelLang?: string;
  kind: LibraryItem["kind"];
}

/** Everything the projector needs to draw. */
export interface LiveState {
  slide: Slide | null;
  theme: Theme;
  blackout: boolean;
  clear: boolean;
}
