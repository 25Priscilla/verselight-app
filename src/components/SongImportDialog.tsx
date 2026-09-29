import { useMemo, useRef, useState } from "react";
import { planSongImport, readSongFiles, toSong, type SongFile } from "../lib/songImport";
import { useLibrary } from "../state/library";
import { Button, Modal } from "./ui";

export function SongImportDialog({ onClose, onImported }: { onClose: () => void; onImported: (count: number) => void }) {
  const { library, update } = useLibrary();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<SongFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const plan = useMemo(() => (file ? planSongImport(file, library.items) : null), [file, library.items]);

  const [skipped, setSkipped] = useState<string[]>([]);
  const onFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setError(null);
    setConfirmed(false);
    const { file: read, errors } = await readSongFiles(Array.from(list));
    setSkipped(errors);
    if (read.songs.length === 0) {
      setFile(null);
      setError(errors.length ? "None of the files could be read." : "The files have no songs in them.");
    } else setFile(read);
  };

  const importSongs = () => {
    if (!plan || plan.fresh.length === 0) return;
    const songs = plan.fresh.map(toSong);
    update((lib) => ({ ...lib, items: [...lib.items, ...songs] }));
    onImported(songs.length);
    onClose();
  };

  return (
    <Modal title="Import songs" onClose={onClose}
      actions={file && plan && <>
        <Button variant="primary" disabled={!confirmed || plan.fresh.length === 0} onClick={importSongs}>
          {plan.fresh.length === 0 ? "Nothing new to import" : `Import ${plan.fresh.length} songs`}
        </Button>
        <Button variant="quiet" onClick={onClose}>Cancel</Button>
      </>}>
      <p className="muted small">
        Choose one or more song files: OpenLyrics files (<code>.xml</code>, exported by OpenLP and other worship software) or
        VerseLight song files (<code>.json</code>, such as the one made by <code>npm run fetch-hymns</code>). English and Malayalam
        songs are both supported, and songs are added exactly as they appear in the files.
      </p>
      <Button icon="plus" onClick={() => input.current?.click()}>Choose song files</Button>
      <input ref={input} type="file" accept=".json,.xml,application/json,application/xml,text/xml" multiple hidden
        onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />

      {error && <div className="alert">{error}</div>}
      {skipped.length > 0 && (
        <details className="import-skipped">
          <summary>{skipped.length} {skipped.length === 1 ? "file was" : "files were"} skipped</summary>
          <ul>{skipped.map((e) => <li key={e}>{e}</li>)}</ul>
        </details>
      )}

      {file && plan && (
        <div className="import-summary">
          <strong>{file.name}</strong>
          <p className="small">
            {file.songs.length} {file.songs.length === 1 ? "song" : "songs"} found
            {(() => { const ml = file.songs.filter((x) => x.language === "ml").length; return ml ? ` (${ml} Malayalam)` : ""; })()}. {plan.fresh.length} will be added
            {plan.duplicates > 0 && `; ${plan.duplicates} are already in your library and will be skipped`}.
          </p>
          {file.license && <p className="muted small">{file.license}</p>}
          {file.source && <p className="muted small">Source: {file.source}</p>}
          <label className="check">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            I've checked these songs can be used and projected where our church is.
          </label>
        </div>
      )}
    </Modal>
  );
}
