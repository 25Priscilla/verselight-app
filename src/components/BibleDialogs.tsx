import { useCallback, useRef, useState } from "react";
import { bibleFileName, ESV_BIBLE_ID, parseBibleFile, saveBible, type BibleData } from "../lib/bible";
import {
  clearEsv, ESV_ABBREVIATION, ESV_COPYRIGHT, ESV_KEY_URL, ESV_NAME, ESV_SITE_URL, ESV_TERMS_URL, EsvError, saveEsvKey, testEsvKey,
} from "../lib/esv";
import { deleteData } from "../lib/storage";
import type { BibleMeta } from "../lib/types";
import { parseCrossRefFile, saveCrossRefs, XREF_CHANGES, XREF_LICENSE_URL, XREF_SOURCE_URL, type CrossRefData } from "../lib/crossrefs";
import { useLibrary } from "../state/library";
import { Button, ConfirmDialog, Field, Modal } from "./ui";

export function ImportBibleDialog({ onClose, onImported }: { onClose: () => void; onImported: (meta: BibleMeta) => void }) {
  const { update } = useLibrary();
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<BibleData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  /** Reading the ESV online with an API key, instead of importing a file */
  const [esv, setEsv] = useState(false);

  const onFile = async (file: File) => {
    setError(null);
    try {
      const data = parseBibleFile(await file.text());
      const verses = data.books.reduce((n, b) => n + b.chapters.reduce((m, c) => m + c.length, 0), 0);
      if (verses === 0) throw new Error("The file has no verses in it.");
      const name = data.name || file.name.replace(/\.json$/i, "");
      // A licensed ESV file: suggest Crossway's notice if the file has none.
      const license = data.license || (/\bESV\b|English Standard Version/i.test(`${name} ${data.abbreviation}`) ? ESV_COPYRIGHT : "");
      setPending({ ...data, name, license });
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

  if (esv) return <ConnectEsv onBack={() => setEsv(false)} onClose={onClose} onConnected={onImported} />;

  return (
    <Modal title="Import a Bible" onClose={onClose}
      actions={pending && <>
        <Button variant="quiet" onClick={() => setPending(null)}>Choose another file</Button>
        <Button variant="primary" disabled={!confirmed || !pending.abbreviation.trim() || busy} onClick={save}>Import Bible</Button>
      </>}>
      <p className="muted">
        Choose a Bible JSON file from a source you're allowed to use. Verses display as they appear in the file (a KJV's curly-brace marks for italic words and margin notes are tidied away).
        Public-domain translations like the KJV are free to use; copyrighted ones like the NIV need the publisher's permission.
      </p>
      <input ref={input} type="file" accept=".json,application/json" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
      {!pending && (
        <Button variant="primary" icon="download" onClick={() => input.current?.click()}>Choose file</Button>
      )}
      {!pending && (
        <p className="muted small">
          The ESV (English Standard Version) is copyrighted by Crossway and can't be kept on a computer without their permission.
          You can read and present it online with your church's free ESV API key.{" "}
          <Button variant="quiet" size="sm" onClick={() => setEsv(true)}>Use the ESV online…</Button>
        </p>
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
        </>
      )}
    </Modal>
  );
}

/**
 * The ESV read online through Crossway's ESV API, with the church's own key. Nothing is downloaded or saved but the key,
 * which stays on this computer (not in the library or its backups).
 */
function ConnectEsv({ onBack, onClose, onConnected }: { onBack: () => void; onClose: () => void; onConnected: (meta: BibleMeta) => void }) {
  const { library, update } = useLibrary();
  const connected = library.bibles.some((b) => b.id === ESV_BIBLE_ID);
  const [key, setKey] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      await testEsvKey(key);
      await saveEsvKey(key);
      const meta: BibleMeta = {
        id: ESV_BIBLE_ID, name: ESV_NAME, abbreviation: ESV_ABBREVIATION, license: ESV_COPYRIGHT,
        language: "en", bookCount: 66, importedAt: Date.now(), source: "esv-api",
      };
      update((lib) => ({ ...lib, bibles: lib.bibles.some((b) => b.id === meta.id) ? lib.bibles : [...lib.bibles, meta] }));
      onConnected(meta);
      onClose();
    } catch (e) {
      setError(e instanceof EsvError ? e.message : `The key couldn't be saved: ${e}`);
      setBusy(false);
    }
  };

  return (
    <Modal title={connected ? "Change the ESV API key" : "Use the ESV online"} onClose={onClose}
      actions={<>
        <Button variant="quiet" onClick={onBack}>Back</Button>
        <Button variant="primary" disabled={!agreed || !key.trim() || busy} onClick={connect}>{busy ? "Checking…" : connected ? "Save key" : "Connect ESV"}</Button>
      </>}>
      <p className="muted">
        VerseLight reads the ESV from Crossway's <a href={ESV_SITE_URL} target="_blank" rel="noreferrer">ESV API</a> as you read and present,
        so it needs an internet connection. It never saves ESV text: only a few chapters (500 verses at most) are kept in memory, as
        Crossway's terms require. Bible Study's word counts aren't available for the ESV.
      </p>
      <p className="muted small">
        Create a free key for your church at <a href={ESV_KEY_URL} target="_blank" rel="noreferrer">api.esv.org</a>. The key is kept on this
        computer only. It isn't included in library backups, and it mustn't be shared.
      </p>
      <Field label="ESV API key">
        <input type="password" autoComplete="off" spellCheck={false} value={key} onChange={(e) => setKey(e.target.value)} />
      </Field>
      <label className="check">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        <span>We will use the ESV for non-commercial church use, under the <a href={ESV_TERMS_URL} target="_blank" rel="noreferrer">ESV API terms</a>.</span>
      </label>
      {error && <div className="alert">{error}</div>}
    </Modal>
  );
}

/** Deletes a Bible's text from this computer and removes it from the library. */
export function useRemoveBible() {
  const { update } = useLibrary();
  return useCallback(async (id: string) => {
    // The ESV has no text on this computer; removing it forgets the API key and the verses in memory.
    if (id === ESV_BIBLE_ID) await clearEsv();
    else await deleteData(bibleFileName(id)).catch(() => undefined);
    update((lib) => ({ ...lib, bibles: lib.bibles.filter((b) => b.id !== id) }));
  }, [update]);
}

/** Asks before removing a Bible. */
export function RemoveBibleConfirm({ bible, onDone, onCancel }: { bible: BibleMeta; onDone: () => void; onCancel: () => void }) {
  const remove = useRemoveBible();
  return (
    <ConfirmDialog title={`Remove ${bible.abbreviation || bible.name}?`} confirmLabel="Remove Bible"
      message={bible.id === ESV_BIBLE_ID
        ? <>The ESV and your ESV API key will be removed from this computer. To use it again, connect it with your key. Passages already in a presentation keep their text.</>
        : <>{bible.name} will be deleted from this computer. To use it again, you'll need to import the Bible file again. Passages already in a presentation keep their text.</>}
      onCancel={onCancel} onConfirm={() => { remove(bible.id); onDone(); }} />
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
    <Modal title="Import cross references" onClose={onClose}
      actions={data && <>
        <Button variant="primary" disabled={busy} onClick={save}>Import cross references</Button>
        <Button variant="quiet" onClick={onClose}>Cancel</Button>
      </>}>
      <p className="muted small">
        Choose <code>cross_references.txt</code> from OpenBible.info. Run <code>npm run fetch-crossrefs</code> to download it into the
        <code> bibles</code> folder. The data is kept on this computer, so cross references work offline.
      </p>
      <Button icon="plus" disabled={busy} onClick={() => input.current?.click()}>{busy ? "Reading…" : "Choose file"}</Button>
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
        </div>
      )}
    </Modal>
  );
}
