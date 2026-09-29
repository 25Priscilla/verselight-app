/**
 * Song library import. Lyrics are added exactly as they appear in the file;
 * VerseLight doesn't generate or alter song text.
 */
import { newId } from "./id";
import { detectLanguage, hasMalayalam } from "./malayalam";
import type { LibraryItem, Song, SongLanguage } from "./types";

export interface SongFileEntry {
  /** Section order as VerseLight labels, e.g. ["Verse 1", "Chorus", "Verse 2", "Chorus"] */
  arrangement?: string[];
  title: string;
  altTitle?: string;
  language?: SongLanguage;
  artist?: string;
  copyright?: string;
  ccli?: string;
  lyrics: string;
  sourceUrl?: string;
}

export interface SongFile {
  name: string;
  source: string;
  license: string;
  songs: SongFileEntry[];
}

export function parseSongFile(raw: string): SongFile {
  const json = JSON.parse(raw.replace(/^\uFEFF/, "")) as Partial<SongFile> & { format?: string };
  if (json.format !== "verselight-songs" || !Array.isArray(json.songs)) {
    throw new Error("this isn't a VerseLight song file. Create one with npm run fetch-hymns.");
  }
  const songs = json.songs.filter(
    (s): s is SongFileEntry => !!s && typeof s.title === "string" && typeof s.lyrics === "string" && s.lyrics.trim() !== "",
  );
  if (songs.length === 0) throw new Error("the file has no songs in it.");
  return { name: String(json.name ?? "Imported songs"), source: String(json.source ?? ""), license: String(json.license ?? ""), songs };
}

const key = (title: string, artist: string) =>
  `${title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}|${artist.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`;

/** Splits the file into songs that are new and songs already in the library (same title and writer). */
export function planSongImport(file: SongFile, items: LibraryItem[]) {
  const existing = new Set(items.filter((i): i is Song => i.kind === "song").map((s) => key(s.title, s.artist)));
  const fresh: SongFileEntry[] = [];
  let duplicates = 0;
  for (const s of file.songs) {
    const k = key(s.title, s.artist ?? "");
    if (existing.has(k)) duplicates++;
    else {
      existing.add(k);
      fresh.push(s);
    }
  }
  return { fresh, duplicates };
}

export function toSong(entry: SongFileEntry): Song {
  return {
    kind: "song",
    id: newId(),
    title: entry.title.trim(),
    altTitle: (entry.altTitle ?? "").trim(),
    language: entry.language ?? detectLanguage({ title: entry.title, lyrics: entry.lyrics }),
    artist: (entry.artist ?? "").trim(),
    copyright: (entry.copyright ?? "").trim(),
    ccli: (entry.ccli ?? "").trim(),
    lyrics: entry.lyrics,
    linesPerSlide: 0,
    arrangement: entry.arrangement ?? [],
    hidden: [],
    updatedAt: Date.now(),
  };
}

// ---------- OpenLyrics (openlyrics.org), the open XML format used by OpenLP and others ----------

const SECTION_NAMES: Record<string, string> = {
  v: "Verse", c: "Chorus", b: "Bridge", p: "Pre-Chorus", e: "Ending", i: "Intro", o: "Other",
};

/** "v1" → "Verse 1", "c" → "Chorus", "c2" → "Chorus 2", "b1" → "Bridge 1" */
export function openLyricsLabel(name: string): string {
  const m = name.trim().match(/^([a-z])(\d*)([a-z]?)$/i);
  if (!m || !SECTION_NAMES[m[1].toLowerCase()]) return name.trim();
  return [SECTION_NAMES[m[1].toLowerCase()], m[2] + m[3]].filter(Boolean).join(" ");
}

const byTag = (root: Element | Document, tag: string) => Array.from(root.getElementsByTagNameNS("*", tag));
const text = (el: Element | undefined) => (el?.textContent ?? "").trim();

/** Text of a <lines> element: <br/> becomes a line break; chord marks and comments are dropped. */
function linesText(el: Element): string {
  let out = "";
  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3) out += (child.nodeValue ?? "").replace(/\s*\n\s*/g, " ");
      else if (child.nodeType === 1) {
        const name = (child as Element).localName;
        if (name === "br") out += "\n";
        else if (name === "comment") continue;
        else walk(child); // <chord> may wrap words in OpenLyrics 0.9; <tag> wraps styled words
      }
    }
  };
  walk(el);
  return out.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).join("\n").trim();
}

/** Reads one OpenLyrics song. The words are kept exactly as written in the file. */
export function parseOpenLyrics(xml: string): SongFileEntry {
  const doc = new DOMParser().parseFromString(xml.replace(/^\uFEFF/, ""), "application/xml");
  if (doc.getElementsByTagName("parsererror").length || doc.documentElement.localName !== "song") {
    throw new Error("it isn't an OpenLyrics song file.");
  }
  const titles = byTag(doc, "title").map((t) => ({ value: text(t), lang: t.getAttribute("lang") ?? "" })).filter((t) => t.value);
  if (titles.length === 0) throw new Error("the song has no title.");

  const verses = byTag(doc, "verse");
  // Some files hold the same verse in several languages or scripts (e.g. Malayalam and Manglish).
  // Keep the Malayalam verses when there are any, otherwise the first language in the file.
  const langs = [...new Set(verses.map((v) => v.getAttribute("lang") ?? ""))];
  const mlLang = langs.find((l) => verses.some((v) => (v.getAttribute("lang") ?? "") === l && hasMalayalam(v.textContent ?? "")));
  const keepLang = mlLang ?? langs[0] ?? "";
  const kept = verses.filter((v) => (v.getAttribute("lang") ?? "") === keepLang);

  const labels = new Map<string, string>();
  const parts: string[] = [];
  for (const v of kept) {
    const name = v.getAttribute("name") ?? `v${parts.length + 1}`;
    const label = openLyricsLabel(name);
    labels.set(name.toLowerCase(), label);
    const body = byTag(v, "lines").map(linesText).filter(Boolean).join("\n\n");
    if (body) parts.push(`[${label}]\n${body}`);
  }
  const lyrics = parts.join("\n\n");
  if (!lyrics.trim()) throw new Error("the song has no lyrics.");

  const primary = titles.find((t) => hasMalayalam(t.value)) ?? titles[0];
  const alt = titles.find((t) => t !== primary && hasMalayalam(t.value) !== hasMalayalam(primary.value)) ?? titles.find((t) => t !== primary);
  const order = text(byTag(doc, "verseOrder")[0]).split(/\s+/).filter(Boolean)
    .map((n) => labels.get(n.toLowerCase())).filter((l): l is string => !!l);

  return {
    title: primary.value,
    altTitle: alt?.value ?? "",
    artist: byTag(doc, "author").map(text).filter(Boolean).join(", "),
    copyright: text(byTag(doc, "copyright")[0]),
    ccli: text(byTag(doc, "ccliNo")[0]),
    lyrics,
    arrangement: order,
    language: hasMalayalam(`${primary.value}\n${lyrics}`) ? "ml" : "en",
  };
}

/** Reads the files a user picked: VerseLight song files (.json) and OpenLyrics songs (.xml). */
export async function readSongFiles(files: File[]): Promise<{ file: SongFile; errors: string[] }> {
  const songs: SongFileEntry[] = [];
  const errors: string[] = [];
  const meta = { name: "", source: "", license: "" };
  for (const f of files) {
    try {
      const raw = await f.text();
      if (/\.xml$/i.test(f.name) || raw.trimStart().startsWith("<")) {
        songs.push(parseOpenLyrics(raw));
      } else {
        const parsed = parseSongFile(raw);
        songs.push(...parsed.songs);
        if (!meta.name) Object.assign(meta, { name: parsed.name, source: parsed.source, license: parsed.license });
      }
    } catch (e) {
      errors.push(`${f.name}: ${e instanceof Error ? e.message : e}`);
    }
  }
  const name = files.length === 1 && meta.name ? meta.name : `${songs.length} ${songs.length === 1 ? "song" : "songs"} from ${files.length} ${files.length === 1 ? "file" : "files"}`;
  return { file: { name, source: meta.source, license: meta.license, songs }, errors };
}
