import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./env";

/**
 * Offline key/value storage for VerseLight's data files (library, Bibles, cross references).
 * Desktop: JSON files in the OS app-data folder (via Rust commands).
 * Browser (dev preview): IndexedDB, which holds tens of megabytes. A Bible is about 4–8 million characters and the
 * cross references about 7 million, far beyond localStorage's quota of roughly 5 MB per site, so localStorage is
 * only a fallback where IndexedDB is missing (e.g. the jsdom test environment).
 * Files saved to localStorage by earlier versions are moved into IndexedDB the first time they are read.
 */

const PREFIX = "verselight:";
const DB = "verselight";
const STORE = "files";

let dbPromise: Promise<IDBDatabase | null> | null = null;

/** The IndexedDB database, or null when the browser has none (or refuses to open it). */
function openDb(): Promise<IDBDatabase | null> {
  dbPromise ??= new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function request<T>(db: IDBDatabase, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = run(tx.objectStore(STORE));
    // Resolve once the transaction has committed, so a write is on disk before the caller moves on.
    tx.oncomplete = () => resolve(req.result as T);
    tx.onerror = () => reject(tx.error ?? req.error);
    tx.onabort = () => reject(tx.error ?? new Error("The browser cancelled the save."));
  });
}

function legacyGet(name: string): string | null {
  try { return localStorage.getItem(PREFIX + name); } catch { return null; }
}
function legacyRemove(name: string) {
  try { localStorage.removeItem(PREFIX + name); } catch { /* nothing to remove */ }
}

export async function readData(name: string): Promise<string | null> {
  if (isTauri()) return (await invoke<string | null>("read_data", { name })) ?? null;
  const db = await openDb();
  if (!db) return legacyGet(name);
  const value = await request<string | undefined>(db, "readonly", (s) => s.get(name));
  if (typeof value === "string") return value;
  // Saved by an earlier version: move it out of localStorage, freeing its quota.
  const old = legacyGet(name);
  if (old !== null) {
    await request(db, "readwrite", (s) => s.put(old, name));
    legacyRemove(name);
  }
  return old;
}

export async function writeData(name: string, contents: string): Promise<void> {
  if (isTauri()) return invoke("write_data", { name, contents });
  const db = await openDb();
  if (!db) return localStorage.setItem(PREFIX + name, contents);
  await request(db, "readwrite", (s) => s.put(contents, name));
  legacyRemove(name);
}

export async function deleteData(name: string): Promise<void> {
  if (isTauri()) return invoke("delete_data", { name });
  const db = await openDb();
  if (db) await request(db, "readwrite", (s) => s.delete(name));
  legacyRemove(name);
}

/** Save a text file where the user chooses. Returns false if cancelled. */
export async function saveFileAs(defaultName: string, contents: string): Promise<boolean> {
  if (isTauri()) return invoke<boolean>("save_file", { defaultName, contents });
  const url = URL.createObjectURL(new Blob([contents], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = defaultName;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}
