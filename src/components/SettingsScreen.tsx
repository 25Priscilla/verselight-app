import { useRef, useState, type ReactNode } from "react";
import { bibleLang } from "../lib/bible";
import { XREF_LICENSE_URL, XREF_SOURCE_URL } from "../lib/crossrefs";
import type { DisplayInfo } from "../lib/display";
import { songLanguage } from "../lib/malayalam";
import { chooseDisplay, displayDescription, displayLabel, secondDisplays, type DisplayChoice } from "../lib/projector";
import type { BibleMeta, Song } from "../lib/types";
import { useLibrary } from "../state/library";
import { ImportBibleDialog, ImportCrossRefsDialog, RemoveBibleConfirm } from "./BibleDialogs";
import { Icon, type IconName } from "./Icon";
import { Page } from "./Page";
import type { ProjectorStatus } from "./PresentationPanel";
import { ShortcutTable } from "./ShortcutTable";
import { SongImportDialog } from "./SongImportDialog";
import { Button, Card, Checkbox, cx, IconButton, StatusChip } from "./ui";

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
  /** False in a web browser, where the projector is a separate browser window */
  canChooseDisplays: boolean;
  displayChoice: DisplayChoice;
  /** Why the projector isn't showing the slides, or null */
  projectorProblem: string | null;
  /** Choose a screen by id; null is automatic */
  onDisplay: (id: string | null) => void;
  onRefreshDisplays: () => void;
  /** Church logo in the projector's bottom-right corner */
  showLogo: boolean;
  onShowLogo: (on: boolean) => void;
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
  const intro = "The projector is used as a second screen: connect it by HDMI or another cable, or with a wireless display that Windows shows as a screen. " +
    "This computer keeps the controls, and the projector shows only the slide.";
  if (!p.canChooseDisplays) {
    return (
      <Section title="Projector" intro={intro}>
        <Card title="Status">
          <div className="settings-status">{status}</div>
          <p className="muted small">
            In a web browser the slides open in a separate browser window. Drag it to the projector screen and make it full
            screen (F11). The VerseLight desktop app finds the projector screen and opens the slides on it for you.
          </p>
        </Card>
        <LogoCard {...p} />
      </Section>
    );
  }
  const chosenId = p.displayChoice.id;
  // The screen that Automatic (or a setting saved before display ids) would use right now.
  const pick = chooseDisplay(p.displays, { id: null, index: p.displayChoice.index });
  const chosenMissing = !!chosenId && !p.displays.some((d) => d.id === chosenId);
  const onlyOne = secondDisplays(p.displays).length === 0;
  const chosen = p.displays.find((d) => d.id === chosenId);
  return (
    <Section title="Projector" intro={intro}>
      <Card title="Status">
        <div className="settings-status">{status}</div>
        <p className="muted small">The projector turns on when you choose Present Now on a Bible passage or song, or Start presenting.</p>
        {p.projector === "off" && p.projectorProblem && (
          <div className="settings-note" role="note"><Icon name="info" size={16} /><span>{p.projectorProblem}</span></div>
        )}
      </Card>
      <Card title="Show slides on">
        <div className="settings-inline">
          <select value={chosenId ?? ""} onChange={(e) => p.onDisplay(e.target.value === "" ? null : e.target.value)} aria-label="Projector display">
            <option value="">Automatic: the second screen{pick.ok ? ` (now ${displayLabel(pick.display)})` : ""}</option>
            {p.displays.map((d) => <option key={d.id} value={d.id}>{displayDescription(d)}</option>)}
            {chosenMissing && <option value={chosenId!}>Chosen screen (not connected)</option>}
          </select>
          <IconButton icon="refresh" label="Look for screens again" onClick={p.onRefreshDisplays} />
        </div>
        <p className="muted small">
          {p.displays.length} {p.displays.length === 1 ? "screen" : "screens"} found. Automatic uses the first screen that isn't this
          computer's main screen, so the slides never cover your controls. Connect the projector first; new screens appear here by themselves,
          or choose Look for screens again.
        </p>
        {chosenMissing ? (
          <div className="settings-note warning" role="alert">
            <Icon name="info" size={16} />
            <span>The chosen screen isn't connected. Connect it, or choose Automatic or another screen.</span>
          </div>
        ) : onlyOne ? (
          <div className="settings-note" role="note">
            <Icon name="info" size={16} />
            <span>
              No second screen found, so there is nowhere separate to show the slides yet. Present Now still works, with the slides in the
              preview on this screen. {chosen?.primary && "Because you chose this computer's main screen, the slides will cover it: press Esc to come back."}
            </span>
          </div>
        ) : chosen?.primary ? (
          <div className="settings-note" role="note">
            <Icon name="info" size={16} />
            <span>This is the computer's main screen, so the slides will cover your controls. Press Esc to come back.</span>
          </div>
        ) : null}
      </Card>
      <LogoCard {...p} />
    </Section>
  );
}

function LogoCard({ showLogo, onShowLogo }: Pick<Props, "showLogo" | "onShowLogo">) {
  return (
    <Card title="Church logo">
      <Checkbox label="Show the church logo on the projector" checked={showLogo} onChange={(e) => onShowLogo(e.target.checked)} />
      <p className="muted small">Shown small in the bottom-right corner on every Bible and song slide. It hides with Black.</p>
    </Card>
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
        {!library.bibles.some((b) => bibleLang(b) === "ml") && (
          <p className="muted small" role="note">
            No Malayalam Bible yet. To add the Malayalam Bible 1910 (CC BY-SA 4.0), run <code>npm run fetch-malayalam-bible</code>,
            then choose <strong>Import a Bible</strong> and pick <code>bibles/mal1910.verselight.json</code>.
          </p>
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

function KeyboardSettings() {
  return (
    <Section title="Keyboard" intro="These keys work while presenting, as long as you're not typing in a box. Most presentation clickers work too.">
      <Card>
        <ShortcutTable />
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
