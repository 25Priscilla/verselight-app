import { useEffect, type ReactNode } from "react";
import { IconButton } from "./Button";

/**
 * A panel that slides in from the right over the working area, for tasks you repeat
 * (adding several songs, browsing related verses). No dimmed backdrop; Esc or ✕ closes it.
 */
export function Drawer({ title, subtitle, onClose, children, actions, className }: {
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /** Buttons pinned to the bottom */
  actions?: ReactNode;
  className?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <aside className={`drawer${className ? ` ${className}` : ""}`} role="dialog" aria-label={title}>
      <header className="drawer-head">
        <div className="drawer-titles">
          <h2>{title}</h2>
          {subtitle && <span className="drawer-subtitle">{subtitle}</span>}
        </div>
        <IconButton icon="x" label="Close" onClick={onClose} />
      </header>
      <div className="drawer-body">{children}</div>
      {actions && <footer className="drawer-actions">{actions}</footer>}
    </aside>
  );
}
