import { useEffect, useMemo, useState } from "react";
import { bibleLang, getVerses, loadBible, type BibleData } from "../lib/bible";
import { bookmarkLabel, bookmarkVerses, lastVerse } from "../lib/bookmarks";
import type { DisplayInfo } from "../lib/display";
import { featuredBibleId, featuredPosition } from "../lib/featuredVerse";
import { galleryUrl } from "../lib/gallery";
import { songLanguage } from "../lib/malayalam";
import { chooseDisplay, displayDescription, type DisplayChoice } from "../lib/projector";
import type { ScriptureSpec } from "../lib/session";
import type { Bookmark, Song } from "../lib/types";
import { useLibrary } from "../state/library";
import { Icon, type IconName } from "./Icon";
import { Page } from "./Page";
import type { ProjectorStatus } from "./PresentationPanel";
import type { Tool } from "./Sidebar";
import { Button, IconButton, StatusChip, cx } from "./ui";

/** What is loaded in the presentation, for the "Now presenting" card */
export interface PresentingSummary {
  kind: "scripture" | "song";
  title: string;
  /** e.g. "Genesis 1:3" or "Chorus" */
  slideLabel: string;
  index: number;
  count: number;
}

/** A verse or passage to open in the Bible screen */
export type VersePlace = Pick<Bookmark, "book" | "chapter" | "verse" | "to">;

interface Props {
  presenting: PresentingSummary | null;
  projector: ProjectorStatus;
  displayName: string;
  /** Translation used to show saved verses when the one they were saved from isn't imported */
  readingBibleId: string;
  /** The screens the operating system reports (empty in a web browser) */
  displays: DisplayInfo[];
  canChooseDisplays: boolean;
  displayChoice: DisplayChoice;
  /** Why the projector isn't showing the slides, or null */
  projectorProblem: string | null;
  /** English + Malayalam side by side needs a Bible in each language */
  canParallel: boolean;
  onFindVerse: () => void;
  onFindSong: () => void;
  onProjector: () => void;
  onRefreshDisplays: () => void;
  onManage: () => void;
  onTool: (t: Tool) => void;
  onHelp: () => void;
  onOpenSong: (id: string) => void;
  onOpenVerse: (bibleId: string, place: VersePlace) => void;
  /** ▶ Present Now, exactly as on the Bible and Songs screens */
  onPresentVerse: (spec: ScriptureSpec) => void;
  onPresentSong: (song: Song) => void;
}

const RECENT = 4;

function greeting(now: Date) {
  const h = now.getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/** The start screen: today's verse, the main jobs, what was used recently, the tools, and the projector. */
export function HomeScreen(p: Props) {
  const { library } = useLibrary();

  const recentSongs = useMemo(() => library.items
    .filter((i): i is Song => i.kind === "song" && !!i.lastUsedAt)
    .sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0))
    .slice(0, RECENT), [library.items]);
  const saved = library.bookmarks.slice(0, RECENT);

  const actions: { icon: IconName; title: string; text: string; tone: string; onClick: () => void }[] = [
    { icon: "book", title: "Bible", text: "Read and search Scripture", tone: "bible", onClick: p.onFindVerse },
    { icon: "music", title: "Songs", text: "Browse, edit and present songs", tone: "songs", onClick: p.onFindSong },
    { icon: "monitor", title: "Projector", text: "Choose the screen for the slides", tone: "projector", onClick: p.onProjector },
    { icon: "folder", title: "Library", text: "Bibles, song files and backups", tone: "library", onClick: p.onManage },
  ];

  return (
    <Page title={greeting(new Date())} intro="Let's share God's Word together." className="home-page">
      {p.presenting && <NowPresenting summary={p.presenting} projector={p.projector} displayName={p.displayName} />}

      <div className="home-grid">
        <div className="home-main">
          <FeaturedVerse readingBibleId={p.readingBibleId} onManage={p.onManage} onOpen={p.onOpenVerse} onPresent={p.onPresentVerse} />

          <nav className="home-cards" aria-label="Main actions">
            {actions.map((a) => (
              <button key={a.title} className={cx("home-card", `tone-${a.tone}`)} onClick={a.onClick}>
                <span className="home-card-icon"><Icon name={a.icon} size={22} /></span>
                <span className="home-card-title">{a.title}</span>
                <span className="home-card-sub">{a.text}</span>
                <Icon name="next" size={16} />
              </button>
            ))}
          </nav>

          <div className="home-split">
            <section className="home-panel" aria-labelledby="home-recent">
              <h2 id="home-recent" className="home-panel-title"><Icon name="clock" size={18} />Recent</h2>
              <RecentSongs songs={recentSongs} onOpen={p.onOpenSong} onPresent={p.onPresentSong} />
              <SavedVerses bookmarks={saved} readingBibleId={p.readingBibleId} onOpen={p.onOpenVerse} onPresent={p.onPresentVerse} />
            </section>
            <QuickTools canParallel={p.canParallel} onTool={p.onTool} onHelp={p.onHelp} />
          </div>
        </div>

        <div className="home-rail">
          <ProjectorPanel {...p} />
          <section className="home-panel" aria-labelledby="home-tips">
            <h2 id="home-tips" className="home-panel-title"><Icon name="info" size={18} />Quick tips</h2>
            <ul className="home-tips">
              <li><kbd>Ctrl + K</kbd><span>Search the Bible and songs from any screen</span></li>
              <li><kbd>Space</kbd><span>Next slide (<kbd>←</kbd> goes back)</span></li>
              <li><kbd>B</kbd><span>Blank the projector screen, and again to bring it back</span></li>
              <li><kbd>Esc</kbd><span>Stop presenting; your place is kept</span></li>
            </ul>
          </section>
        </div>
      </div>
    </Page>
  );
}

function NowPresenting({ summary, projector, displayName }: { summary: PresentingSummary; projector: ProjectorStatus; displayName: string }) {
  return (
    <section className="home-now" aria-label="Now presenting">
      <span className="home-card-icon"><Icon name={summary.kind === "song" ? "music" : "book"} size={20} /></span>
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

/**
 * Today's verse, read from a Bible the church imported (never quoted from memory), over the built-in
 * "Cross at dusk" background. With no Bible imported it offers the import instead.
 */
function FeaturedVerse({ readingBibleId, onManage, onOpen, onPresent }: {
  readingBibleId: string;
  onManage: () => void;
  onOpen: (bibleId: string, place: VersePlace) => void;
  onPresent: (spec: ScriptureSpec) => void;
}) {
  const { library } = useLibrary();
  const bibleId = featuredBibleId(library.bibles, readingBibleId);
  const pos = useMemo(() => featuredPosition(new Date()), []);
  const [data, setData] = useState<BibleData | null>(null);
  useEffect(() => {
    let live = true;
    setData(null);
    if (bibleId) loadBible(bibleId).then((d) => { if (live) setData(d); }).catch(() => undefined);
    return () => { live = false; };
  }, [bibleId]);

  const verses = data ? getVerses(data, pos.book, pos.chapter, pos.from, pos.to) : [];
  const text = verses.map((v) => v.text).join(" ");
  const place: VersePlace = { book: pos.book, chapter: pos.chapter, verse: pos.from, to: pos.to };
  const lang = bibleLang(library.bibles.find((b) => b.id === bibleId));
  const art = <span className="home-banner-art" style={{ backgroundImage: `url("${galleryUrl("hill")}")` }} aria-hidden />;

  if (library.bibles.length === 0) {
    return (
      <section className="home-banner" aria-label="Get started">
        {art}
        <div className="home-banner-body">
          <strong className="home-banner-title">Add a Bible to get started</strong>
          <p className="home-banner-note">VerseLight doesn't include Bible text. Import a Bible file you're allowed to use, such as the public-domain KJV.</p>
          <div className="home-banner-actions"><Button variant="primary" onClick={onManage}>Import a Bible</Button></div>
        </div>
      </section>
    );
  }

  return (
    <section className="home-banner" aria-label="Today's verse">
      {art}
      <div className="home-banner-body">
        <span className="home-banner-label">Today's verse</span>
        {bibleId && text ? (
          <>
            <blockquote className="home-banner-verse" lang={lang}>{text}</blockquote>
            <span className="home-banner-ref" lang={lang}>{bookmarkLabel(place, data)} · {data?.abbreviation}</span>
            <div className="home-banner-actions">
              <Button variant="live" icon="play" onClick={() => onPresent({ primaryId: bibleId, onScreen: "first", book: pos.book, chapter: pos.chapter, from: pos.from, to: lastVerse(place) })}>
                Present Now
              </Button>
              <Button variant="quiet" className="home-banner-open" onClick={() => onOpen(bibleId, place)}>Open in Bible</Button>
            </div>
          </>
        ) : (
          <p className="home-banner-note">{bibleId && !data ? "Loading…" : "Today's verse is shown from an imported Bible. Open the Bible to read."}</p>
        )}
      </div>
    </section>
  );
}

function RecentSongs({ songs, onOpen, onPresent }: { songs: Song[]; onOpen: (id: string) => void; onPresent: (s: Song) => void }) {
  return (
    <div className="home-group">
      <h3 className="home-group-title">Songs</h3>
      {songs.length ? (
        <ul className="home-list" aria-label="Recent songs">
          {songs.map((s) => {
            const title = s.title || s.altTitle || "Untitled song";
            return (
              <li key={s.id}>
                <button className="home-list-open" onClick={() => onOpen(s.id)} title="Open in Songs">
                  <span className="home-list-icon song"><Icon name="music" size={16} /></span>
                  <span className="home-list-text">
                    <span className="home-list-title" lang={songLanguage(s)}>{title}</span>
                    {(s.altTitle && s.altTitle !== title ? s.altTitle : s.artist) && (
                      <span className="home-list-sub">{s.altTitle && s.altTitle !== title ? s.altTitle : s.artist}</span>
                    )}
                  </span>
                </button>
                <IconButton icon="play" size="sm" label={`Present ${title}`} className="home-list-present" onClick={() => onPresent(s)} />
              </li>
            );
          })}
        </ul>
      ) : <p className="muted small">Songs you present will appear here.</p>}
    </div>
  );
}

/** Verses saved on the Bible screen, shown with their text from the translation they were saved in (or the one being read). */
function SavedVerses({ bookmarks, readingBibleId, onOpen, onPresent }: {
  bookmarks: Bookmark[];
  readingBibleId: string;
  onOpen: (bibleId: string, b: VersePlace) => void;
  onPresent: (spec: ScriptureSpec) => void;
}) {
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
    <div className="home-group">
      <h3 className="home-group-title">Saved verses</h3>
      {bookmarks.length ? (
        <ul className="home-list" aria-label="Recently saved verses">
          {bookmarks.map((b) => {
            const id = bibleFor(b);
            const data = bibles.get(id);
            const lang = bibleLang(library.bibles.find((m) => m.id === id));
            const label = bookmarkLabel(b, data);
            const text = bookmarkVerses(data, b).verses.map((v) => v.text).join(" ");
            return (
              <li key={b.id}>
                <button className="home-list-open" onClick={() => id && onOpen(id, b)} disabled={!id} title="Open in the Bible">
                  <span className="home-list-icon verse"><Icon name="bookmark" size={16} /></span>
                  <span className="home-list-text">
                    <span className="home-list-title" lang={data ? lang : undefined}>{label}</span>
                    {text && <span className="home-list-sub home-verse" lang={lang}>{text}</span>}
                  </span>
                </button>
                <IconButton icon="play" size="sm" label={`Present ${label}`} className="home-list-present" disabled={!id}
                  onClick={() => onPresent({ primaryId: id, onScreen: "first", book: b.book, chapter: b.chapter, from: b.verse, to: lastVerse(b) })} />
              </li>
            );
          })}
        </ul>
      ) : <p className="muted small">Verses you save on the Bible screen will appear here.</p>}
    </div>
  );
}

/** The Bible and song tools, each opening the view it already has on the Bible, Songs or Help screen. */
function QuickTools({ canParallel, onTool, onHelp }: { canParallel: boolean; onTool: (t: Tool) => void; onHelp: () => void }) {
  const tools: { icon: IconName; title: string; text: string; onClick: () => void; disabled?: boolean; lang?: string }[] = [
    {
      icon: "columns", title: "Parallel Bible", onClick: () => onTool("parallel"), disabled: !canParallel,
      text: canParallel ? "English and Malayalam side by side" : "Import an English and a Malayalam Bible first",
    },
    { icon: "music", title: "Malayalam songs", text: "Search in Malayalam or Manglish", onClick: () => onTool("malayalam-songs") },
    { icon: "help", title: "Presentation guide", text: "How to show a passage or song", onClick: onHelp },
  ];
  return (
    <section className="home-panel" aria-labelledby="home-tools">
      <h2 id="home-tools" className="home-panel-title"><Icon name="grid" size={18} />Quick tools</h2>
      <ul className="home-tools">
        {tools.map((t) => (
          <li key={t.title}>
            <button onClick={t.onClick} disabled={t.disabled}>
              <span className="home-list-icon tool"><Icon name={t.icon} size={16} /></span>
              <span className="home-list-text">
                <span className="home-list-title">{t.title}</span>
                <span className="home-list-sub">{t.text}</span>
              </span>
              <Icon name="next" size={14} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** What the projector is doing and which screen the slides will open on, from the same state Settings → Projector uses. */
function ProjectorPanel(p: Props) {
  const pick = p.canChooseDisplays ? chooseDisplay(p.displays, p.displayChoice) : null;
  const chip = p.projector === "live" ? <StatusChip tone="live">Live on {p.displayName || "projector"}</StatusChip>
    : p.projector === "opening" ? <StatusChip tone="warning">Connecting…</StatusChip>
      : <StatusChip tone="off">Projector off</StatusChip>;
  const screens = p.displays.length;

  return (
    <section className="home-panel home-projector" aria-labelledby="home-projector">
      <h2 id="home-projector" className="home-panel-title"><Icon name="monitor" size={18} />Projector</h2>
      <div className="home-projector-status">{chip}</div>
      {p.canChooseDisplays ? (
        <>
          <p className="home-projector-line">
            {screens === 0 ? "No screens found." : `${screens} ${screens === 1 ? "screen" : "screens"} found.`}
            {" "}<button className="home-link" onClick={p.onRefreshDisplays}>Check again</button>
          </p>
          {pick?.ok
            ? <p className="home-projector-line">Slides open on <strong>{displayDescription(pick.display)}</strong></p>
            : pick && <p className="home-projector-note" role="note"><Icon name="info" size={16} /><span>{pick.message}</span></p>}
        </>
      ) : (
        <p className="home-projector-line">In a web browser the slides open in a separate window. Drag it to the projector screen and press F11.</p>
      )}
      {p.projectorProblem && pick?.ok !== false && (
        <p className="home-projector-note" role="note"><Icon name="warning" size={16} /><span>{p.projectorProblem}</span></p>
      )}
      <div className="home-projector-actions">
        <Button size="sm" icon="settings" onClick={p.onProjector}>Projector settings</Button>
        <Button size="sm" variant="quiet" icon="help" onClick={p.onHelp}>Connection help</Button>
      </div>
    </section>
  );
}
