import { useEffect, useMemo, useState } from "react";
import { bibleLang, loadBible, parseReference, type BibleData } from "../lib/bible";
import { findSongs, findVerses } from "../lib/globalSearch";
import { songLanguage } from "../lib/malayalam";
import { WHOLE_CHAPTER, passageReference } from "../lib/plan";
import type { NewPlanEntry, PlanPassage, Song } from "../lib/types";
import { useLibrary } from "../state/library";
import { Icon } from "./Icon";
import { ListRow, Modal, Segmented } from "./ui";

interface Props {
  /** The translation being read on the Bible screen, chosen first */
  readingBibleId: string;
  onAdd: (entry: NewPlanEntry) => void;
  onClose: () => void;
}

const collator = new Intl.Collator(["ml", "en"], { sensitivity: "base", numeric: true });
const RESULTS = 30;

/** A reading's translations: one Bible, or an English Bible shown with a Malayalam one. Value: "<primary>|<second>". */
interface TranslationChoice { value: string; label: string }

/**
 * + Add: a song from the library or a Bible passage, found with the same search the Songs and Bible screens use.
 * The entry only points at the song or passage; nothing is copied.
 */
export function PlannerAddDialog({ readingBibleId, onAdd, onClose }: Props) {
  const { library } = useLibrary();
  const [kind, setKind] = useState<"song" | "bible">("song");
  const [query, setQuery] = useState("");
  const songs = useMemo(() => library.items.filter((i): i is Song => i.kind === "song"), [library.items]);

  // ---- songs: the Songs screen's matching; recently used first when nothing is typed ----
  const songResults = useMemo(() => {
    if (query.trim()) return findSongs(songs, query, RESULTS).map((r) => r.song);
    return [...songs].sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0) || collator.compare(a.title, b.title)).slice(0, RESULTS);
  }, [songs, query]);

  // ---- Bible: the translation(s) to show it in ----
  const choices = useMemo<TranslationChoice[]>(() => {
    const single = library.bibles.map((b) => ({ value: `${b.id}|`, label: `${b.abbreviation} · ${b.name}` }));
    const en = library.bibles.filter((b) => bibleLang(b) === "en");
    const ml = library.bibles.filter((b) => bibleLang(b) === "ml");
    const pairs = en.flatMap((e) => ml.map((m) => ({ value: `${e.id}|${m.id}`, label: `${e.abbreviation} + ${m.abbreviation}` })));
    return [...single, ...pairs];
  }, [library.bibles]);
  const [choice, setChoice] = useState(() =>
    choices.find((c) => c.value === `${readingBibleId}|`)?.value ?? choices[0]?.value ?? "");
  const [primaryId, secondId] = choice.split("|");
  const meta = library.bibles.find((b) => b.id === primaryId);
  const [bible, setBible] = useState<BibleData | null>(null);
  useEffect(() => {
    let live = true;
    setBible(null);
    if (primaryId) loadBible(primaryId).then((b) => { if (live) setBible(b); }).catch(() => undefined);
    return () => { live = false; };
  }, [primaryId]);

  const passage = (book: number, chapter: number, from: number, to: number): PlanPassage =>
    ({ primaryId, ...(secondId ? { secondId, onScreen: "both" as const } : { onScreen: "first" as const }), book, chapter, from, to });

  /** A typed reference ("John 3:16", "Ps 23:1-6", "Psalm 23"), or verses found by their words. */
  const bibleResults = useMemo(() => {
    const q = query.trim();
    if (!bible || !meta || !q) return [];
    if (/\d/.test(q)) {
      const ref = parseReference(bible, q);
      if (!ref) return [];
      const verses = bible.books[ref.bookIndex]?.chapters[ref.chapter - 1] ?? [];
      const from = ref.from ?? 1;
      const to = ref.to ?? (ref.from ? from : verses.length || WHOLE_CHAPTER);
      const p = passage(ref.bookIndex, ref.chapter, from, to);
      return [{ key: "ref", passage: p, reference: passageReference(p, bible.books[ref.bookIndex].name), text: verses[from - 1] ?? "" }];
    }
    return findVerses([{ meta, data: bible }], q, RESULTS).hits.map((h) => {
      const p = passage(h.book, h.chapter, h.verse, h.verse);
      return { key: `${h.book}.${h.chapter}.${h.verse}`, passage: p, reference: passageReference(p, bible.books[h.book].name), text: h.text };
    });
  }, [bible, meta, query, choice]);

  const addFirst = () => {
    if (kind === "song" && songResults[0]) onAdd({ kind: "song", songId: songResults[0].id });
    if (kind === "bible" && bibleResults[0]) onAdd({ kind: "bible", passage: bibleResults[0].passage, reference: bibleResults[0].reference });
  };

  return (
    <Modal title="Add to service" onClose={onClose} className="plan-add">
      <Segmented label="Add" full value={kind} onChange={(k) => { setKind(k); setQuery(""); }}
        options={[{ value: "song", label: "Song" }, { value: "bible", label: "Bible passage" }]} />
      <div className="plan-add-search">
        <div className="search">
          <Icon name="search" />
          <input autoFocus key={kind} value={query} onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addFirst(); } }}
            placeholder={kind === "song" ? "Search songs · പാട്ട് തിരയുക" : "John 3:16, Psalm 23:1-6 or words"}
            aria-label={kind === "song" ? "Search songs" : "Bible reference or words"} />
        </div>
        {kind === "bible" && choices.length > 1 && (
          <select className="translation" aria-label="Translation" value={choice} onChange={(e) => setChoice(e.target.value)}>
            {choices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        )}
      </div>

      <ul className="plan-results" aria-label="Results">
        {kind === "song" ? (
          songResults.length ? songResults.map((s) => (
            <ListRow key={s.id} title={s.title || s.altTitle || "Untitled song"} lang={songLanguage(s)}
              subtitle={[s.title && s.altTitle, s.artist].filter(Boolean).join(" · ") || undefined}
              onClick={() => onAdd({ kind: "song", songId: s.id })} />
          )) : <li className="muted small pad">{songs.length ? `No songs match “${query}”.` : "Your song library is empty."}</li>
        ) : !library.bibles.length ? (
          <li className="muted small pad">No Bible is imported yet. Add one in Settings → Bibles.</li>
        ) : bibleResults.length ? bibleResults.map((r) => (
          <ListRow key={r.key} title={r.reference} lang={meta ? bibleLang(meta) : undefined}
            subtitle={r.text || undefined} onClick={() => onAdd({ kind: "bible", passage: r.passage, reference: r.reference })} />
        )) : query.trim() ? <li className="muted small pad">No verses found for “{query}”.</li> : null}
      </ul>
    </Modal>
  );
}
