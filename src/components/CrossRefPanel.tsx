import { useEffect, useMemo, useState } from "react";
import { bibleLang, BOOK_NAMES, type BibleData } from "../lib/bible";
import { crossRefsFor, loadCrossRefs, splitId, XREF_CHANGES, XREF_CREDIT, XREF_LICENSE_URL, XREF_SOURCE_URL, type CrossRefData } from "../lib/crossrefs";
import type { BibleMeta } from "../lib/types";
import { useLibrary } from "../state/library";
import { Icon } from "./Icon";

export interface Passage {
  book: number;
  chapter: number;
  from: number;
  to: number;
}

interface Props {
  /** The selected verse or passage; null shows a "select a verse" hint */
  passage: Passage | null;
  /** Its reference, e.g. "John 3:16" */
  reference: string;
  bible: BibleData | null;
  meta: BibleMeta | undefined;
  /** Second translation for a preview line (bilingual Bible view) */
  second?: BibleData | null;
  onOpen: (start: number, end: number) => void;
  /** Only the Bible screen passes this; Word Study is for study, not presenting */
  onPresent?: (start: number, end: number) => void;
  onImport: () => void;
  onClose: () => void;
}

/** "Romans 5:8", "1 John 4:9–10" or "Isaiah 53:4–54:1", using the book names of the given Bible. */
export function crossRefLabel(bible: BibleData | null, start: number, end: number): string {
  const a = splitId(start), z = splitId(end);
  const name = bible?.books[a.book]?.name ?? BOOK_NAMES[a.book];
  if (start === end) return `${name} ${a.chapter}:${a.verse}`;
  return a.chapter === z.chapter ? `${name} ${a.chapter}:${a.verse}–${z.verse}` : `${name} ${a.chapter}:${a.verse}–${z.chapter}:${z.verse}`;
}

/**
 * Cross references for a verse or passage, from the OpenBible.info data stored in VerseLight (works offline).
 * Shared by the Bible screen and Word Study.
 */
export function CrossRefPanel({ passage, reference, bible, meta, second, onOpen, onPresent, onImport, onClose }: Props) {
  const { library } = useLibrary();
  const [data, setData] = useState<CrossRefData | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [limit, setLimit] = useState(25);
  const importedAt = library.crossRefs?.importedAt;

  // Load once, and again after a new import.
  useEffect(() => {
    if (!importedAt) return setData(null);
    setLoading(true);
    loadCrossRefs().then(setData).finally(() => setLoading(false));
  }, [importedAt]);
  useEffect(() => { setLimit(25); }, [passage?.book, passage?.chapter, passage?.from, passage?.to]);

  const refs = useMemo(
    () => (data && passage ? crossRefsFor(data, passage.book, passage.chapter, passage.from, passage.to) : []),
    [data, passage?.book, passage?.chapter, passage?.from, passage?.to],
  );
  const shown = showAll ? refs : refs.filter((r) => r.votes > 0);
  const hidden = refs.length - shown.length;
  const lang = bibleLang(meta);

  return (
    <aside className="xref" aria-label="Cross references">
      <div className="xref-head">
        <div>
          <h2>Cross references</h2>
          <span className="muted small">{passage ? reference : "Select a verse"}</span>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close cross references"><Icon name="x" size={16} /></button>
      </div>
      {!library.crossRefs ? (
        <div className="xref-empty">
          <p>Cross references aren't imported yet.</p>
          <p className="muted small">Run <code>npm run fetch-crossrefs</code>, then import <code>bibles/cross_references.txt</code>. The data is free under CC BY 4.0 from OpenBible.info and works offline.</p>
          <button className="btn primary small" onClick={onImport}><Icon name="download" size={14} />Import cross references</button>
        </div>
      ) : loading || !data ? (
        <p className="muted small pad">Loading cross references…</p>
      ) : !passage ? (
        <p className="muted small pad">Select a verse to see related passages.</p>
      ) : shown.length === 0 ? (
        <p className="muted small pad">No cross references for {reference}.</p>
      ) : (
        <ol className="xref-list">
          {shown.slice(0, limit).map((r) => {
            const a = splitId(r.start);
            const preview = bible?.books[a.book]?.chapters[a.chapter - 1]?.[a.verse - 1] ?? "";
            const preview2 = second?.books[a.book]?.chapters[a.chapter - 1]?.[a.verse - 1] ?? "";
            const label = crossRefLabel(bible, r.start, r.end);
            const top = shown[0]?.votes || 1;
            return (
              <li key={`${r.start}-${r.end}`} className="xref-item">
                <button className="xref-main" onClick={() => onOpen(r.start, r.end)} title={`Open ${label}`}>
                  <span className="xref-ref">
                    <span lang={lang}>{label}</span>
                    <span className="xref-votes" title={`${r.votes} votes on OpenBible.info`} aria-label={`${r.votes} votes`}>
                      <span style={{ width: `${Math.max(8, Math.min(100, (r.votes / top) * 100))}%` }} />
                    </span>
                  </span>
                  {preview && <span className="xref-text" lang={lang}>{preview}{r.end !== r.start ? " …" : ""}</span>}
                  {second && preview2 && <span className="xref-text xref-second" lang="ml">{preview2}</span>}
                </button>
                <div className="xref-actions">
                  <button className="btn ghost small" onClick={() => onOpen(r.start, r.end)}>Open</button>
                  {onPresent && (
                    <button className="btn present small" onClick={() => onPresent(r.start, r.end)} title="Present now">
                      <Icon name="play" size={12} />Present
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {library.crossRefs && data && passage && (
        <div className="xref-foot">
          {shown.length > limit && (
            <button className="btn ghost small" onClick={() => setLimit((n) => n + 25)}>Show more ({shown.length - limit})</button>
          )}
          {(hidden > 0 || showAll) && (
            <button className="btn ghost small" onClick={() => setShowAll((v) => !v)}>
              {showAll ? "Hide less relevant" : `Show ${hidden} less relevant`}
            </button>
          )}
          <p className="xref-credit">
            <a href={XREF_SOURCE_URL} target="_blank" rel="noreferrer">{XREF_CREDIT.replace(", CC BY 4.0", "")}</a>,{" "}
            <a href={XREF_LICENSE_URL} target="_blank" rel="noreferrer">CC BY 4.0</a>. {XREF_CHANGES}
          </p>
        </div>
      )}
    </aside>
  );
}
