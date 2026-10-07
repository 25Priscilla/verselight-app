/**
 * Reads Malayalam songs from a Word document laid out as a growing song collection, and works out which of them are
 * new to the library. Used by scripts/docx-songs.ts; nothing here writes to the library.
 *
 * Each song in the document is:
 *   a numbered heading in Latin letters        "1 Paattu onnu (43)"           → altTitle "Paattu onnu"
 *   the Malayalam title on the next paragraph  "പാട്ട് ഒന്ന്"                  → title
 *   section labels, each followed by the Malayalam lines and then their transliteration (Manglish)
 *
 * Malayalam text is kept exactly as written: nothing is corrected, respaced or normalised. Manglish lines are
 * transliterations, not translations, so they are left out (VerseLight has no transliteration field) and never stored
 * as `translation`. A Latin block that reads like English is held for review instead of being guessed at.
 *
 * Anything VerseLight can't hold exactly (a label used twice in one song, lines with no label) holds that song back
 * with a note, so no words are ever dropped silently.
 */
import { hasMalayalam, searchKey } from "./malayalam";
import { songKey, type SongFile, type SongFileEntry } from "./songImport";
import type { LibraryItem, Song } from "./types";

// ---------- document.xml → paragraphs ----------

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) =>
    e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e] ?? m);

/**
 * The text of each paragraph in a Word document.xml, in order. Line breaks inside a paragraph become "\n" and tabs
 * "\t". Deleted tracked-change text (w:delText) is not included.
 */
export function docxParagraphs(xml: string): string[] {
  const body = xml.match(/<w:body\b[^>]*>([\s\S]*)<\/w:body>/)?.[1] ?? xml;
  const out: string[] = [];
  for (const p of body.match(/<w:p\b[^>]*\/>|<w:p\b[^>]*>[\s\S]*?<\/w:p>/g) ?? []) {
    let text = "";
    for (const m of p.matchAll(/<w:t\b[^>]*\/>|<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:(br|cr|tab)\b[^>]*\/>/g)) {
      if (m[2] === "tab") text += "\t";
      else if (m[2]) text += "\n";
      else text += decode(m[1] ?? "");
    }
    out.push(text);
  }
  return out;
}

// ---------- paragraphs → songs ----------

const LABEL = /^(verse(\s*\d+)?|chorus(\s*\d+)?|refrain|bridge(\s*\d+)?|pre-?chorus|tag|ending|intro|outro)$/i;
const HEADING = /^(\d+)\s*(\S.*)$/;
/** A bracketed number at the end of a heading, e.g. "(43)". It isn't part of the title. */
const TRAILING_NUMBER = /\s*\(\d+\)\s*$/;

/** Common English words that rarely appear in Manglish. Used only to hold a block back for review. */
const ENGLISH = new Set("the and of to you your my is are in with for will his he me all who love lord god from be we our us it that this was has have".split(" "));
export function looksEnglish(text: string): boolean {
  const words = text.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  const hits = words.filter((w) => ENGLISH.has(w)).length;
  return hits >= 3 && hits / words.length >= 0.2;
}

type Kind = "empty" | "label" | "ml" | "latin";
const kindOf = (p: string): Kind => {
  const t = p.trim();
  if (!t) return "empty";
  if (LABEL.test(t)) return "label";
  return hasMalayalam(t) ? "ml" : "latin";
};

export interface DocxSong {
  /** The song's number in the document (for reports only; never stored) */
  number: number;
  /** The heading without its number and without a bracketed number at the end */
  altTitle: string;
  /** Bracketed number removed from the heading, e.g. "(43)" */
  removedNumber: string;
  title: string;
  /** Sections in document order */
  sections: { label: string; lines: string[] }[];
  /** Lyrics in VerseLight's format, built from the sections */
  lyrics: string;
  /** Transliteration (Manglish) paragraphs that were left out */
  transliterations: number;
  /** Reasons the song can't be imported exactly as written. A song with problems is held back. */
  problems: string[];
}

export interface DocxParse {
  songs: DocxSong[];
  /** Paragraphs with text that don't belong to any song (e.g. before the first heading) */
  stray: string[];
}

export function parseDocxSongs(paragraphs: string[]): DocxParse {
  const kinds = paragraphs.map(kindOf);
  const nextFilled = (i: number) => { let j = i + 1; while (j < kinds.length && kinds[j] === "empty") j++; return j; };
  // A heading is a numbered Latin paragraph followed by a one-line Malayalam title and then a section label.
  // (Transliterated verses also start with a number, but a label or a heading follows them, not a Malayalam title.)
  const isHeading = (i: number) => {
    if (kinds[i] !== "latin" || paragraphs[i].includes("\n") || !HEADING.test(paragraphs[i].trim())) return false;
    const t = nextFilled(i);
    return kinds[t] === "ml" && !paragraphs[t].trim().includes("\n") && kinds[nextFilled(t)] === "label";
  };

  const songs: DocxSong[] = [];
  const stray: string[] = [];
  let i = 0;
  while (i < paragraphs.length) {
    if (!isHeading(i)) {
      if (kinds[i] !== "empty") stray.push(paragraphs[i]);
      i++;
      continue;
    }
    const [, num, rest] = paragraphs[i].trim().match(HEADING)!;
    const removedNumber = rest.match(TRAILING_NUMBER)?.[0].trim() ?? "";
    const titleAt = nextFilled(i);
    const song: DocxSong = {
      number: Number(num), altTitle: rest.replace(TRAILING_NUMBER, ""), removedNumber, title: paragraphs[titleAt],
      sections: [], lyrics: "", transliterations: 0, problems: [],
    };
    let section: { label: string; lines: string[]; sawLatin: boolean } | null = null;
    let j = titleAt + 1;
    for (; j < paragraphs.length && !isHeading(j); j++) {
      const text = paragraphs[j];
      switch (kinds[j]) {
        case "empty": break;
        case "label": {
          const label = text.trim();
          if (song.sections.some((s) => s.label === label)) {
            song.problems.push(`"${label}" is used for two different sections. VerseLight keeps only the first section with a name, so the second one's words would be lost.`);
          }
          section = { label, lines: [], sawLatin: false };
          song.sections.push(section);
          break;
        }
        case "ml":
          if (!section) {
            song.problems.push(`Malayalam lines with no section label before them: "${firstLine(text)}"`);
          } else if (section.sawLatin) {
            song.problems.push(`Malayalam lines with no section label of their own, after "${section.label}": "${firstLine(text)}"`);
          } else {
            if (section.lines.length) section.lines.push("");
            section.lines.push(...text.split("\n"));
          }
          break;
        case "latin":
          if (looksEnglish(text)) song.problems.push(`This looks like English, not a transliteration: "${firstLine(text)}". Translations need checking before import.`);
          song.transliterations++;
          if (section) section.sawLatin = true;
          break;
      }
    }
    for (const s of song.sections) if (s.lines.length === 0) song.problems.push(`"${s.label}" has no Malayalam lines.`);
    if (song.sections.length === 0) song.problems.push("No sections found.");
    song.lyrics = song.sections.map((s) => `[${s.label}]\n${s.lines.join("\n")}`).join("\n\n");
    songs.push(song);
    i = j;
  }
  return { songs, stray };
}

const firstLine = (text: string) => text.trim().split("\n")[0];

// ---------- compare with the library ----------

export interface DocxPlan {
  /** Songs to import: not in the library, no possible duplicate, no problems */
  fresh: DocxSong[];
  /** Already in the library with the same title and writer (VerseLight's own duplicate rule). Left untouched. */
  existing: { song: DocxSong; match: Song }[];
  /** Similar to a song in the library or earlier in the document. Held back for review. */
  possible: { song: DocxSong; match: string; reason: string }[];
  /** Songs that can't be imported exactly as written */
  problems: DocxSong[];
}

const firstLyricLine = (lyrics: string) =>
  searchKey(lyrics.split("\n").find((l) => l.trim() && !/^\s*\[[^\]]+\]\s*$/.test(l)) ?? "");

export function planDocxImport(parsed: DocxParse, items: LibraryItem[]): DocxPlan {
  const library = items.filter((i): i is Song => i.kind === "song");
  const plan: DocxPlan = { fresh: [], existing: [], possible: [], problems: [] };
  const seen: DocxSong[] = [];
  for (const song of parsed.songs) {
    // Same rule as importing a song file in the app: same title and writer. These songs have no writer.
    const key = songKey(song.title, "");
    const match = library.find((s) => songKey(s.title, s.artist) === key);
    if (match) { plan.existing.push({ song, match }); seen.push(song); continue; }

    const t = searchKey(song.title);
    const alt = searchKey(song.altTitle);
    const first = firstLyricLine(song.lyrics);
    const similar = (s: { title: string; altTitle?: string; lyrics: string }) =>
      searchKey(s.title) === t ? "same Malayalam title (different writer)"
      : alt && [s.title, s.altTitle ?? ""].some((x) => searchKey(x) === alt) ? "same English/transliterated title"
      : first && firstLyricLine(s.lyrics) === first ? "same first line"
      : "";
    const libHit = library.map((s) => ({ s, why: similar(s) })).find((x) => x.why);
    const docHit = seen.map((s) => ({ s, why: similar(s) })).find((x) => x.why);
    seen.push(song);
    if (libHit) plan.possible.push({ song, match: `${libHit.s.title}${libHit.s.artist ? ` · ${libHit.s.artist}` : ""} (in your library)`, reason: libHit.why });
    else if (docHit) plan.possible.push({ song, match: `#${docHit.s.number} ${docHit.s.title} (earlier in the document)`, reason: docHit.why });
    else if (song.problems.length) plan.problems.push(song);
    else plan.fresh.push(song);
  }
  return plan;
}

/** A VerseLight song file with the new songs. Only what the document gives is filled in. */
export function docxSongFile(songs: DocxSong[], name: string): SongFile & { format: "verselight-songs" } {
  return {
    format: "verselight-songs",
    name,
    source: "",
    license: "",
    songs: songs.map((s): SongFileEntry => ({
      title: s.title,
      altTitle: s.altTitle,
      language: "ml",
      artist: "",
      copyright: "",
      ccli: "",
      lyrics: s.lyrics,
    })),
  };
}
