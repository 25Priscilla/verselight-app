import { useEffect, useState } from "react";
import { on, send, type NavCommand } from "../lib/bridge";
import type { LiveState } from "../lib/types";
import { DEFAULT_THEME } from "../state/library";
import { SlideRenderer } from "./SlideRenderer";

/** The projector window. It only draws what the control window sends it. */
export function PresentationView() {
  const [state, setState] = useState<LiveState>({ slide: null, theme: DEFAULT_THEME, blackout: false, clear: true });

  useEffect(() => {
    const off = on("live-state", setState);
    send("request-state", null);
    return off;
  }, []);

  // The audience sees only the slide: no page scrollbars, text selection or right-click browser menu.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("projector-window");
    const noMenu = (e: Event) => e.preventDefault();
    window.addEventListener("contextmenu", noMenu);
    return () => { root.classList.remove("projector-window"); window.removeEventListener("contextmenu", noMenu); };
  }, []);

  // Clickers and keyboards pressed while the projector has focus still work.
  useEffect(() => {
    const keys: Record<string, NavCommand> = {
      ArrowRight: "next", ArrowDown: "next", PageDown: "next", " ": "next", Enter: "next",
      ArrowLeft: "prev", ArrowUp: "prev", PageUp: "prev", Backspace: "prev",
      b: "blackout", B: "blackout", ".": "blackout",
      c: "clear", C: "clear",
      Escape: "exit",
    };
    const onKey = (e: KeyboardEvent) => {
      const cmd = keys[e.key];
      if (cmd) {
        e.preventDefault();
        send("nav", cmd);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="projector">
      <SlideRenderer slide={state.slide} theme={state.theme} blackout={state.blackout} clear={state.clear} logo={state.logo} />
    </div>
  );
}
