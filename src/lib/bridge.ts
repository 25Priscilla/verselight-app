import { emit, listen } from "@tauri-apps/api/event";
import { isTauri } from "./env";
import type { LiveState } from "./types";

/**
 * Messaging between the control window and the projector window.
 * Tauri events on desktop; BroadcastChannel when previewing in a browser.
 */
export type NavCommand = "next" | "prev" | "blackout" | "clear" | "exit";

type Messages = {
  "live-state": LiveState;
  "request-state": null;
  nav: NavCommand;
  "presentation-closed": null;
};

const channel = !isTauri() && typeof BroadcastChannel !== "undefined"
  ? new BroadcastChannel("verselight")
  : null;

export async function send<K extends keyof Messages>(event: K, payload: Messages[K]) {
  if (isTauri()) return emit(event, payload);
  channel?.postMessage({ event, payload });
}

export function on<K extends keyof Messages>(
  event: K,
  handler: (payload: Messages[K]) => void,
): () => void {
  if (isTauri()) {
    const unlisten = listen<Messages[K]>(event, (e) => handler(e.payload));
    return () => void unlisten.then((fn) => fn());
  }
  const fn = (e: MessageEvent) => {
    if (e.data?.event === event) handler(e.data.payload);
  };
  channel?.addEventListener("message", fn);
  return () => channel?.removeEventListener("message", fn);
}
