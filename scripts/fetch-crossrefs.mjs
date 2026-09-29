#!/usr/bin/env node
/**
 * Downloads OpenBible.info's cross-reference data and saves it unchanged at
 * ./bibles/cross_references.txt, ready to import in VerseLight (Bible > Cross references > Import).
 *
 * License (verified at https://www.openbible.info/labs/cross-references/ and in the file's header line):
 *   Creative Commons Attribution 4.0 (https://creativecommons.org/licenses/by/4.0/).
 *   Drawn mainly from the public-domain Treasury of Scripture Knowledge.
 *   Credit: "Cross references: OpenBible.info". The file holds references and votes only, no Scripture text.
 *
 * Usage:
 *   npm run fetch-crossrefs                     download from openbible.info
 *   npm run fetch-crossrefs -- --file PATH      use a cross-references.zip (or .txt) you downloaded
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { unzip } from "./fetch-malayalam-bible.mjs";

const SOURCE = "https://a.openbible.info/data/cross-references.zip";

async function main() {
  const fileArg = process.argv.indexOf("--file");
  let buf;
  if (fileArg > 0) buf = await readFile(process.argv[fileArg + 1]);
  else {
    console.log(`Downloading ${SOURCE}`);
    const res = await fetch(SOURCE);
    if (!res.ok) {
      throw new Error(`Download failed (HTTP ${res.status}). Download "cross-references.zip" from ` +
        "https://www.openbible.info/labs/cross-references/ and run: npm run fetch-crossrefs -- --file path/to/cross-references.zip");
    }
    buf = Buffer.from(await res.arrayBuffer());
  }
  let text;
  if (buf.readUInt32LE(0) === 0x04034b50) {
    const entry = [...unzip(buf).entries()].find(([n]) => /cross_references\.txt$/i.test(n));
    if (!entry) throw new Error("The zip doesn't contain cross_references.txt.");
    text = entry[1].toString("utf8");
  } else text = buf.toString("utf8");
  const header = text.split("\n", 1)[0];
  if (!/^From Verse\tTo Verse\tVotes/.test(header)) throw new Error("This isn't OpenBible's cross-reference file.");
  const rows = text.split("\n").filter((l) => l.trim()).length - 1;
  await mkdir("bibles", { recursive: true });
  await writeFile("bibles/cross_references.txt", text);
  console.log(`Saved bibles/cross_references.txt (${rows} cross references, unchanged).`);
  console.log(`License line in the file: ${header.split("\t")[3] ?? "(none)"}`);
  console.log("Import it in VerseLight: Bible > select a verse > Cross references > Import cross references.");
}

main().catch((e) => { console.error(e.message); process.exit(1); });
