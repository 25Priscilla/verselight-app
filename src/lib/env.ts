/** True when running inside the Tauri desktop shell (not a plain browser). */
export const isTauri = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
