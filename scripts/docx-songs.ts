#!/usr/bin/env node
/**
 * Prepares the new songs from a Malayalam song collection kept in a Word document (see src/lib/docxSongs.ts for the
 * layout it reads). The document can keep growing: each run compares it with your VerseLight library and writes
 * only the songs that aren't there yet.
 *
 *   npm run docx-songs -- <songs.docx> [--library <library.json>] [--out <file.json>]
 *
 * --library  defaults to the desktop app's library (%APPDATA%\app.verselight.desktop\library.json on Windows).
 *            It is only read, never written.
 * --out      defaults to songs/malayalam-new.json (the songs/ folder isn't committed to Git).
 *
 * Nothing is imported: open the output in VerseLight with Settings → Songs → Import songs. The import there checks
 * for duplicates again and never changes songs already in the library.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { inflateRawSync } from "node:zlib";
import { docxParagraphs, docxSongFile, parseDocxSongs, planDocxImport, type DocxSong } from "../src/lib/docxSongs";
import type { Library } from "../src/lib/types";

/** One file from a .docx (a zip archive), read through the archive's central directory. */
function readZipEntry(zip: Buffer, name: string): string {
  let end = zip.length - 22;
  while (end >= 0 && zip.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0) throw new Error("not a Word (.docx) file");
  let at = zip.readUInt32LE(end + 16);
  for (let n = zip.readUInt16LE(end + 10); n > 0; n--) {
    const method = zip.readUInt16LE(at + 10);
    const size = zip.readUInt32LE(at + 20);
    const nameLen = zip.readUInt16LE(at + 28);
    const extraLen = zip.readUInt16LE(at + 30);
    const commentLen = zip.readUInt16LE(at + 32);
    const local = zip.readUInt32LE(at + 42);
    if (zip.toString("utf8", at + 46, at + 46 + nameLen) === name) {
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const data = zip.subarray(start, start + size);
      return (method === 0 ? data : inflateRawSync(data)).toString("utf8");
    }
    at += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`${name} is missing, so this isn't a Word document`);
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}

const docx = process.argv.slice(2).find((a, i, all) => !a.startsWith("--") && !all[i - 1]?.startsWith("--"));
if (!docx) {
  console.error("Usage: npm run docx-songs -- <songs.docx> [--library <library.json>] [--out <file.json>]");
  process.exit(1);
}
const libraryPath = arg("--library") ?? join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "app.verselight.desktop", "library.json");
const out = arg("--out") ?? join("songs", "malayalam-new.json");
if (!existsSync(libraryPath)) {
  console.error(`Can't find your VerseLight library at ${libraryPath}. Pass --library <path to library.json>.`);
  process.exit(1);
}

const xml = readZipEntry(readFileSync(docx), "word/document.xml");
if (/<w:txbxContent\b/.test(xml)) console.warn("Note: the document has text boxes; text inside them may be read out of order.");
const parsed = parseDocxSongs(docxParagraphs(xml));
const library = JSON.parse(readFileSync(libraryPath, "utf8").replace(/^﻿/, "")) as Library;
const plan = planDocxImport(parsed, library.items ?? []);

const label = (s: DocxSong) => `#${s.number}  ${s.title.trim()}  ·  ${s.altTitle}`;
const lines: string[] = [];
const say = (s = "") => lines.push(s);
say(`Document: ${basename(docx)}`);
say(`Library:  ${libraryPath} (${(library.items ?? []).filter((i) => i.kind === "song").length} songs, read only)`);
say();
say(`Songs found in the document: ${parsed.songs.length}  (numbers ${parsed.songs.map((s) => s.number).join(", ")})`);
say(`Already in your library:     ${plan.existing.length}`);
say(`Possible duplicates:         ${plan.possible.length}`);
say(`Held back (structure):       ${plan.problems.length}`);
say(`New, ready to import:        ${plan.fresh.length}`);
say();
say("NEW, READY TO IMPORT");
for (const s of plan.fresh) say(`  ${label(s)}  [${s.sections.map((x) => x.label).join(", ")}]${s.removedNumber ? `  (removed ${s.removedNumber})` : ""}`);
if (plan.existing.length) {
  say();
  say("SKIPPED: ALREADY IN YOUR LIBRARY (left exactly as it is)");
  for (const { song, match } of plan.existing) say(`  ${label(song)}  =  ${match.title}${match.artist ? ` · ${match.artist}` : ""}`);
}
if (plan.possible.length) {
  say();
  say("HELD FOR REVIEW: POSSIBLE DUPLICATES (not imported, nothing merged)");
  for (const p of plan.possible) say(`  ${label(p.song)}\n      ${p.reason}: ${p.match}`);
}
if (plan.problems.length) {
  say();
  say("HELD BACK: CAN'T BE IMPORTED EXACTLY AS WRITTEN");
  for (const s of plan.problems) {
    say(`  ${label(s)}`);
    for (const p of s.problems) say(`      - ${p}`);
  }
}
if (parsed.stray.length) {
  say();
  say("TEXT OUTSIDE ANY SONG (not imported)");
  for (const t of parsed.stray) say(`  "${t.trim().split("\n")[0]}"`);
}
say();
say("Missing for every new song: writer/composer, translator, copyright, licence/permission, source, English translation.");
say(`Transliteration (Manglish) paragraphs left out: ${plan.fresh.reduce((n, s) => n + s.transliterations, 0)} (they are not translations).`);

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(docxSongFile(plan.fresh, `New Malayalam songs from ${basename(docx)}`), null, 2) + "\n", "utf8");
say();
say(`Wrote ${plan.fresh.length} new songs to ${out}. Nothing has been imported.`);
console.log(lines.join("\n"));
