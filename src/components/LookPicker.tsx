import { useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { DEFAULT_LOOK_ID, type Look, type Theme } from "../lib/types";
import { useDismiss } from "./ui";
import { SlideRenderer } from "./SlideRenderer";

interface Props {
  title: string;
  looks: Look[];
  defaultTheme: Theme;
  /** The look assigned at this level, or null for "Automatic" */
  current: string | null;
  /** The button that opened the menu. The menu floats next to it, inside the window. */
  anchor: HTMLElement;
  onPick: (lookId: string | null) => void;
  onClose: () => void;
}

const GAP = 6;
const EDGE = 8;
const WIDTH = 250;
const MAX_HEIGHT = 360;

/** Below the button when it fits, otherwise above it, otherwise wherever shows most of it; never outside the window. */
export function placeMenu(anchor: Pick<DOMRect, "top" | "bottom" | "right">, menuHeight: number, win: { width: number; height: number }) {
  const room = win.height - EDGE * 2;
  const height = Math.min(menuHeight, MAX_HEIGHT, room);
  const below = win.height - EDGE - (anchor.bottom + GAP);
  const above = anchor.top - GAP - EDGE;
  let top = height <= below ? anchor.bottom + GAP : height <= above ? anchor.top - GAP - height : below >= above ? win.height - EDGE - height : EDGE;
  top = Math.max(EDGE, Math.min(top, win.height - EDGE - height));
  const left = Math.max(EDGE, Math.min(anchor.right - WIDTH, win.width - EDGE - WIDTH));
  return { top, left, maxHeight: height };
}

/** Small menu for choosing the look of one slide. Esc or a click outside closes it. */
export function LookPicker({ title, looks, defaultTheme, current, anchor, onPick, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({ visibility: "hidden", top: 0, left: 0 });
  // The button that opened the menu toggles it itself, so a press on it isn't "outside".
  useDismiss(ref, onClose, "[data-look-anchor]");

  useLayoutEffect(() => {
    const place = () => {
      const el = ref.current;
      if (!el) return;
      const p = placeMenu(anchor.getBoundingClientRect(), el.scrollHeight, { width: innerWidth, height: innerHeight });
      setStyle({ top: p.top, left: p.left, maxHeight: p.maxHeight });
    };
    place();
    // Focus the current choice once the menu is visible, so arrow keys and Enter work straight away.
    const focus = requestAnimationFrame(() => ref.current?.querySelector<HTMLButtonElement>("[aria-checked=true]")?.focus({ preventScroll: true }));
    // Follow the button if the slide list scrolls or the window changes size.
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { cancelAnimationFrame(focus); window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [anchor]);

  const onKey = (e: KeyboardEvent) => {
    const step = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const items = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    items[(i + step + items.length) % items.length]?.focus();
  };

  const options: { id: string | null; name: string; theme: Theme | null }[] = [
    { id: null, name: "Automatic", theme: null },
    { id: DEFAULT_LOOK_ID, name: "Default look", theme: defaultTheme },
    ...looks.map((l) => ({ id: l.id, name: l.name, theme: l.theme })),
  ];

  return createPortal(
    <div className="look-picker floating" ref={ref} style={style} role="menu" aria-label={title} onKeyDown={onKey} onClick={(e) => e.stopPropagation()}>
      <div className="look-picker-title">{title}</div>
      {options.map((o) => (
        <button key={o.id ?? "auto"} role="menuitemradio" aria-checked={current === o.id}
          className={current === o.id ? "on" : ""} onClick={() => { onPick(o.id); onClose(); }}>
          <span className="look-swatch">{o.theme ? <SlideRenderer slide={null} theme={o.theme} /> : <span className="auto-swatch">A</span>}</span>
          <span>{o.name}{o.id === null && <small>Follows the Bible / song setting</small>}</span>
        </button>
      ))}
    </div>,
    document.body,
  );
}
