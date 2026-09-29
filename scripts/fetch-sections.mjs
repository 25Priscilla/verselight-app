#!/usr/bin/env node
/**
 * Builds src/data/sections.json: the section headings of the Berean Standard Bible (BSB), with the
 * chapter and verse each section starts at. Used by the Chapter Overview ("Main sections").
 *
 * License (verified at https://berean.bible/terms.htm): "The Berean Bible and Majority Bible texts are
 * officially dedicated to the public domain as of April 30, 2023. All uses are freely permitted."
 * Headings are kept word for word. Only headings, their verse positions and the parallel-passage
 * references printed under them are taken; no BSB verse text is included.
 *
 * Source: USFM edition at https://github.com/usfm-bible/examples.bsb
 *
 * Usage:
 *   npm run fetch-sections                   download from GitHub
 *   npm run fetch-sections -- --dir PATH     use a folder of BSB .usfm files
 */
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const RAW = "https://raw.githubusercontent.com/usfm-bible/examples.bsb/main";
// Paratext file numbering: Old Testament 01–39, New Testament 41–67.
const CODES = [
  "GEN", "EXO", "LEV", "NUM", "DEU", "JOS", "JDG", "RUT", "1SA", "2SA", "1KI", "2KI", "1CH", "2CH", "EZR", "NEH",
  "EST", "JOB", "PSA", "PRO", "ECC", "SNG", "ISA", "JER", "LAM", "EZK", "DAN", "HOS", "JOL", "AMO", "OBA", "JON",
  "MIC", "NAM", "HAB", "ZEP", "HAG", "ZEC", "MAL", "MAT", "MRK", "LUK", "JHN", "ACT", "ROM", "1CO", "2CO", "GAL",
  "EPH", "PHP", "COL", "1TH", "2TH", "1TI", "2TI", "TIT", "PHM", "HEB", "JAS", "1PE", "2PE", "1JN", "2JN", "3JN",
  "JUD", "REV",
];
const fileName = (i) => `${String(i < 39 ? i + 1 : i + 2).padStart(2, "0")}${CODES[i]}BSB.usfm`;

/** Removes inline USFM markup (footnotes, character styles) from a heading. */
const clean = (s) => s.replace(/\\f\s[\s\S]*?\\f\*/g, "").replace(/\\\+?[a-z]+\d*\*?\s?/g, "").replace(/\s+/g, " ").trim();

/** Headings of one book: { "chapter": [[verse, heading, parallelRefs, level], …] } */
export function parseSections(usfm) {
  const out = {};
  let chapter = 0;
  let pending = [];
  for (const line of usfm.replace(/\r\n?/g, "\n").split("\n")) {
    const m = line.match(/^\\([a-z]+\d?)\s?(.*)$/);
    if (!m) continue;
    const [, tag, rest] = m;
    if (tag === "c") chapter = Number(rest.trim());
    else if (tag === "s1" || tag === "s2") pending.push([clean(rest), "", tag === "s2" ? 2 : 1]);
    else if (tag === "r" && pending.length) pending[pending.length - 1][1] = clean(rest).replace(/^\((.*)\)$/, "$1");
    else if (tag === "v" && pending.length) {
      const verse = Number(rest.match(/^(\d+)/)?.[1]);
      if (chapter && verse) (out[chapter] ??= []).push(...pending.map(([t, r, lvl]) => [verse, t, r, lvl]));
      pending = [];
    }
  }
  return out;
}

async function main() {
  const dirArg = process.argv.indexOf("--dir");
  const dir = dirArg > 0 ? process.argv[dirArg + 1] : null;
  const files = dir ? await readdir(dir) : null;
  const sections = {};
  let count = 0;
  for (let i = 0; i < CODES.length; i++) {
    let text;
    if (dir) {
      const name = files.find((f) => f.toUpperCase().includes(CODES[i]) && /\.usfm$/i.test(f));
      if (!name) throw new Error(`No .usfm file for ${CODES[i]} in ${dir}`);
      text = await readFile(join(dir, name), "utf8");
    } else {
      const res = await fetch(`${RAW}/${fileName(i)}`);
      if (!res.ok) throw new Error(`Download failed for ${fileName(i)} (HTTP ${res.status}). Clone the repository and use --dir.`);
      text = await res.text();
    }
    for (const [ch, list] of Object.entries(parseSections(text))) {
      sections[`${i}.${ch}`] = list;
      count += list.length;
    }
  }
  const out = {
    format: "verselight-sections",
    name: "Berean Standard Bible section headings",
    credit: "Section headings: Berean Standard Bible (BSB), public domain",
    source: "https://berean.bible/terms.htm",
    count,
    sections,
  };
  await mkdir("src/data", { recursive: true });
  await writeFile("src/data/sections.json", JSON.stringify(out));
  console.log(`Saved src/data/sections.json (${count} headings in ${Object.keys(sections).length} chapters).`);
}

if (process.argv[1]?.endsWith("fetch-sections.mjs")) main().catch((e) => { console.error(e.message); process.exit(1); });
