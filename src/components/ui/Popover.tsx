import { useEffect, useRef, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { Icon, type IconName } from "../Icon";
import { cx } from "./Button";

/**
 * Closes a floating panel on Esc or on a mouse press outside it. The outside listener is added on the next tick,
 * so the click that opened the panel doesn't close it straight away. `ignore` is a selector for elements
 * (such as the button that toggles the panel) that shouldn't count as outside.
 */
export function useDismiss(ref: RefObject<HTMLElement>, onClose: () => void, ignore?: string) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const down = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (ref.current?.contains(t) || (ignore && t.closest(ignore))) return;
      close.current();
    };
    const key = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") close.current(); };
    const timer = window.setTimeout(() => document.addEventListener("mousedown", down));
    window.addEventListener("keydown", key);
    return () => { window.clearTimeout(timer); document.removeEventListener("mousedown", down); window.removeEventListener("keydown", key); };
  }, [ref, ignore]);
}

/** A floating panel of settings or choices, positioned by its container. */
export function Popover({ label, title, onClose, ignore, className, children }: {
  /** Accessible name */
  label: string;
  /** Optional small heading */
  title?: ReactNode;
  onClose: () => void;
  ignore?: string;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, onClose, ignore);
  return (
    <div ref={ref} className={cx("popover", className)} role="dialog" aria-label={label}>
      {title && <div className="popover-title">{title}</div>}
      {children}
    </div>
  );
}

/** A list of commands. Arrow keys move between items. */
export function Menu({ label, onClose, ignore, className, children }: { label: string; onClose: () => void; ignore?: string; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, onClose, ignore);
  useEffect(() => { ref.current?.querySelector<HTMLButtonElement>("[role=menuitem]:not(:disabled)")?.focus(); }, []);
  const onKey = (e: KeyboardEvent) => {
    const step = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    e.stopPropagation();
    const items = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]:not(:disabled)") ?? []);
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    items[(i + step + items.length) % items.length]?.focus();
  };
  return (
    <div ref={ref} className={cx("menu", className)} role="menu" aria-label={label} onKeyDown={onKey}>
      {children}
    </div>
  );
}

export function MenuItem({ onSelect, icon, danger, disabled, children }: { onSelect: () => void; icon?: IconName; danger?: boolean; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" role="menuitem" className={cx(danger && "danger")} disabled={disabled} onClick={onSelect}>
      {icon && <Icon name={icon} size={16} />}
      {children}
    </button>
  );
}

export const MenuDivider = () => <div className="menu-divider" role="separator" />;
