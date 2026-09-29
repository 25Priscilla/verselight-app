import type { Song } from "./types";

export interface LyricSection {
  label: string;
  /** Raw lines, including blank lines (used for automatic slide breaks) */
  lines: string[];
}

const TAG = /^\s*\[([^\]]+)\]\s*$/;

/**
 * Reads "[Verse 1]" style tags. Returns each section's content (first definition wins)
 * and the order in which sections appear, including bare tags used as repeats.
 */
export function parseLyrics(lyrics: string): { sections: Map<string, LyricSection>; written: string[] } {
  const sections = new Map<string, LyricSection>();
  const written: string[] = [];
  let current: LyricSection | null = null;

  const close = () => {
    if (!current) return;
    const hasText = current.lines.some((l) => l.trim());
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
  return { sections, written };
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

/** Next number for a section type, e.g. "Verse" -> "Verse 3" */
export function nextLabel(lyrics: string, base: string): string {
  const { sections } = parseLyrics(lyrics);
  if (base !== "Verse" && !sections.has(base)) return base;
  let n = 1;
  while (sections.has(`${base} ${n}`) || (n === 1 && sections.has(base))) n++;
  return `${base} ${n}`;
}
