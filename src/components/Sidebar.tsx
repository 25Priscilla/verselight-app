import { useState, type ReactNode } from "react";
import type { BibleTool } from "./BibleWorkspace";
import { Icon, type IconName } from "./Icon";
import type { ProjectorStatus } from "./PresentationPanel";
import { cx } from "./ui";

export type Mode = "home" | "bible" | "songs" | "planner" | "backgrounds" | "settings" | "help";

/** The Bible and song tools that live inside the Bible and Songs screens, opened directly from Tools or Home */
export type Tool = BibleTool | "malayalam-songs";

interface Props {
  mode: Mode;
  onMode: (m: Mode) => void;
  /** Opens a tool inside the Bible or Songs screen */
  onTool: (t: Tool) => void;
  /** English + Malayalam side by side needs a Bible in each language */
  canParallel: boolean;
  /** Opens Settings → Projector */
  onProjector: () => void;
  projector: ProjectorStatus;
  displayName: string;
  /** Global Quick Search, under the name so it is there on every screen */
  search?: ReactNode;
}

const PROJECTOR_TEXT: Record<ProjectorStatus, string> = { off: "Off", opening: "Connecting…", live: "Live" };
const TOOLS_KEY = "verselight:nav-tools-open";

function readToolsOpen() {
  try { return localStorage.getItem(TOOLS_KEY) !== "0"; } catch { return true; }
}

/** The main navigation. Shrinks to icons (names as tooltips) while presenting and on narrow windows; see .nav-compact. */
export function Sidebar({ mode, onMode, onTool, canParallel, onProjector, projector, displayName, search }: Props) {
  const [toolsOpen, setToolsOpen] = useState(readToolsOpen);
  const toggleTools = () => {
    const next = !toolsOpen;
    setToolsOpen(next);
    try { localStorage.setItem(TOOLS_KEY, next ? "1" : "0"); } catch { /* remembered for this visit only */ }
  };

  const item = (m: Mode, icon: IconName, label: string, sub = false) => (
    <li>
      <button className={cx("nav-item", sub && "sub", mode === m && "on")} onClick={() => onMode(m)}
        aria-current={mode === m ? "page" : undefined} title={label}>
        <Icon name={icon} size={sub ? 16 : 20} /><span className="nav-label">{label}</span>
      </button>
    </li>
  );
  const tool = (t: Tool, icon: IconName, label: string, title = label, disabled = false) => (
    <li>
      <button className="nav-item sub" onClick={() => onTool(t)} title={title} disabled={disabled}>
        <Icon name={icon} size={16} /><span className="nav-label">{label}</span>
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
      {search}
      <div className="nav-scroll">
        <ul className="nav">
          {item("home", "home", "Home")}
          {item("bible", "book", "Bible")}
          {item("songs", "music", "Songs")}
          {item("planner", "calendar", "Planner")}
          {item("backgrounds", "image", "Backgrounds")}
          <li>
            <button className="nav-item nav-group" onClick={toggleTools}
              aria-expanded={toolsOpen} aria-controls="nav-tools" title="Tools">
              <Icon name="grid" size={20} /><span className="nav-label">Tools</span>
              <span className="nav-chevron" aria-hidden><Icon name={toolsOpen ? "up" : "down"} size={14} /></span>
            </button>
            {toolsOpen && (
              <ul className="nav nav-sub" id="nav-tools" aria-label="Tools">
                {tool("parallel", "columns", "Parallel Bible",
                  canParallel ? "Parallel Bible: English and Malayalam side by side" : "Parallel Bible: import an English and a Malayalam Bible to read side by side",
                  !canParallel)}
                {tool("malayalam-songs", "music", "Malayalam songs", "Malayalam songs: search by Malayalam or Manglish words")}
              </ul>
            )}
          </li>
        </ul>
      </div>
      <ul className="nav nav-foot">
        <li>
          <button className={cx("nav-item", "projector-item", projector)} onClick={onProjector}
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
      </ul>
    </nav>
  );
}
