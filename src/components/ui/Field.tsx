import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { Icon } from "../Icon";
import { IconButton } from "./Button";

/** A label above its control, with an optional hint below. */
export function Field({ label, hint, optional, children }: { label: string; hint?: string; optional?: boolean; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}{optional && <span className="field-optional"> (optional)</span>}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export const TextInput = (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} />;
export const TextArea = (props: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />;
export const Select = (props: SelectHTMLAttributes<HTMLSelectElement>) => <select {...props} />;

export function Checkbox({ label, ...rest }: { label: ReactNode } & Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  return (
    <label className="check">
      <input type="checkbox" {...rest} />
      {label}
    </label>
  );
}

/** Search box with an icon and, once something is typed, a clear button. */
export function SearchField({ value, onChange, onClear, compact, label, className, ...rest }: {
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  compact?: boolean;
  /** Accessible name for the input */
  label: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <div className={`search${compact ? " compact" : ""}${className ? ` ${className}` : ""}`}>
      <Icon name="search" />
      <input value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} {...rest} />
      {value && onClear && <IconButton icon="x" size="sm" label="Clear search" onClick={onClear} />}
    </div>
  );
}
