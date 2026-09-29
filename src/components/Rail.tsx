import { Icon } from "./Icon";

export type Mode = "bible" | "study" | "songs" | "backgrounds";

export function Rail({ mode, onMode }: { mode: Mode; onMode: (m: Mode) => void }) {
  return (
    <nav className="rail" aria-label="Sections">
      <div className="rail-mark" aria-label="VerseLight" title="VerseLight"><span /></div>
      <button className={mode === "bible" ? "on" : ""} onClick={() => onMode("bible")} aria-current={mode === "bible"}>
        <Icon name="book" size={20} /><span>Bible</span>
      </button>
      <button className={mode === "study" ? "on" : ""} onClick={() => onMode("study")} aria-current={mode === "study"} title="Word Study">
        <Icon name="study" size={20} /><span>Study</span>
      </button>
      <button className={mode === "songs" ? "on" : ""} onClick={() => onMode("songs")} aria-current={mode === "songs"}>
        <Icon name="music" size={20} /><span>Songs</span>
      </button>
      <button className={mode === "backgrounds" ? "on" : ""} onClick={() => onMode("backgrounds")} aria-current={mode === "backgrounds"}>
        <Icon name="image" size={20} /><span>Looks</span>
      </button>
    </nav>
  );
}
