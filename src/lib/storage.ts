import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "./env";

/**
 * Offline key/value storage.
 * Desktop: JSON files in the OS app-data folder (via Rust commands).
 * Browser (dev preview only): localStorage.
 */
export async function readData(name: string): Promise<string | null> {
  if (isTauri()) return (await invoke<string | null>("read_data", { name })) ?? null;
  return localStorage.getItem("verselight:" + name);
}

export async function writeData(name: string, contents: string): Promise<void> {
  if (isTauri()) return invoke("write_data", { name, contents });
  localStorage.setItem("verselight:" + name, contents);
}

export async function deleteData(name: string): Promise<void> {
  if (isTauri()) return invoke("delete_data", { name });
  localStorage.removeItem("verselight:" + name);
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
