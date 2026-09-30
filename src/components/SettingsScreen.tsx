import { useRef, useState, type ReactNode } from "react";
import { bibleLang } from "../lib/bible";
import { XREF_LICENSE_URL, XREF_SOURCE_URL } from "../lib/crossrefs";
import type { DisplayInfo } from "../lib/display";
import { songLanguage } from "../lib/malayalam";
import type { BibleMeta, Song } from "../lib/types";
import { useLibrary } from "../state/library";
import { ImportBibleDialog, ImportCrossRefsDialog, RemoveBibleConfirm } from "./BibleDialogs";
import { Icon, type IconName } from "./Icon";
import { Page } from "./Page";
import type { ProjectorStatus } from "./PresentationPanel";
import { SongImportDialog } from "./SongImportDialog";
import { Button, Card, cx, IconButton, StatusChip } from "./ui";

export type SettingsSection = "projector" | "bibles" | "songs" | "backup" | "keyboard" | "about";

const SECTIONS: { id: SettingsSection; label: string; icon: IconName }[] = [
  { id: "projector", label: "Projector", icon: "monitor" },
  { id: "bibles", label: "Bibles", icon: "book" },
  { id: "songs", label: "Songs", icon: "music" },
  { id: "backup", label: "Backup", icon: "download" },
  { id: "keyboard", label: "Keyboard", icon: "type" },
  { id: "about", label: "About", icon: "info" },
];

interface Props {
  section: SettingsSection;
  onSection: (s: SettingsSection) => void;
  projector: ProjectorStatus;
  displayName: string;
  displays: DisplayInfo[];
  displayIndex: number | null;
  onDisplay: (index: number | null) => void;
  onRefreshDisplays: () => void;
  onBackup: () => void;
  /** Checks the file, then asks before replacing the library */
  onRestore: (file: File) => void;
  notify: (message: string) => void;
}

/** Setup and management, kept out of the everyday Bible and Songs screens. */
export function SettingsScreen(p: Props) {
  return (
    <Page title="Settings" className="settings-page">
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          {SECTIONS.map((s) => (
            <button key={s.id} className={cx("nav-item", p.section === s.id && "on")} onClick={() => p.onSection(s.id)}
              aria-current={p.section === s.id ? "page" : undefined}>
              <Icon name={s.icon} size={18} /><span className="nav-label">{s.label}</span>
            </button>
          ))}
        </nav>
        <div className="settings-body">
          {p.section === "projector" && <ProjectorSettings {...p} />}
          {p.section === "bibles" && <BibleSettings notify={p.notify} />}
          {p.section === "songs" && <SongSettings notify={p.notify} />}
          {p.section === "backup" && <BackupSettings onBackup={p.onBackup} onRestore={p.onRestore} />}
          {p.section === "keyboard" && <KeyboardSettings />}
          {p.section === "about" && <AboutSettings />}
        </div>
      </div>
    </Page>
  );
}

function Section({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <section className="settings-section" aria-label={title}>
      <header>
        <h2>{title}</h2>
        {intro && <p className="muted">{intro}</p>}
      </header>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------- Projector

function ProjectorSettings(p: Props) {
  const status =
    p.projector === "live" ? <StatusChip tone="live">Live on {p.displayName || "projector"}</StatusChip>
      : p.projector === "opening" ? <StatusChip tone="warning">Connecting…</StatusChip>
        : <StatusChip tone="off">Off</StatusChip>;
  return (
    <Section title="Projector" intro="Choose which screen shows the slides.">
      <Card title="Status">
        <div className="settings-status">{status}</div>
        <p className="muted small">The projector turns on when you choose Present Now on a Bible passage or song.</p>
      </Card>
      <Card title="Show slides on">
        <div className="settings-inline">
          <select value={p.displayIndex ?? ""} onChange={(e) => p.onDisplay(e.target.value === "" ? null : Number(e.target.value))} aria-label="Projector display">
            <option value="">Second screen (automatic)</option>
            {p.displays.map((d) => <option key={d.index} value={d.index}>{d.name} · {d.width}×{d.height}{d.primary ? " (this screen)" : ""}</option>)}
          </select>
          <IconButton icon="refresh" label="Look for screens again" onClick={p.onRefreshDisplays} />
        </div>
        <p className="muted small">
          Automatic uses the first screen that isn't this computer's main screen. Connect the projector or TV first, then choose
          Look for screens again if it isn't listed.
        </p>
        {p.displays.length < 2 && (
          <div className="settings-note" role="note">
            <Icon name="info" size={16} />
            <span>Only one screen found. The presentation will cover this screen; press Esc to come back.</span>
          </div>
        )}
      </Card>
    </Section>
  );
}

// ---------------------------------------------------------------- Bibles

function BibleSettings({ notify }: { notify: (m: string) => void }) {
  const { library } = useLibrary();
  const [dialog, setDialog] = useState<"import" | "xrefs" | null>(null);
  const [removing, setRemoving] = useState<BibleMeta | null>(null);
  const x = library.crossRefs;
  return (
    <Section title="Bibles" intro="The translations you can read and present. Bible text is kept on this computer, so it works offline.">
      <Card title="Your Bibles" actions={<Button size="sm" icon="plus" onClick={() => setDialog("import")}>Import a Bible</Button>}>
        {library.bibles.length === 0 ? (
          <p className="muted">No Bibles yet. Import a Bible file from a source you're allowed to use, such as the public-domain KJV.</p>
        ) : (
          <ul className="settings-list">
            {library.bibles.map((b) => (
              <li key={b.id} className="settings-row">
                <span className="settings-row-leading"><Icon name="book" /></span>
                <span className="settings-row-text">
                  <span className="settings-row-title" lang={bibleLang(b)}>{b.name}</span>
                  <span className="settings-row-subtitle">
                    {b.abbreviation} · {bibleLang(b) === "ml" ? "Malayalam" : "English"} · {b.license || "No license notice recorded"}
                  </span>
                </span>
                <Button variant="quiet" size="sm" className="danger" icon="trash" onClick={() => setRemoving(b)}>Remove</Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Cross references" actions={
        <Button size="sm" icon={x ? "refresh" : "plus"} onClick={() => setDialog("xrefs")}>{x ? "Replace" : "Import"}</Button>
      }>
        <p className="muted small">Related verses shown beside the passage you're reading, from OpenBible.info.</p>
        {x ? (
          <p className="settings-fact"><Icon name="checkCircle" size={16} />{x.count.toLocaleString()} cross references imported on {new Date(x.importedAt).toLocaleDateString()}</p>
        ) : (
          <p className="settings-fact muted">Not imported yet.</p>
        )}
      </Card>

      {dialog === "import" && <ImportBibleDialog onClose={() => setDialog(null)} onImported={(m) => notify(`${m.name} imported.`)} />}
      {dialog === "xrefs" && <ImportCrossRefsDialog onClose={() => setDialog(null)} onImported={() => notify("Cross references imported.")} />}
      {removing && <RemoveBibleConfirm bible={removing} onCancel={() => setRemoving(null)}
        onDone={() => { notify(`${removing.name} removed.`); setRemoving(null); }} />}
    </Section>
  );
}

// ---------------------------------------------------------------- Songs

function SongSettings({ notify }: { notify: (m: string) => void }) {
  const { library } = useLibrary();
  const [importing, setImporting] = useState(false);
  const songs = library.items.filter((i): i is Song => i.kind === "song");
  const ml = songs.filter((s) => songLanguage(s) === "ml").length;
  return (
    <Section title="Songs" intro="Add songs from files. To write or edit a song, use the Songs screen.">
      <Card title="Song library" actions={<Button size="sm" icon="plus" onClick={() => setImporting(true)}>Import songs</Button>}>
        <p className="settings-fact"><Icon name="music" size={16} />
          {songs.length} {songs.length === 1 ? "song" : "songs"}{ml ? ` (${songs.length - ml} English, ${ml} Malayalam)` : ""}
        </p>
        <p className="muted small">
          Import OpenLyrics files (.xml, exported by OpenLP and other worship software) or VerseLight song files (.json).
          Songs already in your library are skipped.
        </p>
      </Card>
      {importing && <SongImportDialog onClose={() => setImporting(false)} onImported={(n) => notify(`Imported ${n} songs.`)} />}
    </Section>
  );
}

// ---------------------------------------------------------------- Backup

function BackupSettings({ onBackup, onRestore }: { onBackup: () => void; onRestore: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <Section title="Backup" intro="Keep a copy of your songs, backgrounds, saved verses and settings in one file.">
      <Card title="Back up">
        <p className="muted small">Saves a backup file you can keep on a USB stick or cloud drive. Bible texts aren't included; keep your Bible files too.</p>
        <div><Button icon="download" onClick={onBackup}>Back up library…</Button></div>
      </Card>
      <Card title="Restore">
        <p className="muted small">Replaces everything in VerseLight with a backup. You'll be asked to confirm first.</p>
        <div><Button icon="upload" onClick={() => input.current?.click()}>Restore from backup…</Button></div>
        <input ref={input} type="file" accept=".json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onRestore(f); e.target.value = ""; }} />
      </Card>
    </Section>
  );
}

// ---------------------------------------------------------------- Keyboard

const KEYS: [string[], string][] = [
  [["Space", "→", "↓", "Page Down"], "Next slide"],
  [["←", "↑", "Page Up"], "Previous slide"],
  [["B"], "Black screen on or off"],
  [["Esc"], "Stop presentation (in a text box, Esc leaves the box first)"],
  [["Enter"], "Present the selected Bible verses"],
];

function KeyboardSettings() {
  return (
    <Section title="Keyboard" intro="These keys work while presenting, as long as you're not typing in a box. Most presentation clickers work too.">
      <Card>
        <table className="settings-keys">
          <tbody>
            {KEYS.map(([keys, action]) => (
              <tr key={action}>
                <td>{keys.map((k) => <kbd key={k}>{k}</kbd>)}</td>
                <td>{action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </Section>
  );
}

// ---------------------------------------------------------------- About

function AboutSettings() {
  const { library } = useLibrary();
  return (
    <Section title="About">
      <Card>
        <div className="settings-about">
          <span className="brand-mark" aria-hidden><span /></span>
          <div>
            <strong>VerseLight</strong>
            <p className="muted small">Version {__APP_VERSION__} · Works offline; your library is stored on this computer.</p>
          </div>
        </div>
      </Card>
      <Card title="Credits">
        <ul className="settings-credits">
          {library.bibles.map((b) => <li key={b.id}><strong>{b.name}</strong>: {b.license || "No license notice recorded"}</li>)}
          {library.crossRefs && (
            <li>
              <strong>Cross references</strong>: <a href={XREF_SOURCE_URL} target="_blank" rel="noreferrer">OpenBible.info</a>, licensed under{" "}
              <a href={XREF_LICENSE_URL} target="_blank" rel="noreferrer">CC BY 4.0</a>.
            </li>
          )}
          <li><strong>Background gallery</strong>: original artwork made by VerseLight.</li>
          <li><strong>Fonts</strong>: Lora, Crimson Pro, Montserrat, Source Sans 3, Manrope and Noto Malayalam, under the SIL Open Font License.</li>
        </ul>
      </Card>
    </Section>
  );
}
