import { useRef, type KeyboardEvent, type ReactNode } from "react";

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  title?: string;
  disabled?: boolean;
  lang?: string;
}

/** A small set of mutually exclusive choices. Arrow keys move between them. */
export function Segmented<T extends string>({ options, value, onChange, label, full, className }: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name for the group */
  label: string;
  /** Stretch the options to fill the width */
  full?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onKey = (e: KeyboardEvent) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    e.stopPropagation();
    const enabled = options.filter((o) => !o.disabled);
    const next = enabled[(enabled.findIndex((o) => o.value === value) + step + enabled.length) % enabled.length];
    if (!next) return;
    onChange(next.value);
    ref.current?.querySelector<HTMLButtonElement>(`[data-value="${next.value}"]`)?.focus();
  };
  return (
    <div ref={ref} className={`seg${full ? " full" : ""}${className ? ` ${className}` : ""}`} role="radiogroup" aria-label={label} onKeyDown={onKey}
      style={full ? { gridTemplateColumns: `repeat(${options.length}, 1fr)` } : undefined}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" data-value={o.value} aria-checked={o.value === value} tabIndex={o.value === value ? 0 : -1}
          className={o.value === value ? "on" : ""} disabled={o.disabled} title={o.title} lang={o.lang} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
