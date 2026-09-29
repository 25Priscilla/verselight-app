import { useEffect, useRef } from "react";
import { DEFAULT_LOOK_ID, type Look, type Theme } from "../lib/types";
import { SlideRenderer } from "./SlideRenderer";

interface Props {
  title: string;
  looks: Look[];
  defaultTheme: Theme;
  /** The look assigned at this level, or null for "Automatic" */
  current: string | null;
  onPick: (lookId: string | null) => void;
  onClose: () => void;
}

/** Small menu for choosing the look of one slide or one song/passage. */
export function LookPicker({ title, looks, defaultTheme, current, onPick, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    setTimeout(() => document.addEventListener("mousedown", down));
    window.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); window.removeEventListener("keydown", key); };
  }, [onClose]);

  const options: { id: string | null; name: string; theme: Theme | null }[] = [
    { id: null, name: "Automatic", theme: null },
    { id: DEFAULT_LOOK_ID, name: "Default look", theme: defaultTheme },
    ...looks.map((l) => ({ id: l.id, name: l.name, theme: l.theme })),
  ];

  return (
    <div className="look-picker" ref={ref} role="menu" aria-label={title} onClick={(e) => e.stopPropagation()}>
      <div className="look-picker-title">{title}</div>
      {options.map((o) => (
        <button key={o.id ?? "auto"} role="menuitemradio" aria-checked={current === o.id}
          className={current === o.id ? "on" : ""} onClick={() => { onPick(o.id); onClose(); }}>
          <span className="look-swatch">{o.theme ? <SlideRenderer slide={null} theme={o.theme} /> : <span className="auto-swatch">A</span>}</span>
          <span>{o.name}{o.id === null && <small>Follows the Bible / song setting</small>}</span>
        </button>
      ))}
    </div>
  );
}
