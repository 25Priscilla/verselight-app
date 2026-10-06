import { languageName } from "./languages";
import { songLanguage } from "./malayalam";
import type { Song, SongDisplay } from "./types";

export interface LyricSection {
  label: string;
  /** Raw lines, including blank lines (used for automatic slide breaks) */
  lines: string[];
}

const TAG = /^\s*\[([^\]]+)\]\s*$/;

/**
 * Reads "[Verse 1]" style tags. Returns each section's content (first definition wins),
 * the order in which sections appear, including bare tags used as repeats, and the names of
 * sections written out twice with words under both (the second copy's words are not used).
 */
export function parseLyrics(lyrics: string): { sections: Map<string, LyricSection>; written: string[]; duplicates: string[] } {
  const sections = new Map<string, LyricSection>();
  const written: string[] = [];
  const duplicates: string[] = [];
  let current: LyricSection | null = null;

  const close = () => {
    if (!current) return;
    const hasText = current.lines.some((l) => l.trim());
    if (hasText && sections.has(current.label) && !duplicates.includes(current.label)) duplicates.push(current.label);
    if (hasText && !sections.has(current.label)) sections.set(current.label, current);
    if (hasText || sections.has(current.label)) written.push(current.label);
  };

  for (const raw of lyrics.replace(/\r\n/g, "\n").split("\n")) {
    const m = raw.match(TAG);
    if (m) {
      close();
      current = { label: m[1].trim(), lines: [] };
    } else {
      if (!current) current = { label: "Lyrics", lines: [] };
      current.lines.push(raw.trimEnd());
    }
  }
  close();
  return { sections, written, duplicates };
}

/** Splits a section into slide-sized chunks. */
export function chunkSection(lines: string[], linesPerSlide: number): string[][] {
  if (linesPerSlide > 0) {
    const text = lines.filter((l) => l.trim());
    const out: string[][] = [];
    for (let i = 0; i < text.length; i += linesPerSlide) out.push(text.slice(i, i + linesPerSlide));
    return out;
  }
  // Automatic: blank lines break slides; long groups are split evenly into ≤4 lines.
  const groups: string[][] = [];
  let group: string[] = [];
  for (const l of lines) {
    if (l.trim()) group.push(l);
    else if (group.length) { groups.push(group); group = []; }
  }
  if (group.length) groups.push(group);
  return groups.flatMap((g) => {
    if (g.length <= 4) return [g];
    const parts = Math.ceil(g.length / 4);
    const size = Math.ceil(g.length / parts);
    const out: string[][] = [];
    for (let i = 0; i < g.length; i += size) out.push(g.slice(i, i + size));
    return out;
  });
}

export function songOrder(song: Song): string[] {
  const { sections, written } = parseLyrics(song.lyrics);
  const order = song.arrangement.length ? song.arrangement : written;
  return order.filter((l) => sections.has(l));
}

/** Sections with words that a custom play order leaves out, so they never reach the screen. */
export function unusedSections(song: Song): string[] {
  if (song.arrangement.length === 0) return [];
  const { sections } = parseLyrics(song.lyrics);
  return [...sections.keys()].filter((l) => !song.arrangement.includes(l));
}

/** Next number for a section type, e.g. "Verse" -> "Verse 3" */
export function nextLabel(lyrics: string, base: string): string {
  const { sections } = parseLyrics(lyrics);
  if (base !== "Verse" && !sections.has(base)) return base;
  let n = 1;
  while (sections.has(`${base} ${n}`) || (n === 1 && sections.has(base))) n++;
  return `${base} ${n}`;
}

// ---------- translations ----------

export const hasTranslation = (song: Song) => !!song.translation?.trim();

/** What the song shows on screen. A song without a translation always shows its lyrics. */
export const songDisplay = (song: Song): SongDisplay => (hasTranslation(song) ? song.display ?? "both" : "primary");

/**
 * How the translation lines up with the lyrics, section by section (by tag name): sections of the lyrics with no
 * translation yet, translated sections with no matching section in the lyrics, translated sections written twice,
 * and sections that split into a different number of slides in each language (so their slides can't pair up evenly).
 */
export function translationPairing(song: Song): { missing: string[]; extra: string[]; duplicates: string[]; uneven: string[] } {
  if (!hasTranslation(song)) return { missing: [], extra: [], duplicates: [], uneven: [] };
  const lyrics = parseLyrics(song.lyrics).sections;
  const { sections, duplicates } = parseLyrics(song.translation ?? "");
  const slides = (lines: string[]) => chunkSection(lines, song.linesPerSlide).length;
  return {
    missing: [...lyrics.keys()].filter((l) => !sections.has(l)),
    extra: [...sections.keys()].filter((l) => !lyrics.has(l)),
    duplicates,
    uneven: [...lyrics.keys()].filter((l) => sections.has(l) && slides(lyrics.get(l)!.lines) !== slides(sections.get(l)!.lines)),
  };
}

/** The choices for what a song with a translation shows on screen, named by language ("Malayalam", "English", "Both"). */
export function displayChoices(song: Song): { value: SongDisplay; label: string; title: string }[] {
  const first = languageName(songLanguage(song));
  const second = languageName(song.translationLanguage ?? "und");
  const [a, b] = first === second ? ["Lyrics", "Translation"] : [first, second];
  return [
    { value: "primary", label: a, title: `Show only the ${first === second ? "lyrics" : `${first} lyrics`}` },
    { value: "translation", label: b, title: `Show only the ${first === second ? "translation" : `${second} translation`}` },
    { value: "both", label: "Both", title: `Show each section with its translation` },
  ];
}

/** The lyrics' section tags with room under each, to start a translation in the same sections. No words are copied. */
export function sectionTags(lyrics: string): string {
  return [...parseLyrics(lyrics).sections.keys()].map((l) => `[${l}]\n`).join("\n");
}
