import { chunkSection, parseLyrics, songOrder } from "./lyrics";
import { songLanguage } from "./malayalam";
import type { LibraryItem, Scripture, Slide, Song } from "./types";

/** Every slide a song can produce (before hiding), in arrangement order. */
export function songSlidesAll(song: Song): (Slide & { sourceKey: string; hidden: boolean; occ: number })[] {
  const { sections } = parseLyrics(song.lyrics);
  const credit = [song.artist, song.copyright, song.ccli && `CCLI ${song.ccli}`].filter(Boolean).join("  |  ");
  const hidden = new Set(song.hidden);
  const lang = songLanguage(song);
  return songOrder(song).flatMap((label, occ) => {
    const chunks = chunkSection(sections.get(label)!.lines, song.linesPerSlide);
    return chunks.map((lines, i) => {
      const sourceKey = `${label}#${i}`;
      return {
        key: `${song.id}:${occ}:${sourceKey}`,
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
