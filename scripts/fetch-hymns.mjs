#!/usr/bin/env node
/**
 * Downloads public-domain English hymns from the WorshipCommons content repository
 * (github.com/ChurchApps/WorshipCommonsContent) and saves them in VerseLight's
 * song import format at ./songs/worshipcommons-pd.json.
 *
 * Only songs the repository files under its public-domain license are kept, and of those
 * only songs dated 1930 or earlier, or explicitly dedicated CC0 by their writer.
 * Public-domain entries dated after 1930 without a CC0 dedication are skipped, because
 * they often add newer material to an older hymn.
 *
 * The words are not changed. The only conversions are:
 *   - chord symbols such as [F] or [Bb/D] are removed (VerseLight projects words only)
 *   - section labels such as "Verse 1" become VerseLight tags such as "[Verse 1]"
 */
import { mkdir, writeFile } from "node:fs/promises";

const REPO = "https://github.com/ChurchApps/WorshipCommonsContent";
const SOURCE = "https://raw.githubusercontent.com/ChurchApps/WorshipCommonsContent/main/catalog.json";
const LABEL = /^\s*((?:verse|chorus|refrain|bridge|pre-?chorus|tag|intro|outro|ending|coda)(?:\s+\d+)?)\s*:?\s*$/i;
const CHORD = /\[[^\]\n]*\]/g;

export function chordProToLyrics(chordPro) {
  const out = [];
  for (const raw of chordPro.replace(/\r\n/g, "\n").split("\n")) {
    if (/^\s*\{.*\}\s*$/.test(raw)) continue; // ChordPro directives, e.g. {key: G}
    const label = raw.match(LABEL);
    if (label) {
      if (out.length && out[out.length - 1] !== "") out.push("");
      out.push(`[${label[1].replace(/\s+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}]`);
      continue;
    }
    out.push(raw.replace(CHORD, "").replace(/[ \t]+$/, ""));
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function qualifies(row) {
  if (row.language !== "English" || row.license !== "PD") return false;
  if (row.licenseVersion === "CC0") return true;
  return Number.isInteger(row.year) && row.year <= 1930;
}

async function main() {
  console.log(`Downloading ${SOURCE}`);
  const res = await fetch(SOURCE);
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  const rows = (await res.json()).rows;
  if (!Array.isArray(rows)) throw new Error("Unexpected catalog format: no rows array");

  const kept = rows.filter(qualifies);
  const skippedLate = rows.filter((r) => r.language === "English" && r.license === "PD" && !qualifies(r));

  const songs = kept
    .map((r) => ({
      title: r.title.trim(),
      language: "en",
      artist: (r.writer || "").trim(),
      year: r.year ?? null,
      copyright: r.licenseVersion === "CC0" ? "CC0 (dedicated by the writer)" : "Public domain",
      lyrics: chordProToLyrics(r.chordPro || ""),
      sourceId: r.id,
      sourceUrl: `${REPO}#${r.id}`,
    }))
    .filter((s) => s.title && /\[[^\]]+\]\n\S/.test(s.lyrics));

  const out = {
    format: "verselight-songs",
    name: "WorshipCommons public-domain hymns (English)",
    source: REPO,
    license:
      "Public domain in the United States as determined by WorshipCommons (pre-1931 publication or CC0 dedication). " +
      "Status can differ in other countries. Texts courtesy of Hymnary.org.",
    retrieved: new Date().toISOString().slice(0, 10),
    songs,
  };

  await mkdir("songs", { recursive: true });
  await writeFile("songs/worshipcommons-pd.json", JSON.stringify(out, null, 1));
  console.log(`Saved songs/worshipcommons-pd.json (${songs.length} songs).`);
  if (skippedLate.length) {
    console.log(`Skipped ${skippedLate.length} public-domain entries dated after 1930 without a CC0 dedication:`);
    for (const r of skippedLate) console.log(`  - ${r.title} (${r.year})`);
  }
  console.log("Import it in VerseLight: Songs > Import (or Settings > Songs > Import songs).");
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("fetch-hymns.mjs")) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
