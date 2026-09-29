#!/usr/bin/env node
/**
 * Downloads the public-domain King James Version from an existing open dataset
 * (github.com/thiagobodruk/bible) and saves it, unchanged, in VerseLight's
 * import format at ./bibles/kjv.verselight.json.
 *
 * VerseLight does not modify verse text. Book names are taken from the
 * standard 66-book order because the source file uses short codes.
 * Note: in the UK the KJV is under Crown patent; check local rules.
 */
import { mkdir, writeFile } from "node:fs/promises";

const SOURCE = "https://raw.githubusercontent.com/thiagobodruk/bible/master/json/en_kjv.json";
const BOOKS = [
  "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy", "Joshua", "Judges", "Ruth",
  "1 Samuel", "2 Samuel", "1 Kings", "2 Kings", "1 Chronicles", "2 Chronicles", "Ezra",
  "Nehemiah", "Esther", "Job", "Psalms", "Proverbs", "Ecclesiastes", "Song of Solomon",
  "Isaiah", "Jeremiah", "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel", "Amos",
  "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah", "Haggai", "Zechariah",
  "Malachi", "Matthew", "Mark", "Luke", "John", "Acts", "Romans", "1 Corinthians",
  "2 Corinthians", "Galatians", "Ephesians", "Philippians", "Colossians", "1 Thessalonians",
  "2 Thessalonians", "1 Timothy", "2 Timothy", "Titus", "Philemon", "Hebrews", "James",
  "1 Peter", "2 Peter", "1 John", "2 John", "3 John", "Jude", "Revelation",
];

console.log(`Downloading ${SOURCE}`);
const res = await fetch(SOURCE);
if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
const books = JSON.parse((await res.text()).replace(/^\uFEFF/, ""));
if (!Array.isArray(books) || books.length !== 66) throw new Error(`Expected 66 books, got ${books.length}`);

const out = {
  format: "verselight-bible",
  name: "King James Version",
  abbreviation: "KJV",
  license: "Public domain (outside the UK). Source: github.com/thiagobodruk/bible",
  books: books.map((b, i) => ({ name: BOOKS[i], chapters: b.chapters })),
};
const verses = out.books.reduce((n, b) => n + b.chapters.reduce((m, c) => m + c.length, 0), 0);

await mkdir("bibles", { recursive: true });
await writeFile("bibles/kjv.verselight.json", JSON.stringify(out));
console.log(`Saved bibles/kjv.verselight.json (${out.books.length} books, ${verses} verses).`);
console.log("Import it in VerseLight under Bibles > Import Bible file.");
