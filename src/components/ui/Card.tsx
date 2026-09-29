import type { ReactNode } from "react";

/** A titled group of related content. */
export function Card({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card${className ? ` ${className}` : ""}`}>
      {(title || actions) && <SectionHeader title={title} actions={actions} />}
      {children}
    </section>
  );
}

/** A small heading with optional actions on the right. */
export function SectionHeader({ title, actions }: { title?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="section-header">
      {title && <h3>{title}</h3>}
      {actions && <div className="section-actions">{actions}</div>}
    </header>
  );
}
