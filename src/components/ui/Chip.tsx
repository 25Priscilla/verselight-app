import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Icon, type IconName } from "../Icon";
import { cx } from "./Button";

/** A small static label, e.g. "3 verses" or "Bible". */
export function Chip({ children, icon }: { children: ReactNode; icon?: IconName }) {
  return <span className="chip">{icon && <Icon name={icon} size={14} />}{children}</span>;
}

/** A chip that switches a filter on or off. */
export function FilterChip({ selected, icon, children, className, type = "button", ...rest }: {
  selected: boolean;
  icon?: IconName;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type={type} className={cx("filter-chip", selected && "on", className)} aria-pressed={selected} {...rest}>
      {icon && <Icon name={icon} size={14} />}
      {children}
    </button>
  );
}

export type StatusTone = "off" | "ready" | "live" | "warning";

/** A status pill with a dot, e.g. "Projector off" or "Live on EPSON". */
export function StatusChip({ tone, children, title }: { tone: StatusTone; children: ReactNode; title?: string }) {
  return (
    <span className={`status-chip ${tone}`} role="status" title={title}>
      <span className="dot" aria-hidden />
      {children}
    </span>
  );
}
