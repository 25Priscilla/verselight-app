#!/usr/bin/env node
/**
 * Downloads the Malayalam Bible 1910 (Sathyavedapusthakam), revised in contemporary orthography
 * by The Free Bible Foundation, from eBible.org, and saves it in VerseLight's import format at
 * ./bibles/mal1910.verselight.json.
 *
 * License (verified at https://ebible.org/mal2015/copyright.htm):
 *   © 2015 The Free Bible Foundation, Creative Commons Attribution-ShareAlike 4.0.
 *   Based on the public-domain 1910 edition. Redistribution is allowed with attribution;
 *   changes to the text must be indicated; redistributed copies keep the same license.
 *
 * VerseLight does not change the words. The conversion only removes USFM markup:
 * footnotes and cross-references (\f … \f*, \x … \x*), headings, and word-level markers,
 * whose content is kept.
 *
 * Usage:
 *   npm run fetch-malayalam-bible                  download from eBible.org
 *   npm run fetch-malayalam-bible -- --file PATH   use a mal2015_usfm.zip you downloaded, or a folder of .usfm/.SFM files
 */
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";

const SOURCE = "https://ebible.org/Scriptures/mal2015_usfm.zip";
const COPYRIGHT_PAGE = "https://ebible.org/mal2015/copyright.htm";
const LICENSE =
  "Malayalam Bible 1910 - Revised and in Contemporary Orthography. © 2015 The Free Bible Foundation (tfbf.in), " +
  "based on the public-domain 1910 edition. Licensed under CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/). " +
  "Source: eBible.org (mal2015). Text not modified by VerseLight.";

const CODES = [
  "GEN", "EXO", "LEV", "NUM", "DEU", "JOS", "JDG", "RUT", "1SA", "2SA", "1KI", "2KI", "1CH", "2CH", "EZR", "NEH",
  "EST", "JOB", "PSA", "PRO", "ECC", "SNG", "ISA", "JER", "LAM", "EZK", "DAN", "HOS", "JOL", "AMO", "OBA", "JON",
  "MIC", "NAM", "HAB", "ZEP", "HAG", "ZEC", "MAL", "MAT", "MRK", "LUK", "JHN", "ACT", "ROM", "1CO", "2CO", "GAL",
  "EPH", "PHP", "COL", "1TH", "2TH", "1TI", "2TI", "TIT", "PHM", "HEB", "JAS", "1PE", "2PE", "1JN", "2JN", "3JN",
  "JUD", "REV",
];

// ---------- minimal ZIP reader (stored and deflated entries) ----------
export function unzip(buf) {
  const files = new Map();
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("not a zip file");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("corrupt zip directory");
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    const dataStart = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(dataStart, dataStart + size);
    if (!name.endsWith("/")) files.set(name, method === 8 ? inflateRawSync(raw) : Buffer.from(raw));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

// ---------- USFM ----------
/** Removes USFM markup from verse text while keeping every word. */
export function cleanUsfm(text) {
  return text
    .replace(/\\f\s[\s\S]*?\\f\*/g, "") // footnotes
    .replace(/\\fe\s[\s\S]*?\\fe\*/g, "") // endnotes
    .replace(/\\x\s[\s\S]*?\\x\*/g, "") // cross-references
    .replace(/\\\+?w\s([^\\|]*)(\|[^\\]*)?\\\+?w\*/g, "$1") // \w word|lemma\w*
    .replace(/\\\+?[a-z]+\d*\*/g, "") // closing character markers
    .replace(/\\\+?[a-z]+\d*\s?/g, "") // opening markers such as \add, \nd, \wj, \q1, \p
    .replace(/\s+/g, " ")
    .trim();
}

/** Parses one USFM book into { code, name, chapters: string[][] }. */
export function parseUsfmBook(usfm) {
  const src = usfm.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const code = (src.match(/\\id\s+([A-Z0-9]{3})/) || [])[1];
  if (!code) return null;
  const name = ((src.match(/\\toc2\s+(.+)/) || src.match(/\\h\s+(.+)/) || src.match(/\\toc1\s+(.+)/) || [])[1] || code).trim();
  const chapters = [];
  let chapter = null;
  let verse = null;
  const flush = () => {
    if (chapter && verse) chapter[verse.n - 1] = cleanUsfm(verse.text);
    verse = null;
  };
  // Split on chapter and verse markers; keep everything else as verse text.
  const tokens = src.split(/(\\c\s+\d+|\\v\s+\d+(?:-\d+)?\s?)/);
  for (const t of tokens) {
    const c = t.match(/^\\c\s+(\d+)/);
    const v = t.match(/^\\v\s+(\d+)(?:-(\d+))?/);
    if (c) {
      flush();
      chapter = [];
      chapters[Number(c[1]) - 1] = chapter;
    } else if (v) {
      flush();
      verse = { n: Number(v[1]), text: "" };
    } else if (verse) {
      // Drop section headings and Psalm titles that sit between verses; they are not verse text.
      verse.text += t.replace(/\n\\(s\d?|ms\d?|mr|r|d|sp|cl|qa|rem|ide|toc\d|mt\d?|h|sts|restore)(\s[^\n]*)?(?=\n|$)/g, "\n");
    }
  }
  flush();
  return { code, name, chapters: chapters.map((ch) => Array.from(ch ?? [], (x) => x ?? "")) };
}

async function loadSources(file) {
  if (file) {
    const info = await stat(file);
    if (info.isDirectory()) {
      const names = (await readdir(file)).filter((n) => /\.(usfm|sfm)$/i.test(n));
      return Promise.all(names.map(async (n) => (await readFile(join(file, n))).toString("utf8")));
    }
    return [...unzip(await readFile(file)).entries()].filter(([n]) => /\.(usfm|sfm)$/i.test(n)).map(([, b]) => b.toString("utf8"));
  }
  console.log(`Downloading ${SOURCE}`);
  const res = await fetch(SOURCE);
  if (!res.ok) {
    throw new Error(
      `Download failed (HTTP ${res.status}). Download the USFM zip for "mal2015" from https://ebible.org/find/show.php?id=mal2015 ` +
        "and run: npm run fetch-malayalam-bible -- --file path/to/mal2015_usfm.zip",
    );
  }
  return [...unzip(Buffer.from(await res.arrayBuffer())).entries()].filter(([n]) => /\.(usfm|sfm)$/i.test(n)).map(([, b]) => b.toString("utf8"));
}

/** Compares chapter and verse counts with the KJV so the parallel view's alignment is known in advance. */
function versificationReport(out) {
  const kjvPath = "bibles/kjv.verselight.json";
  if (!existsSync(kjvPath)) return console.log("(Run npm run fetch-kjv first to compare verse numbering with the KJV.)");
  return readFile(kjvPath, "utf8").then((raw) => {
    const kjv = JSON.parse(raw);
    const diffs = [];
    out.books.forEach((b, i) => {
      const k = kjv.books[i]?.chapters ?? [];
      if (k.length !== b.chapters.length) diffs.push(`${CODES[i]}: ${b.chapters.length} chapters (KJV ${k.length})`);
      else b.chapters.forEach((c, ci) => { if (c.length !== k[ci].length) diffs.push(`${CODES[i]} ${ci + 1}: ${c.length} verses (KJV ${k[ci].length})`); });
    });
    if (diffs.length === 0) console.log("Verse numbering matches the KJV in every book and chapter.");
    else {
      console.log(`Verse numbering differs from the KJV in ${diffs.length} chapters. In the parallel view these verses show on one side only:`);
      for (const d of diffs.slice(0, 40)) console.log(`  - ${d}`);
      if (diffs.length > 40) console.log(`  … and ${diffs.length - 40} more`);
    }
  });
}

async function main() {
  const fileArg = process.argv.indexOf("--file");
  const sources = await loadSources(fileArg > 0 ? process.argv[fileArg + 1] : null);
  const books = new Map();
  for (const s of sources) {
    const b = parseUsfmBook(s);
    if (b && CODES.includes(b.code)) books.set(b.code, b);
  }
  const missing = CODES.filter((c) => !books.has(c));
  if (missing.length) throw new Error(`Missing books in the download: ${missing.join(", ")}`);

  const out = {
    format: "verselight-bible",
    name: "Malayalam Bible 1910 (Sathyavedapusthakam, contemporary orthography)",
    abbreviation: "MAL1910",
    language: "ml",
    license: LICENSE,
    source: COPYRIGHT_PAGE,
    books: CODES.map((c) => ({ name: books.get(c).name, chapters: books.get(c).chapters })),
  };
  const verses = out.books.reduce((n, b) => n + b.chapters.reduce((m, c) => m + c.filter(Boolean).length, 0), 0);
  await mkdir("bibles", { recursive: true });
  await writeFile("bibles/mal1910.verselight.json", JSON.stringify(out));
  console.log(`Saved bibles/mal1910.verselight.json (${out.books.length} books, ${verses} verses).`);
  await versificationReport(out);
  console.log("Import it in VerseLight: Bible > translation menu > Import Bible file.");
}

if (process.argv[1]?.endsWith("fetch-malayalam-bible.mjs")) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
