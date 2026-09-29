import { useEffect, useMemo, useState } from "react";
import { bibleLang, type BibleData } from "../lib/bible";
import { loadCrossRefs, type CrossRefData } from "../lib/crossrefs";
import { chapterSections, keyVerses, loadSections, neighbour, relatedChapters, type SectionsData } from "../lib/overview";
import type { BibleMeta } from "../lib/types";
import { useLibrary } from "../state/library";
import { Icon } from "./Icon";

interface Props {
  bible: BibleData;
  meta: BibleMeta | undefined;
  /** Second translation in the bilingual view (for names and a preview line) */
  second?: BibleData | null;
  book: number;
  chapter: number;
  /** Back to the reading view, optionally selecting verses there */
  onRead: (select?: { from: number; to: number }) => void;
  /** Show another chapter's overview */
  onChapter: (book: number, chapter: number) => void;
  onImportXrefs: () => void;
}

/**
 * A study overview of one chapter, built only from data stored in VerseLight (no AI, no summaries).
 * It never presents or creates slides; every link returns to the Bible reading view.
 */
export function ChapterOverview({ bible, meta, second, book, chapter, onRead, onChapter, onImportXrefs }: Props) {
  const { library } = useLibrary();
  const [sections, setSections] = useState<SectionsData | null>(null);
  const [xr, setXr] = useState<CrossRefData | null>(null);
  const lang = bibleLang(meta);
  const bookData = bible.books[book];
  const verses = bookData?.chapters[chapter - 1] ?? [];
  const canonical = bible.books.length === 66;
  const chaptersPerBook = useMemo(() => bible.books.map((b) => b.chapters.length), [bible]);

  useEffect(() => { if (canonical) loadSections().then(setSections).catch(() => setSections(null)); }, [canonical]);
  useEffect(() => {
    if (!library.crossRefs?.importedAt) return setXr(null);
    loadCrossRefs().then(setXr);
  }, [library.crossRefs?.importedAt]);

  const secs = useMemo(() => (sections ? chapterSections(sections, book, chapter, verses.length) : []), [sections, book, chapter, verses.length]);
  const keys = useMemo(() => (xr && canonical ? keyVerses(xr, book, chapter, verses.length) : []), [xr, canonical, book, chapter, verses.length]);
  const related = useMemo(() => (xr && canonical ? relatedChapters(xr, book, chapter) : []), [xr, canonical, book, chapter]);

  const name = (b: number) => bible.books[b]?.name ?? "";
  const prev = neighbour(chaptersPerBook, book, chapter, -1);
  const next = neighbour(chaptersPerBook, book, chapter, 1);
  const nearby = [-2, -1, 1, 2].map((d) => chapter + d).filter((c) => c >= 1 && c <= chaptersPerBook[book]);
  /** Nearby chips show just the number; related chips always name the book. */
  const chip = (b: number, c: number, fullName: boolean, title?: string) => (
    <button key={`${b}.${c}`} className="ov-chip" onClick={() => onChapter(b, c)} title={title}>
      <span lang={lang}>{fullName ? `${name(b)} ${c}` : `${c}`}</span>
    </button>
  );

  return (
    <div className="overview" aria-label={`${name(book)} ${chapter} overview`}>
      <header className="ov-head">
        <div className="ov-title">
          <span className="ov-kicker">Chapter overview</span>
          <h2 lang={lang}>{name(book)} {chapter}</h2>
          {second && <span className="ov-alt" lang="ml">{second.books[book]?.name} {chapter}</span>}
          <p className="ov-facts">
            <span>Chapter {chapter} of {chaptersPerBook[book]}</span>
            <span>{verses.length} {verses.length === 1 ? "verse" : "verses"}</span>
            {secs.length > 0 && <span>{secs.filter((s) => s.level === 1).length} {secs.filter((s) => s.level === 1).length === 1 ? "section" : "sections"}</span>}
          </p>
        </div>
        <div className="ov-nav">
          <button className="btn" disabled={!prev} onClick={() => prev && onChapter(prev.book, prev.chapter)} title="Previous chapter">
            <Icon name="prev" size={14} />{prev ? <span lang={lang}>{prev.book === book ? `Chapter ${prev.chapter}` : `${name(prev.book)} ${prev.chapter}`}</span> : "Previous"}
          </button>
          <button className="btn primary" onClick={() => onRead()}><Icon name="book" size={14} />Read Chapter</button>
          <button className="btn" disabled={!next} onClick={() => next && onChapter(next.book, next.chapter)} title="Next chapter">
            {next ? <span lang={lang}>{next.book === book ? `Chapter ${next.chapter}` : `${name(next.book)} ${next.chapter}`}</span> : "Next"}<Icon name="next" size={14} />
          </button>
        </div>
      </header>

      <div className="ov-grid">
        <section className="ov-card ov-sections">
          <h3>Main sections</h3>
          {!canonical ? (
            <p className="muted small">Section headings are available for Bibles with the standard 66 books.</p>
          ) : !sections ? (
            <p className="muted small">Loading…</p>
          ) : secs.length === 0 ? (
            <p className="muted small">No section headings for this chapter.</p>
          ) : (
            <ol className="ov-list">
              {secs.map((s) => (
                <li key={`${s.from}-${s.title}`} className={s.level > 1 ? "sub" : ""}>
                  <button onClick={() => onRead({ from: s.from, to: s.from })} title={`Read from verse ${s.from}`}>
                    <span className="ov-range">{s.from === s.to ? `v. ${s.from}` : `vv. ${s.from}–${s.to}`}</span>
                    <span className="ov-sec-title">{s.title}</span>
                    {s.parallel && <span className="ov-parallel">See also {s.parallel}</span>}
                  </button>
                </li>
              ))}
            </ol>
          )}
          {sections && secs.length > 0 && (
            <p className="ov-credit">
              Headings from the <a href={sections.source} target="_blank" rel="noreferrer">Berean Standard Bible</a> (public domain){lang === "ml" ? ", in English" : ""}.
            </p>
          )}
        </section>

        <section className="ov-card ov-keys">
          <h3>Key verses</h3>
          {!library.crossRefs ? (
            <div className="ov-empty">
              <p className="muted small">Key verses are found from cross-reference data. Import it once and it works offline.</p>
              <button className="btn small" onClick={onImportXrefs}><Icon name="download" size={13} />Import cross references</button>
            </div>
          ) : !xr ? (
            <p className="muted small">Loading…</p>
          ) : keys.length === 0 ? (
            <p className="muted small">No cross-reference data for this chapter.</p>
          ) : (
            <>
              <ol className="ov-list">
                {keys.map((k) => (
                  <li key={k.verse}>
                    <button onClick={() => onRead({ from: k.verse, to: k.verse })} title={`Go to verse ${k.verse}`}>
                      <span className="ov-ref" lang={lang}>{name(book)} {chapter}:{k.verse}</span>
                      <span className="ov-verse" lang={lang}>{verses[k.verse - 1]}</span>
                      {second && second.books[book]?.chapters[chapter - 1]?.[k.verse - 1] && (
                        <span className="ov-verse ov-second" lang="ml">{second.books[book].chapters[chapter - 1][k.verse - 1]}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ol>
              <p className="ov-credit">The chapter's most cross-referenced verses, ranked by OpenBible.info votes (CC BY 4.0).</p>
            </>
          )}
        </section>

        <section className="ov-card ov-related">
          <h3>Nearby chapters</h3>
          <div className="ov-chips">
            {nearby.map((c) => chip(book, c, false, `${name(book)} ${c}`))}
            {nearby.length === 0 && <span className="muted small">This book has one chapter.</span>}
          </div>
          <h3 className="ov-h3-2">Related chapters</h3>
          {!library.crossRefs ? (
            <p className="muted small">Import cross references to see chapters connected to this one.</p>
          ) : related.length === 0 ? (
            <p className="muted small">{xr ? "No strongly connected chapters." : "Loading…"}</p>
          ) : (
            <>
              <div className="ov-chips">
                {related.map((r) => chip(r.book, r.chapter, true, `Connected by cross references (${r.votes} votes)`))}
              </div>
              <p className="ov-credit">Chapters most connected to this one by cross references.</p>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
