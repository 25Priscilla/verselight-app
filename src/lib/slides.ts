import { chunkSection, parseLyrics, songDisplay, songOrder } from "./lyrics";
import { songLanguage } from "./malayalam";
import type { LibraryItem, Scripture, Slide, Song } from "./types";

/**
 * A song slide's key: the section, which time it is sung ("the 2nd Chorus") and which part of it.
 * It doesn't depend on where the section sits in the play order, so a per-slide background stays on
 * its slide when sections are moved.
 */
export const songSlideKey = (songId: string, label: string, repeat: number, part: number) => `${songId}/${label}/${repeat}#${part}`;

/**
 * Every slide a song can produce (before hiding), in arrangement order, honouring what the song shows on screen:
 * - "primary": the lyrics.
 * - "translation": the translation of each section. A section not translated yet shows its lyrics instead,
 *   so no part of the song goes missing on screen.
 * - "both": each section's lyrics with that section's translation under (or beside) it. Lines are never mixed:
 *   the section's first slide pairs with its translation's first slide, and so on.
 * Slide keys don't depend on what is shown, so per-slide backgrounds and the live slide stay put when it changes.
 */
export function songSlidesAll(song: Song): (Slide & { sourceKey: string; hidden: boolean; occ: number })[] {
  const { sections } = parseLyrics(song.lyrics);
  const translated = parseLyrics(song.translation ?? "").sections;
  const display = songDisplay(song);
  const credit = [song.artist, song.copyright, song.ccli && `CCLI ${song.ccli}`].filter(Boolean).join("  |  ");
  const hidden = new Set(song.hidden);
  const lang = songLanguage(song);
  const lang2 = song.translationLanguage ?? "und";
  const sung = new Map<string, number>();
  return songOrder(song).flatMap((label, occ) => {
    const own = chunkSection(sections.get(label)!.lines, song.linesPerSlide);
    const other = display !== "primary" && translated.has(label) ? chunkSection(translated.get(label)!.lines, song.linesPerSlide) : [];
    const chunks = display === "translation" && other.length ? other : own;
    const count = display === "both" ? Math.max(own.length, other.length) : chunks.length;
    const repeat = sung.get(label) ?? 0;
    sung.set(label, repeat + 1);
    return Array.from({ length: count }, (_, i) => {
      const sourceKey = `${label}#${i}`;
      const words = display === "translation" && other.length
        ? { lines: other[i], lang: lang2 }
        : display === "both" && other.length
          ? { lines: own[i] ?? [], lang, parallelLines: other[i] ?? [], parallelLang: lang2 }
          : { lines: own[i], lang };
      return {
        key: songSlideKey(song.id, label, repeat, i),
        itemId: song.id,
        label: count > 1 ? `${label} · ${i + 1}/${count}` : label,
        ...words,
        footer: credit,
        kind: "song" as const,
        sourceKey,
        hidden: hidden.has(sourceKey),
        occ,
      };
    });
  });
}

/**
 * Per-slide backgrounds saved before v0.3 used the old song slide key ("<song id>:<place in order>:<section>#<part>").
 * Moves each one onto the stable key of the slide it was on; keys that no longer match a slide are kept as they are.
 */
export function migrateSongSlideKeys(slides: Record<string, string>, songs: Song[]): Record<string, string> {
  const byId = new Map(songs.map((s) => [s.id, s]));
  const out: Record<string, string> = {};
  for (const [key, look] of Object.entries(slides)) {
    const m = key.match(/^([^:/]+):(\d+):(.+)#(\d+)$/);
    const song = m && byId.get(m[1]);
    if (!m || !song) { out[key] = look; continue; }
    const order = songOrder(song);
    const occ = Number(m[2]);
    const label = m[3];
    if (order[occ] !== label) { out[key] = look; continue; }
    const repeat = order.slice(0, occ).filter((l) => l === label).length;
    out[songSlideKey(song.id, label, repeat, Number(m[4]))] ??= look;
  }
  return out;
}

/** "John 3:16" + "John 3:18" -> "John 3:16–18" */
export function rangeLabel(refs: string[]): string {
  if (refs.length === 0) return "";
  const first = refs[0];
  const last = refs[refs.length - 1];
  if (refs.length === 1 || first === last) return first;
  const m1 = first.match(/^(.*) (\d+):(\d+)$/);
  const m2 = last.match(/^(.*) (\d+):(\d+)$/);
  if (m1 && m2 && m1[1] === m2[1]) {
    return m1[2] === m2[2] ? `${first}–${m2[3]}` : `${first}–${m2[2]}:${m2[3]}`;
  }
  return `${first} – ${last}`;
}

function scriptureSlides(s: Scripture): Slide[] {
  const per = Math.max(1, s.versesPerSlide || 1);
  const slides: Slide[] = [];
  for (let i = 0; i < s.verses.length; i += per) {
    const group = s.verses.slice(i, i + per);
    const ref = rangeLabel(group.map((v) => v.ref));
    const other = s.parallel?.verses.slice(i, i + per);
    const translations = [s.translation, s.parallel?.translation].filter(Boolean).join(" · ");
    slides.push({
      key: `${s.id}:${i}`,
      itemId: s.id,
      label: ref,
      lines: group.map((v) => v.text.trim()),
      verseNumbers: group.map((v) => v.ref.split(":").pop() ?? ""),
      footer: translations ? `${ref} (${translations})` : ref,
      kind: "scripture",
      lang: s.lang,
      ...(other ? { parallelLines: other.map((v) => v.text.trim()), parallelLang: s.parallel!.lang } : {}),
    });
  }
  return slides;
}

/** Slides shown in a presentation. Old announcement items produce none. */
export function slidesFor(item: LibraryItem): Slide[] {
  if (item.kind === "song") return songSlidesAll(item).filter((s) => !s.hidden);
  if (item.kind === "scripture") return scriptureSlides(item);
  return [];
}

export function itemTitle(item: LibraryItem): string {
  if (item.kind === "scripture") return item.reference || "Untitled scripture";
  return item.title || "Untitled";
}
