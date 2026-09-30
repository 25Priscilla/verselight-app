import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "./env";

export interface DisplayInfo {
  /** Stable identity of the screen (the OS display name, e.g. "\\.\DISPLAY2"), unlike its position in the list */
  id: string;
  index: number;
  name: string;
  /** Physical pixels */
  width: number;
  height: number;
  /** Top-left corner on the desktop, in physical pixels */
  x: number;
  y: number;
  primary: boolean;
}

/**
 * Can VerseLight see and choose the computer's screens? Only in the desktop app. In a web browser the projector is a
 * separate browser window that the operator drags to the projector screen themselves.
 */
export const canChooseDisplays = () => isTauri();

/** The screens the operating system reports now. Empty in a web browser. */
export async function listDisplays(): Promise<DisplayInfo[]> {
  if (!isTauri()) return [];
  return invoke<DisplayInfo[]>("list_displays");
}

let browserWindow: Window | null = null;

/**
 * Opens the full-screen projector window on the given screen, or moves the one that is already open there
 * (there is only ever one projector window). In a web browser, opens or reuses a separate browser window.
 */
export async function openPresentation(display: DisplayInfo | null): Promise<void> {
  if (isTauri()) return invoke("open_presentation", { displayId: display?.id ?? null });
  // The window name makes the browser reuse the same window rather than open another.
  browserWindow = window.open("#/present", "verselight-projector", "width=1280,height=720");
  if (!browserWindow) throw new Error("the browser blocked the projector window. Allow pop-ups for VerseLight and try again.");
}

export async function closePresentation(): Promise<void> {
  if (isTauri()) return invoke("close_presentation");
  browserWindow?.close();
  browserWindow = null;
}

/** Which window is this? The projector window is created with the label "presentation". */
export function isPresentationWindow(): boolean {
  if (location.hash.startsWith("#/present")) return true;
  return isTauri() && getCurrentWindow().label === "presentation";
}
