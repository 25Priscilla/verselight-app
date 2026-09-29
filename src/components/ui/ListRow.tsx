import type { ReactNode } from "react";
import { cx } from "./Button";

/**
 * One row in a list (a song, a Bible, a background). The row itself selects; actions sit on the right
 * and are always visible on the selected row, not only on hover.
 */
export function ListRow({ title, subtitle, leading, actions, actionsAlwaysVisible, selected, onClick, lang, label }: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** An icon or thumbnail before the text */
  leading?: ReactNode;
  actions?: ReactNode;
  /** Show the actions on every row, not only on hover and on the selected row (e.g. "Add" in a picker) */
  actionsAlwaysVisible?: boolean;
  selected?: boolean;
  onClick?: () => void;
  /** Language of the title, e.g. "ml" */
  lang?: string;
  /** Accessible name when the title isn't plain text */
  label?: string;
}) {
  return (
    <li className={cx("list-row", selected && "on", actionsAlwaysVisible && "actions-visible")}>
      <button type="button" className="list-row-main" onClick={onClick} aria-current={selected || undefined} aria-label={label}>
        {leading && <span className="list-row-leading">{leading}</span>}
        <span className="list-row-text">
          <span className="list-row-title" lang={lang}>{title}</span>
          {subtitle && <span className="list-row-subtitle">{subtitle}</span>}
        </span>
      </button>
      {actions && <span className="list-row-actions">{actions}</span>}
    </li>
  );
}
