import type { ReactNode } from "react";

/** A full-width screen (Home, Settings, Help): a title, an optional line under it, then the content. */
export function Page({ title, intro, children, className }: { title: string; intro?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <main className={`page${className ? ` ${className}` : ""}`}>
      <div className="page-inner">
        <header className="page-head">
          <h1>{title}</h1>
          {intro && <p className="page-intro">{intro}</p>}
        </header>
        {children}
      </div>
    </main>
  );
}
