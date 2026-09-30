/**
 * Which screen the projector window goes on. Pure logic, so it can be tested without a real projector.
 *
 * The projector is simply a second display that the operating system exposes (HDMI, another cable, or a wireless
 * display Windows shows as a screen). The laptop's main screen stays the operator's control screen.
 */
import type { DisplayInfo } from "./display";

/** The operator's choice in Settings → Projector. `id` null means automatic. `index` is the pre-Phase 6 setting. */
export interface DisplayChoice {
  id: string | null;
  index: number | null;
}

export type DisplayPick =
  | { ok: true; display: DisplayInfo }
  | { ok: false; reason: "none" | "no-second" | "unavailable"; message: string };

export const NO_SECOND_DISPLAY =
  "No second screen found, so the slides are shown in the preview only. Connect the projector (HDMI, another cable, " +
  "or a wireless display Windows shows as a second screen), then choose Start presenting.";

/** A readable name: "\\.\DISPLAY2" → "Display 2". */
export function displayLabel(d: Pick<DisplayInfo, "name" | "index">): string {
  const m = /DISPLAY(\d+)$/i.exec(d.name.trim());
  if (m) return `Display ${m[1]}`;
  return d.name.trim() || `Display ${d.index + 1}`;
}

/** The full description used in Settings: "Display 2 · 1920×1080 · this computer's main screen". */
export function displayDescription(d: DisplayInfo): string {
  return `${displayLabel(d)} · ${d.width}×${d.height}${d.primary ? " · this computer's main screen" : ""}`;
}

/** The screens other than the operator's main screen. */
export const secondDisplays = (displays: DisplayInfo[]) => displays.filter((d) => !d.primary);

/**
 * Decides where the projector window opens.
 * - A chosen screen is used only if it is connected now (by identity, not list position, which changes on hot-plug).
 * - Automatic uses the first screen that isn't the main one, and never covers the operator's own screen.
 *   (The main screen is only used when the operator picks it on purpose, e.g. to rehearse.)
 */
export function chooseDisplay(displays: DisplayInfo[], choice: DisplayChoice): DisplayPick {
  if (displays.length === 0) return { ok: false, reason: "none", message: "No screens were found. Check the display connection and try again." };
  if (choice.id) {
    const d = displays.find((x) => x.id === choice.id);
    if (d) return { ok: true, display: d };
    return {
      ok: false, reason: "unavailable",
      message: "The screen chosen for the projector isn't connected. Connect it, or choose another screen in Settings → Projector.",
    };
  }
  // Settings saved before Phase 6 stored a list position; honour it while that screen is still a second screen.
  const legacy = choice.index !== null ? displays.find((x) => x.index === choice.index) : undefined;
  if (legacy && !legacy.primary) return { ok: true, display: legacy };
  const second = secondDisplays(displays)[0];
  return second ? { ok: true, display: second } : { ok: false, reason: "no-second", message: NO_SECOND_DISPLAY };
}

/** Is the screen the projector window is on still connected? */
export const displayConnected = (displays: DisplayInfo[], id: string) => displays.some((d) => d.id === id);

/** Two display lists describe the same screens (so a refresh needn't re-render). */
export const sameDisplays = (a: DisplayInfo[], b: DisplayInfo[]) =>
  a.length === b.length && a.every((d, i) => {
    const e = b[i];
    return d.id === e.id && d.index === e.index && d.width === e.width && d.height === e.height && d.primary === e.primary && d.x === e.x && d.y === e.y;
  });
