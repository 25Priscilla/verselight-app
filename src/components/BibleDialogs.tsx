import { useRef, useState } from "react";
import { bibleFileName, parseBibleFile, saveBible, type BibleData } from "../lib/bible";
import { deleteData } from "../lib/storage";
import type { BibleMeta } from "../lib/types";
import { parseCrossRefFile, saveCrossRefs, XREF_CHANGES, XREF_LICENSE_URL, XREF_SOURCE_URL, type CrossRefData } from "../lib/crossrefs";
import { useLibrary } from "../state/library";
import { Icon } from "./Icon";
import { Field, Modal } from "./ui";

export function ImportBibleDialog({ onClose, onImported }: { onClose: () => void; onImported: (meta: BibleMeta) => void }) {
  const { update } = useLibrary();
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<BibleData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);

  const onFile = async (file: File) => {
    setError(null);
    try {
      const data = parseBibleFile(await file.text());
      const verses = data.books.reduce((n, b) => n + b.chapters.reduce((m, c) => m + c.length, 0), 0);
      if (verses === 0) throw new Error("The file has no verses in it.");
      setPending({ ...data, name: data.name || file.name.replace(/\.json$/i, "") });
    } catch (e) {
      setError(`${file.name} couldn't be read: ${e instanceof Error ? e.message : e}`);
    }
  };

  const save = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      const meta = await saveBible(pending);
      update((lib) => ({ ...lib, bibles: [...lib.bibles, meta] }));
      onImported(meta);
      onClose();
    } catch (e) {
      setError(`The Bible couldn't be saved: ${e}`);
      setBusy(false);
    }
  };

  return (
    <Modal title="Import a Bible" onClose={onClose}>
      <p className="muted">
        Choose a Bible JSON file from a source you're allowed to use. Verses display exactly as they appear in the file.
        Public-domain translations like the KJV are free to use; copyrighted ones like the NIV need the publisher's permission.
      </p>
      <input ref={input} type="file" accept=".json,application/json" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
      {!pending && (
        <button className="btn primary" onClick={() => input.current?.click()}><Icon name="download" />Choose file</button>
      )}
      {error && <div className="alert">{error}</div>}
      {pending && (
        <>
          <p className="muted small">
            {pending.books.length} books found, {pending.books[0]?.name} to {pending.books[pending.books.length - 1]?.name}.
          </p>
          <div className="row2">
            <Field label="Name"><input value={pending.name} onChange={(e) => setPending({ ...pending, name: e.target.value })} /></Field>
            <Field label="Short name"><input value={pending.abbreviation} placeholder="KJV" onChange={(e) => setPending({ ...pending, abbreviation: e.target.value })} /></Field>
          </div>
          <Field label="Copyright or license notice">
            <textarea rows={2} value={pending.license} placeholder="Public domain" onChange={(e) => setPending({ ...pending, license: e.target.value })} />
          </Field>
          <label className="check">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            I have the right to use and display this Bible text.
          </label>
          <div className="modal-actions">
            <button className="btn ghost" onClick={() => setPending(null)}>Choose another file</button>
            <button className="btn primary" disabled={!confirmed || !pending.abbreviation.trim() || busy} onClick={save}>Import Bible</button>
          </div>
        </>
      )}
    </Modal>
  );
}

export function ManageBiblesDialog({ onClose }: { onClose: () => void }) {
  const { library, update } = useLibrary();
  const remove = async (id: string) => {
    await deleteData(bibleFileName(id)).catch(() => undefined);
    update((lib) => ({ ...lib, bibles: lib.bibles.filter((b) => b.id !== id) }));
  };
  return (
    <Modal title="Bibles" onClose={onClose}>
      {library.bibles.length === 0 ? <p className="muted">No Bibles imported.</p> : (
        <ul className="bible-list">
          {library.bibles.map((b) => (
            <li key={b.id}>
              <div>
                <strong>{b.name}</strong> <span className="muted">{b.abbreviation}</span>
                <div className="muted small">{b.license || "No license notice recorded"}</div>
              </div>
              <button className="btn ghost danger" onClick={() => remove(b.id)}>Remove</button>
            </li>
          ))}
        </ul>
      )}
      <p className="muted small">Passages already in a presentation keep their text when a Bible is removed.</p>
    </Modal>
  );
}

/** Imports OpenBible.info cross references (cross_references.txt) and keeps them for offline use. */
export function ImportCrossRefsDialog({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const { update } = useLibrary();
  const input = useRef<HTMLInputElement>(null);
  const [data, setData] = useState<CrossRefData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (file: File) => {
    setError(null);
    setBusy(true);
    try {
      setData(parseCrossRefFile(await file.text()));
    } catch (e) {
      setData(null);
      setError(`${file.name} couldn't be read: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!data) return;
    setBusy(true);
    try {
      await saveCrossRefs(data);
      update((lib) => ({ ...lib, crossRefs: { count: data.count, credit: data.credit, importedAt: Date.now() } }));
      onImported();
      onClose();
    } catch (e) {
      setError(`The cross references couldn't be saved: ${e}`);
      setBusy(false);
    }
  };

  return (
    <Modal title="Import cross references" onClose={onClose}>
      <p className="muted small">
        Choose <code>cross_references.txt</code> from OpenBible.info. Run <code>npm run fetch-crossrefs</code> to download it into the
        <code> bibles</code> folder. The data is kept on this computer, so cross references work offline.
      </p>
      <button className="btn" disabled={busy} onClick={() => input.current?.click()}><Icon name="plus" />{busy ? "Reading…" : "Choose file"}</button>
      <input ref={input} type="file" accept=".txt,.json,text/plain,application/json" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
      {error && <div className="alert">{error}</div>}
      {data && (
        <div className="import-summary">
          <strong>{data.count.toLocaleString()} cross references</strong>
          <p className="small">
            From <a href={XREF_SOURCE_URL} target="_blank" rel="noreferrer">OpenBible.info</a>, licensed under{" "}
            <a href={XREF_LICENSE_URL} target="_blank" rel="noreferrer">CC BY 4.0</a>. Drawn mainly from the public-domain Treasury of Scripture Knowledge.
          </p>
          <p className="muted small">{XREF_CHANGES} Verse text always comes from your own Bibles.</p>
          <div className="row">
            <button className="btn primary" disabled={busy} onClick={save}>Import cross references</button>
            <button className="btn ghost" onClick={onClose}>Cancel</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
