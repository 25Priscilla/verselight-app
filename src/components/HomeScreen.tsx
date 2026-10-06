import { useEffect, useMemo, useState } from "react";
import { bibleLang, loadBible, type BibleData } from "../lib/bible";
import { bookmarkLabel, bookmarkVerses } from "../lib/bookmarks";
import { songLanguage } from "../lib/malayalam";
import type { Bookmark, Song } from "../lib/types";
import { useLibrary } from "../state/library";
import { Icon, type IconName } from "./Icon";
import { Page } from "./Page";
import type { ProjectorStatus } from "./PresentationPanel";
import { Button, Card, StatusChip } from "./ui";

/** What is loaded in the presentation, for the "Now presenting" card */
export interface PresentingSummary {
  kind: "scripture" | "song";
  title: string;
  /** e.g. "Genesis 1:3" or "Chorus" */
  slideLabel: string;
  index: number;
  count: number;
}

interface Props {
  presenting: PresentingSummary | null;
  projector: ProjectorStatus;
  displayName: string;
  /** Translation used to show saved verses when the one they were saved from isn't imported */
  readingBibleId: string;
  onFindVerse: () => void;
  onFindSong: () => void;
  onBackgrounds: () => void;
  onManage: () => void;
  onOpenSong: (id: string) => void;
  onOpenVerse: (bibleId: string, bookmark: Bookmark) => void;
}

const RECENT = 5;

/** The start screen: the common jobs in plain words, and what was used recently. */
export function HomeScreen(p: Props) {
  const { library } = useLibrary();
  const noBibles = library.bibles.length === 0;

  const recentSongs = useMemo(() => library.items
    .filter((i): i is Song => i.kind === "song" && !!i.lastUsedAt)
    .sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0))
    .slice(0, RECENT), [library.items]);
  const saved = library.bookmarks.slice(0, RECENT);

  const actions: { icon: IconName; title: string; text: string; onClick: () => void }[] = [
    { icon: "book", title: "Find a Bible verse", text: "Look up a passage and show it on the projector.", onClick: p.onFindVerse },
    { icon: "music", title: "Find a song", text: "Search your songs by title or words.", onClick: p.onFindSong },
    { icon: "image", title: "Change the background", text: "Choose the colours, pictures and text style of the slides.", onClick: p.onBackgrounds },
    { icon: "settings", title: "Add or manage Bibles and songs", text: "Import Bibles and song files, or remove them.", onClick: p.onManage },
  ];

  return (
    <Page title="Welcome to VerseLight" intro="What would you like to do?" className="home-page">
      {noBibles && (
        <div className="home-callout" role="note">
          <span className="home-callout-icon"><Icon name="book" size={20} /></span>
          <div>
            <strong>Add a Bible to get started</strong>
            <p className="muted small">VerseLight doesn't include Bible text. Import a Bible file you're allowed to use, such as the public-domain KJV.</p>
          </div>
          <Button variant="primary" onClick={p.onManage}>Import a Bible</Button>
        </div>
      )}

      {p.presenting && <NowPresenting summary={p.presenting} projector={p.projector} displayName={p.displayName} />}

      <div className="home-actions">
        {actions.map((a) => (
          <button key={a.title} className="home-action" onClick={a.onClick}>
            <span className="home-action-icon"><Icon name={a.icon} size={22} /></span>
            <span className="home-action-text">
              <span className="home-action-title">{a.title}</span>
              <span className="home-action-sub">{a.text}</span>
            </span>
            <Icon name="next" size={18} />
          </button>
        ))}
      </div>

      <div className="home-lists">
        <Card title="Recently used songs">
          {recentSongs.length ? (
            <ul className="home-list">
              {recentSongs.map((s) => (
                <li key={s.id}>
                  <button onClick={() => p.onOpenSong(s.id)}>
                    <Icon name="music" size={16} />
                    <span className="home-list-text">
                      <span className="home-list-title" lang={songLanguage(s)}>{s.title || s.altTitle || "Untitled song"}</span>
                      {s.artist && <span className="home-list-sub">{s.artist}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="muted small">Songs you present will appear here.</p>}
        </Card>
        <SavedVerses bookmarks={saved} readingBibleId={p.readingBibleId} onOpen={p.onOpenVerse} />
      </div>
    </Page>
  );
}

function NowPresenting({ summary, projector, displayName }: { summary: PresentingSummary; projector: ProjectorStatus; displayName: string }) {
  return (
    <section className="home-now" aria-label="Now presenting">
      <span className="home-action-icon"><Icon name={summary.kind === "song" ? "music" : "book"} size={20} /></span>
      <div className="home-now-text">
        <span className="home-now-label">Now presenting</span>
        <strong>{summary.title}</strong>
        <span className="muted small">{summary.slideLabel} · slide {summary.index + 1} of {summary.count}</span>
      </div>
      {projector === "live" ? <StatusChip tone="live">Live on {displayName || "projector"}</StatusChip>
        : projector === "opening" ? <StatusChip tone="warning">Connecting…</StatusChip>
          : <StatusChip tone="off">Projector off</StatusChip>}
    </section>
  );
}

/** Verses saved in Bible Study, shown with their text from the translation they were saved in (or the one being read). */
function SavedVerses({ bookmarks, readingBibleId, onOpen }: { bookmarks: Bookmark[]; readingBibleId: string; onOpen: (bibleId: string, b: Bookmark) => void }) {
  const { library } = useLibrary();
  const bibleFor = (b: Bookmark) =>
    library.bibles.find((m) => m.abbreviation === b.translation)?.id
    ?? (library.bibles.some((m) => m.id === readingBibleId) ? readingBibleId : library.bibles[0]?.id ?? "");
  const ids = [...new Set(bookmarks.map(bibleFor).filter(Boolean))];
  const [bibles, setBibles] = useState<Map<string, BibleData>>(new Map());
  useEffect(() => {
    let live = true;
    Promise.all(ids.map((id) => loadBible(id).then((d) => [id, d] as const)))
      .then((list) => { if (live) setBibles(new Map(list.filter((x): x is [string, BibleData] => !!x[1]))); })
      .catch(() => undefined);
    return () => { live = false; };
  }, [ids.join()]);

  return (
    <Card title="Saved verses">
      {bookmarks.length ? (
        <ul className="home-list">
          {bookmarks.map((b) => {
            const id = bibleFor(b);
            const data = bibles.get(id);
            const lang = bibleLang(library.bibles.find((m) => m.id === id));
            const text = bookmarkVerses(data, b).verses.map((v) => v.text).join(" ");
            return (
              <li key={b.id}>
                <button onClick={() => id && onOpen(id, b)} disabled={!id} title="Open in the Bible">
                  <Icon name="bookmark" size={16} />
                  <span className="home-list-text">
                    <span className="home-list-title" lang={data ? lang : undefined}>{bookmarkLabel(b, data)}</span>
                    {text && <span className="home-list-sub home-verse" lang={lang}>{text}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : <p className="muted small">Verses you save in Bible Study will appear here.</p>}
    </Card>
  );
}
