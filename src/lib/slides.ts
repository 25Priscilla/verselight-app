import { chunkSection, parseLyrics, songOrder } from "./lyrics";
import { songLanguage } from "./malayalam";
import type { LibraryItem, Scripture, Slide, Song } from "./types";

/**
 * A song slide's key: the section, which time it is sung ("the 2nd Chorus") and which part of it.
 * It doesn't depend on where the section sits in the play order, so a per-slide background stays on
 * its slide when sections are moved.
 */
export const songSlideKey = (songId: string, label: string, repeat: number, part: number) => `${songId}/${label}/${repeat}#${part}`;

/** Every slide a song can produce (before hiding), in arrangement order. */
export function songSlidesAll(song: Song): (Slide & { sourceKey: string; hidden: boolean; occ: number })[] {
  const { sections } = parseLyrics(song.lyrics);
  const credit = [song.artist, song.copyright, song.ccli && `CCLI ${song.ccli}`].filter(Boolean).join("  |  ");
  const hidden = new Set(song.hidden);
  const lang = songLanguage(song);
  const sung = new Map<string, number>();
  return songOrder(song).flatMap((label, occ) => {
    const chunks = chunkSection(sections.get(label)!.lines, song.linesPerSlide);
    const repeat = sung.get(label) ?? 0;
    sung.set(label, repeat + 1);
    return chunks.map((lines, i) => {
      const sourceKey = `${label}#${i}`;
      return {
        key: songSlideKey(song.id, label, repeat, i),
        itemId: song.id,
        label: chunks.length > 1 ? `${label} · ${i + 1}/${chunks.length}` : label,
        lines,
        footer: credit,
        kind: "song" as const,
        lang,
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
