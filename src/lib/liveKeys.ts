import type { NavCommand } from "./bridge";

/** The operator's presentation keys on the control screen (the projector window has its own list). */
export const LIVE_KEYS: Record<string, NavCommand> = {
  " ": "next", ArrowRight: "next", ArrowDown: "next", PageDown: "next",
  ArrowLeft: "prev", ArrowUp: "prev", PageUp: "prev",
  b: "blackout", B: "blackout", ".": "blackout",
  Escape: "exit",
};

export interface LiveKeyContext {
  /** Focus is in a text box */
  typing: boolean;
  /** A dialog is open */
  modal: boolean;
  /** A menu or popover (such as a slide's background menu) is open */
  menu: boolean;
  /** Something is loaded to present */
  session: boolean;
  /** The projector window is open or opening */
  projectorOn: boolean;
}

/**
 * What a key press on the control screen does. "blur" leaves the text box first; null leaves the key alone,
 * so an open menu or dialog handles its own keys (Esc closes the menu, it doesn't stop the presentation).
 */
export function liveKeyAction(e: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey">, ctx: LiveKeyContext): NavCommand | "blur" | null {
  if (e.metaKey || e.ctrlKey || e.altKey || ctx.modal || ctx.menu) return null;
  if (ctx.typing) return e.key === "Escape" ? "blur" : null;
  const cmd = LIVE_KEYS[e.key];
  if (!cmd) return null;
  if (cmd === "exit") return ctx.projectorOn ? cmd : null;
  return ctx.session ? cmd : null;
}

