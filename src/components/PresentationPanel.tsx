import { useEffect, useRef, useState } from "react";
import type { DisplayInfo } from "../lib/display";
import type { LookSource } from "../lib/looks";
import type { Look, Slide, Theme } from "../lib/types";
import { Icon } from "./Icon";
import { LookPicker } from "./LookPicker";
import { SlideRenderer } from "./SlideRenderer";
import { StylePopover } from "./StylePopover";

export type ProjectorStatus = "off" | "opening" | "live";

interface Props {
  title: string;
  kind: "scripture" | "song" | null;
  slides: Slide[];
  index: number;
  /** Keys of the verses the operator originally selected (Bible sessions) */
  selectionKeys: Set<string>;
  /** Bible sessions can run on into the previous or next chapter */
  canExtend: boolean;
  blackout: boolean;
  projector: ProjectorStatus;
  displayName: string;
  displays: DisplayInfo[];
  displayIndex: number | null;
  onGoto: (index: number) => void;
  onPrev: () => void;
  onNext: () => void;
  onBlackout: () => void;
  onStart: () => void;
  onStop: () => void;
  onEnd: () => void;
  onDisplay: (index: number | null) => void;
  onRefreshDisplays: () => void;
  theme: Theme;
  onTheme: (t: Theme) => void;
  lookFor: (slide: Slide | null) => { id: string; theme: Theme; source: LookSource };
  looks: Look[];
  slideLook: (slideKey: string) => string | null;
  onSlideLook: (slideKey: string, lookId: string | null) => void;
  onOpenBackgrounds: () => void;
}

/** The laptop's control screen. The projector shows only the slide; everything else lives here. */
export function PresentationPanel(p: Props) {
  const [styleOpen, setStyleOpen] = useState(false);
  const [picker, setPicker] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const live = p.slides[p.index] ?? null;
  const next = p.slides[p.index + 1] ?? null;
  const has = p.slides.length > 0;

  // Keep the current slide visible in the list as the operator moves through it.
  // Only the list scrolls (by hand, not scrollIntoView), so the preview and controls above never move.
  useEffect(() => {
    const list = listRef.current;
    const el = list?.querySelector<HTMLElement>(".sthumb-wrap:has(.sthumb.on)") ?? list?.querySelector<HTMLElement>(".sthumb.on");
    if (!list || !el) return;
    const top = el.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop;
    const bottom = top + el.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top - 8;
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight + 8;
  }, [p.index, p.slides.length]);

  const status =
    p.projector === "live" ? { cls: "live", text: `Live on ${p.displayName || "projector"}` }
      : p.projector === "opening" ? { cls: "opening", text: "Connecting to projector…" }
        : { cls: "off", text: "Projector off" };

  return (
    <aside className="present" aria-label="Presentation control">
      <div className="present-head">
        <h2>Presentation</h2>
        <span className={`status ${status.cls}`} role="status"><span className="dot" aria-hidden />{status.text}</span>
        <button className="icon-btn" onClick={() => setStyleOpen((o) => !o)} aria-label="Default look" title="Text and background"><Icon name="type" /></button>
        {styleOpen && (
          <StylePopover theme={p.theme} onChange={p.onTheme} onClose={() => setStyleOpen(false)}
            onOpenBackgrounds={() => { setStyleOpen(false); p.onOpenBackgrounds(); }} />
        )}
      </div>

      <div className="stage">
        <div className="stage-label">
          <span className="stage-tag">{p.projector === "live" ? "On screen" : "Preview"}</span>
          <span className="stage-title">{live?.label ?? "Nothing selected"}</span>
          {has && <span className="stage-count">{p.index + 1} / {p.slides.length}</span>}
        </div>
        <div className={`stage-frame ${p.projector === "live" ? "on-air" : ""}`}>
          <SlideRenderer slide={live} theme={p.lookFor(live).theme} blackout={p.blackout} />
          {p.blackout && <span className="black-badge">Black screen</span>}
        </div>
      </div>

      <div className="controls">
        <button className="btn ctl" onClick={p.onPrev} disabled={!has} title="Previous (←)"><Icon name="prev" />Previous</button>
        <button className="btn ctl next" onClick={p.onNext} disabled={!has} title="Next (Space or →)">Next<Icon name="next" /></button>
        <button className={`btn ctl ${p.blackout ? "black-on" : ""}`} onClick={p.onBlackout} disabled={!has} aria-pressed={p.blackout} title="Black screen (B)">
          <Icon name="square" size={13} />{p.blackout ? "Show" : "Black"}
        </button>
      </div>

      {has && (
        <div className="up-next">
          <span className="up-next-label">Next</span>
          <div className="up-next-frame">{next ? <SlideRenderer slide={next} theme={p.lookFor(next).theme} /> : <span className="up-next-end">{p.canExtend ? "Next chapter" : "End"}</span>}</div>
          <span className="up-next-title">{next?.label ?? (p.canExtend ? "Continues into the next chapter" : "Last slide")}</span>
        </div>
      )}

      <div className="projector-row">
        <Icon name="monitor" size={16} />
        <select value={p.displayIndex ?? ""} onChange={(e) => p.onDisplay(e.target.value === "" ? null : Number(e.target.value))} aria-label="Projector display">
          <option value="">Second screen (automatic)</option>
          {p.displays.map((d) => <option key={d.index} value={d.index}>{d.name} · {d.width}×{d.height}{d.primary ? " (this screen)" : ""}</option>)}
        </select>
        <button className="icon-btn sm" onClick={p.onRefreshDisplays} aria-label="Refresh displays" title="Refresh displays"><Icon name="refresh" size={14} /></button>
      </div>
      <div className="session-actions">
        {p.projector === "off" ? (
          <button className="btn present wide" onClick={p.onStart} disabled={!has} title={has ? "Show this on the projector" : "Choose a passage or song first"}>
            <Icon name="play" size={13} />{has ? "Start presentation" : "Present Now starts here"}
          </button>
        ) : (
          <button className="btn stop wide" onClick={p.onStop} title="Close the projector (Esc)"><Icon name="stop" size={13} />Stop presentation</button>
        )}
      </div>
      {p.displays.length < 2 && p.projector === "off" && (
        <p className="muted small hint">Only one display found. The presentation will cover this screen; press Esc to come back.</p>
      )}

      <div className="slides-head">
        <h3>{has ? p.title : "Slides"}</h3>
        {has && <button className="btn ghost small" onClick={p.onEnd} title="Clear this presentation">Close</button>}
      </div>
      {!has ? (
        <div className="slides-empty">
          <p>Select a Bible passage or a song, then choose <strong>▶ Present Now</strong>.</p>
          <p className="muted small">Every verse and every song section becomes its own slide.</p>
        </div>
      ) : (
        <div className="slide-list" ref={listRef}>
          {p.canExtend && (
            <button className="extend" onClick={() => p.index === 0 ? p.onPrev() : p.onGoto(0)} title="Go to the start, then into the previous chapter">
              <Icon name="prev" size={12} />Previous chapter
            </button>
          )}
          <div className="sgrid">
            {p.slides.map((slide, i) => (
              <div key={slide.key} className="sthumb-wrap">
                <button className={`sthumb ${i === p.index ? "on" : ""} ${p.selectionKeys.has(slide.key) ? "picked" : ""}`}
                  onClick={() => p.onGoto(i)} aria-current={i === p.index} aria-label={`Show ${slide.label}`}>
                  <SlideRenderer slide={slide} theme={p.lookFor(slide).theme} />
                  <span className="sthumb-label">
                    {i === p.index && <span className="now-dot" aria-hidden />}
                    {slide.label}
                  </span>
                </button>
                <button className={`thumb-look ${p.slideLook(slide.key) ? "set" : ""}`} onClick={() => setPicker(slide.key)}
                  aria-label={`Background for ${slide.label}`} title="Background for this slide"><Icon name="image" size={13} /></button>
                {picker === slide.key && (
                  <LookPicker title={`Background for ${slide.label}`} looks={p.looks} defaultTheme={p.theme}
                    current={p.slideLook(slide.key)} onPick={(id) => p.onSlideLook(slide.key, id)} onClose={() => setPicker(null)} />
                )}
              </div>
            ))}
          </div>
          {p.canExtend && (
            <button className="extend" onClick={() => p.index === p.slides.length - 1 ? p.onNext() : p.onGoto(p.slides.length - 1)}
              title="Go to the end, then into the next chapter">
              Next chapter<Icon name="next" size={12} />
            </button>
          )}
        </div>
      )}
    </aside>
  );
}
