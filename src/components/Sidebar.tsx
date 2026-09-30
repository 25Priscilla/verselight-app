import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import type { ProjectorStatus } from "./PresentationPanel";
import { cx } from "./ui";

export type Mode = "home" | "bible" | "study" | "songs" | "backgrounds" | "settings" | "help";

interface Props {
  mode: Mode;
  onMode: (m: Mode) => void;
  projector: ProjectorStatus;
  displayName: string;
  /** Temporary: the library menu until its items move to Settings */
  footer?: ReactNode;
}

const PROJECTOR_TEXT: Record<ProjectorStatus, string> = { off: "Off", opening: "Connecting…", live: "Live" };

/** The main navigation. Shrinks to icons (names as tooltips) while presenting and on narrow windows; see .nav-compact. */
export function Sidebar({ mode, onMode, projector, displayName, footer }: Props) {
  const item = (m: Mode, icon: IconName, label: string, sub = false) => (
    <li>
      <button className={cx("nav-item", sub && "sub", mode === m && "on")} onClick={() => onMode(m)}
        aria-current={mode === m ? "page" : undefined} title={label}>
        <Icon name={icon} size={sub ? 16 : 20} /><span className="nav-label">{label}</span>
      </button>
    </li>
  );
  const status = projector === "live" && displayName ? `Live on ${displayName}` : PROJECTOR_TEXT[projector];

  return (
    <nav className="sidebar" aria-label="Main">
      <div className="brand">
        <span className="brand-mark" aria-hidden><span /></span>
        <span className="brand-name">VerseLight</span>
      </div>
      <ul className="nav">
        {item("home", "home", "Home")}
        {item("bible", "book", "Bible")}
        {item("study", "study", "Bible Study", true)}
        {item("songs", "music", "Songs")}
        {item("backgrounds", "image", "Backgrounds")}
      </ul>
      <ul className="nav nav-foot">
        <li>
          <button className={cx("nav-item", "projector-item", projector)} onClick={() => onMode("settings")}
            title={`Projector: ${status}`} aria-label={`Projector status: ${status}. Open projector settings`}>
            <span className="projector-icon"><Icon name="monitor" size={20} /><span className="dot" aria-hidden /></span>
            <span className="nav-label">
              <span>Projector</span>
              <span className="projector-state">{status}</span>
            </span>
          </button>
        </li>
        {item("settings", "settings", "Settings")}
        {item("help", "help", "Help")}
        {footer && <li className="nav-extra">{footer}</li>}
      </ul>
    </nav>
  );
}
