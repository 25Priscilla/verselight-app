/**
 * Languages a song can be written in. Codes are BCP-47, so they can be used directly as `lang` attributes,
 * which lets the browser shape Malayalam, Tamil, Kannada and other scripts correctly.
 */
import type { SongLanguage } from "./types";

export interface LanguageInfo {
  code: SongLanguage;
  /** English name, e.g. "Malayalam" */
  name: string;
  /** The name in its own script, e.g. "മലയാളം" (same as `name` for languages in Latin script) */
  native: string;
}

export const LANGUAGES: LanguageInfo[] = [
  { code: "en", name: "English", native: "English" },
  { code: "ml", name: "Malayalam", native: "മലയാളം" },
  { code: "ta", name: "Tamil", native: "தமிழ்" },
  { code: "kn", name: "Kannada", native: "ಕನ್ನಡ" },
  { code: "te", name: "Telugu", native: "తెలుగు" },
  { code: "hi", name: "Hindi", native: "हिन्दी" },
  { code: "mr", name: "Marathi", native: "मराठी" },
  { code: "bn", name: "Bengali", native: "বাংলা" },
  { code: "gu", name: "Gujarati", native: "ગુજરાતી" },
  { code: "pa", name: "Punjabi", native: "ਪੰਜਾਬੀ" },
  { code: "or", name: "Odia", native: "ଓଡ଼ିଆ" },
  { code: "ne", name: "Nepali", native: "नेपाली" },
  { code: "es", name: "Spanish", native: "Español" },
  { code: "pt", name: "Portuguese", native: "Português" },
  { code: "fr", name: "French", native: "Français" },
  { code: "de", name: "German", native: "Deutsch" },
  { code: "sw", name: "Swahili", native: "Kiswahili" },
  { code: "ko", name: "Korean", native: "한국어" },
  { code: "zh", name: "Chinese", native: "中文" },
  { code: "und", name: "Other language", native: "Other language" },
];

const byCode = new Map(LANGUAGES.map((l) => [l.code, l]));

/** "Malayalam"; an unknown code is shown as it is. */
export const languageName = (code: SongLanguage) => byCode.get(code)?.name ?? code;

/** "Malayalam · മലയാളം", or just "English" when both are the same. */
export function languageLabel(code: SongLanguage): string {
  const l = byCode.get(code);
  if (!l) return code;
  return l.native === l.name ? l.name : `${l.name} · ${l.native}`;
}

/** Indian scripts, each with the language it is most often used for in songs. Latin text is treated as English. */
const SCRIPTS: { lang: SongLanguage; re: RegExp }[] = [
  { lang: "ml", re: /[ഀ-ൿ]/g },
  { lang: "ta", re: /[஀-௿]/g },
  { lang: "kn", re: /[ಀ-೿]/g },
  { lang: "te", re: /[ఀ-౿]/g },
  { lang: "hi", re: /[ऀ-ॿ]/g },
  { lang: "bn", re: /[ঀ-৿]/g },
  { lang: "pa", re: /[਀-੿]/g },
  { lang: "gu", re: /[઀-૿]/g },
  { lang: "or", re: /[଀-୿]/g },
  { lang: "ko", re: /[가-힯]/g },
  { lang: "zh", re: /[一-鿿]/g },
];

/**
 * The language of some text, from the script most of its letters are written in.
 * Text with no letters from these scripts (English, or a song not typed yet) is "en".
 */
export function detectScript(text: string): SongLanguage {
  let best: SongLanguage = "en";
  let most = 0;
  for (const { lang, re } of SCRIPTS) {
    const n = text.match(re)?.length ?? 0;
    if (n > most) { most = n; best = lang; }
  }
  return best;
}
