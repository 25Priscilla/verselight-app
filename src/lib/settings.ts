import { readData, writeData } from "./storage";

/**
 * App settings kept in their own file, apart from library.json, so changing one never rewrites
 * the songs, Bibles or anything else in the library.
 */
const FILE = "settings.json";

export interface Settings {
  /** Church logo in the projector's bottom-right corner */
  showLogo: boolean;
}

export const DEFAULT_SETTINGS: Settings = { showLogo: true };

/** The saved settings; anything missing or unreadable uses its default. */
export async function loadSettings(): Promise<Settings> {
  try {
    const raw = await readData(FILE);
    return { ...DEFAULT_SETTINGS, ...(raw ? JSON.parse(raw) as Partial<Settings> : {}) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export const saveSettings = (settings: Settings) => writeData(FILE, JSON.stringify(settings));
