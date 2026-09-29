import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { isTauri } from "./env";

export interface DisplayInfo {
  index: number;
  name: string;
  width: number;
  height: number;
  primary: boolean;
}

export async function listDisplays(): Promise<DisplayInfo[]> {
  if (!isTauri()) {
    return [{ index: 0, name: "Browser window", width: screen.width, height: screen.height, primary: true }];
  }
  return invoke<DisplayInfo[]>("list_displays");
}

let browserWindow: Window | null = null;

/** Opens the full-screen projector window on the chosen display. */
/** Opens the full-screen projector window; resolves with the name of the display it opened on. */
export async function openPresentation(displayIndex: number | null): Promise<string> {
  if (isTauri()) return invoke<string>("open_presentation", { displayIndex });
  browserWindow = window.open("#/present", "verselight-projector", "width=1280,height=720");
  return "Browser window";
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
