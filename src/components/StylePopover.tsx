import { useEffect, useRef } from "react";
import { FONTS, type FontKey, type Theme } from "../lib/types";
import { DEFAULT_THEME } from "../state/library";
import { Field } from "./ui";

/** Compact text style settings for the projected slides. */
export function StylePopover({ theme, onChange, onClose, onOpenBackgrounds }: { theme: Theme; onChange: (t: Theme) => void; onClose: () => void; onOpenBackgrounds: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const set = (patch: Partial<Theme>) => onChange({ ...theme, ...patch });

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !(e.target as HTMLElement).closest("[data-style-toggle]")) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); window.removeEventListener("keydown", onKey); };
  }, [onClose]);

  const solid = theme.backgroundKind !== "gradient";

  return (
    <div className="popover" ref={ref} role="dialog" aria-label="Default look">
      <div className="popover-title">Default look</div>
      <Field label="Font">
        <select value={theme.fontFamily} onChange={(e) => set({ fontFamily: e.target.value as FontKey })}>
          {Object.entries(FONTS).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}
        </select>
      </Field>
      <Field label={`Text size · ${theme.fontSize}%`} hint="Long slides shrink to fit automatically.">
        <input type="range" min={4} max={12} step={0.5} value={theme.fontSize} onChange={(e) => set({ fontSize: Number(e.target.value) })} />
      </Field>
      <div className="row2">
        <Field label="Text"><input type="color" value={theme.textColor} onChange={(e) => set({ textColor: e.target.value })} /></Field>
        <Field label="Alignment">
          <select value={theme.align} onChange={(e) => set({ align: e.target.value as Theme["align"] })}>
            <option value="center">Centred</option>
            <option value="left">Left</option>
          </select>
        </Field>
      </div>
      <Field label="Background">
        <div className="seg full">
          <button className={solid ? "on" : ""} onClick={() => set({ backgroundKind: "color" })}>Solid</button>
          <button className={!solid ? "on" : ""} onClick={() => set({ backgroundKind: "gradient" })}>Gradient</button>
        </div>
      </Field>
      {solid ? (
        <input type="color" value={theme.backgroundColor} onChange={(e) => set({ backgroundColor: e.target.value, backgroundKind: "color" })} aria-label="Background colour" />
      ) : (
        <div className="row2">
          <input type="color" value={theme.gradientFrom} onChange={(e) => set({ gradientFrom: e.target.value })} aria-label="Gradient top colour" />
          <input type="color" value={theme.gradientTo} onChange={(e) => set({ gradientTo: e.target.value })} aria-label="Gradient bottom colour" />
        </div>
      )}
      <label className="check"><input type="checkbox" checked={theme.showReference} onChange={(e) => set({ showReference: e.target.checked })} />Show reference and song credit</label>
      <div className="row2">
        <button className="btn ghost small" onClick={() => onChange(DEFAULT_THEME)}>Reset style</button>
        <button className="btn small" onClick={onOpenBackgrounds}>All background options</button>
      </div>
    </div>
  );
}
