/**
 * Some KJV files (for example older copies of github.com/thiagobodruk/bible's en_kjv.json) carry the
 * printed edition's typography in curly braces:
 *
 *  - Words the translators supplied, printed in italics in the KJV:
 *      "Blessed {is} the man ... in whose spirit {there is} no guile."
 *    These are part of the verse: the words are kept, only the braces go.
 *  - Translators' margin notes, always after the end of the verse text:
 *      "... from the darkness. {the light from...: Heb. between the light and between the darkness}"
 *    These are not verse text and are removed.
 *
 * Psalm titles in [square brackets] and the epistle subscriptions in «guillemets» are part of the
 * KJV text and are kept; braces inside them mark italics like anywhere else.
 *
 * The file on disk is never changed; this only shapes what is shown.
 */

/** Punctuation that ends verse text before a margin note. */
const ENDS_TEXT = /[.,;:?!)\]»'’"}]/;
/** "{word: Heb. …}", "{word...: or, …}": how the margin notes begin. */
const NOTE_WORDING = /^\{[^{}:]*:\s*(Heb\.|Gr\.|or,|Chaldee|that is)/;

/**
 * Where the margin note at the end of `s` starts, or -1 if `s` doesn't end with one.
 * A note is a {…} group at the very end, set off by a space after the verse's closing punctuation.
 * Scans backwards so a note with an unmatched brace inside (one verse in the source has
 * "{in yourselves...: or, that ye have in or, for} yourselves}") is still taken whole.
 */
function trailingNoteStart(s: string): number {
  if (!s.endsWith("}")) return -1;
  let depth = 0;
  let start = -1;
  let lowest = Infinity;
  for (let i = s.length - 1; i >= 0; i--) {
    if (s[i] === "}") depth++;
    else if (s[i] === "{") {
      depth--;
      if (depth === 0) { start = i; break; }
      if (depth < lowest) { lowest = depth; start = i; }
    }
  }
  if (start <= 0) return -1;
  const before = s.slice(0, start);
  if (!/\s$/.test(before)) return -1;
  // Usually the verse text ends in punctuation. A few verses run on into the next without any
  // ("...the rest were blinded {blinded: or, hardened}"); their notes are recognised by the note's own wording.
  return ENDS_TEXT.test(before.trimEnd().slice(-1)) || NOTE_WORDING.test(s.slice(start)) ? start : -1;
}

/** The verse as it reads in print: supplied words without braces, margin notes removed. Text without braces is returned unchanged. */
export function cleanKjvVerse(text: string): string {
  if (!/[{}]/.test(text)) return text;
  let s = text.trimEnd();
  for (let at = trailingNoteStart(s); at > 0; at = trailingNoteStart(s)) s = s.slice(0, at).trimEnd();
  return s.replace(/[{}]/g, "").replace(/ {2,}/g, " ").trim();
}

/** True when a Bible's verses use the brace markup above. */
export function hasKjvMarkup(books: { chapters: string[][] }[]): boolean {
  return books.some((b) => b.chapters.some((c) => c.some((v) => v.includes("{"))));
}
