import { useEffect, useRef, useState } from "react";
import type { LookSource } from "../lib/looks";
import type { Look, Slide, Theme } from "../lib/types";
import { Icon } from "./Icon";
import { LookPicker } from "./LookPicker";
import { SlideRenderer } from "./SlideRenderer";
import { cx } from "./ui";

export type ProjectorStatus = "off" | "opening" | "live";

interface Props {
  title: string;
  kind: "scripture" | "song" | null;
  slides: Slide[];
  index: number;
  /** Keys of the verses the operator originally selected (Bible sessions) */
  selectionKeys: Set<string>;
  /** Bible sessions: the chapters Previous and Next can still run into ("John 2"), or null */
  neighbours: { before: string | null; after: string | null };
  blackout: boolean;
  projector: ProjectorStatus;
  displayName: string;
  onGoto: (index: number) => void;
  onPrev: () => void;
  onNext: () => void;
  onBlackout: () => void;
  onStart: () => void;
  onStop: () => void;
  onEnd: () => void;
  /** The Default look, shown in the per-slide background picker */
  defaultTheme: Theme;
  lookFor: (slide: Slide | null) => { id: string; theme: Theme; source: LookSource };
  looks: Look[];
  slideLook: (slideKey: string) => string | null;
  onSlideLook: (slideKey: string, lookId: string | null) => void;
}

/**
 * The laptop's live controls. The projector shows only the slide; everything else lives here:
 *   status · current slide and its position · Previous / Next / Black · what's next · Start or Stop, and Close · all slides
 */
export function PresentationPanel(p: Props) {
  const [picker, setPicker] = useState<{ key: string; anchor: HTMLElement } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const live = p.slides[p.index] ?? null;
  const next = p.slides[p.index + 1] ?? null;
  const has = p.slides.length > 0;
  const total = p.slides.length;
  const atStart = p.index <= 0 && !p.neighbours.before;
  const atEnd = p.index >= total - 1 && !p.neighbours.after;

  // Keep the current slide visible in the list as the operator moves through it.
  // Only the list scrolls (by hand, not scrollIntoView), so the preview and controls above never move.
  useEffect(() => {
    const list = listRef.current;
    const el = list?.querySelector<HTMLElement>(".sthumb-wrap.on");
    if (!list || !el) return;
    const top = el.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop;
    const bottom = top + el.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top - 8;
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight + 8;
  }, [p.index, p.slides.length]);

  // Closing the background menu puts focus back on its button, so the keyboard carries on from there.
  const closePicker = () => {
    picker?.anchor.focus({ preventScroll: true });
    setPicker(null);
  };
  const pickerSlide = picker ? p.slides.find((s) => s.key === picker.key) ?? null : null;

  const status =
    p.projector === "live" ? { cls: "live", text: `Live on ${p.displayName || "projector"}` }
      : p.projector === "opening" ? { cls: "opening", text: "Connecting to projector…" }
        : { cls: "off", text: "Projector off" };
  const stageTag = p.projector === "live" ? (p.blackout ? "Black screen" : "On screen now") : p.projector === "opening" ? "Connecting…" : "Preview only";
  const endText = p.kind === "song" ? "End of song" : "End of passage";

  return (
    <aside className="present" aria-label="Presentation">
      <div className="present-head">
        <h2>Presentation</h2>
        <span className={`status ${status.cls}`} role="status"><span className="dot" aria-hidden />{status.text}</span>
      </div>

      {has ? (
        <>
          <section className="stage" aria-label="Current slide">
            <div className="stage-label">
              <span className={cx("stage-tag", p.projector === "live" && !p.blackout && "on-air")}>{stageTag}</span>
              <span className="stage-count" aria-live="polite">Slide {p.index + 1} of {total}</span>
            </div>
            <div className={cx("stage-frame", p.projector === "live" && "on-air", p.blackout && "is-black")}>
              <SlideRenderer slide={live} theme={p.lookFor(live).theme} blackout={p.blackout} />
              {p.blackout && <span className="black-badge">Screen is black</span>}
            </div>
            <div className="stage-title" title={live?.label}>{live?.label}</div>
          </section>

          <div className="controls" role="group" aria-label="Slide controls">
            <button className="btn ctl" onClick={p.onPrev} disabled={atStart} title="Previous slide (← or Page Up)">
              <Icon name="prev" />Previous
            </button>
            <button className="btn ctl next" onClick={p.onNext} disabled={atEnd} title="Next slide (Space, → or Page Down)">
              Next<Icon name="next" />
            </button>
            <button className={cx("btn ctl black", p.blackout && "black-on")} onClick={p.onBlackout} aria-pressed={p.blackout}
              title={p.blackout ? "Show the slide again (B)" : "Make the projector black (B)"}>
              {p.blackout ? <Icon name="eye" size={16} /> : <Icon name="square" size={13} />}{p.blackout ? "Show" : "Black"}
            </button>
          </div>

          <div className="up-next" aria-label="Next slide">
            <div className="up-next-frame">
              {next ? <SlideRenderer slide={next} theme={p.lookFor(next).theme} />
                : <span className="up-next-end">{p.neighbours.after ? "Next chapter" : "End"}</span>}
            </div>
            <span className="up-next-label">Next</span>
            <span className="up-next-title">{next?.label ?? (p.neighbours.after ? `${p.neighbours.after} (next chapter)` : endText)}</span>
          </div>

          <div className="session-actions">
            {p.projector === "off" ? (
              <button className="btn present" onClick={p.onStart} title="Show this on the projector">
                <Icon name="play" size={13} />Start presenting
              </button>
            ) : (
              <button className="btn stop" onClick={p.onStop} title="Turn the projector screen off and keep your place (Esc)">
                <Icon name="stop" size={13} />Stop presentation
              </button>
            )}
            <button className="btn close" onClick={p.onEnd} aria-label="Close presentation" title="Close the presentation: clear the slides and hide these controls">
              <Icon name="x" size={15} />Close
            </button>
          </div>

          <div className="slides-head">
            <h3 title={p.title}>{p.title}</h3>
            <span className="slides-count">{total} {total === 1 ? "slide" : "slides"}</span>
          </div>
          <div className="slide-list" ref={listRef}>
            {p.neighbours.before && (
              <button className="extend" onClick={() => p.index === 0 ? p.onPrev() : p.onGoto(0)} title="Go to the start, then into the previous chapter">
                <Icon name="prev" size={12} />{p.neighbours.before}
              </button>
            )}
            <div className="sgrid">
              {p.slides.map((slide, i) => {
                const on = i === p.index;
                return (
                  <div key={slide.key} className={cx("sthumb-wrap", on && "on")}>
                    <button className={cx("sthumb", on && "on", p.selectionKeys.has(slide.key) && "picked")}
                      onClick={() => p.onGoto(i)} aria-current={on ? "true" : undefined} aria-label={`Slide ${i + 1}: ${slide.label}${on ? " (showing now)" : ""}`}>
                      <span className="sthumb-frame">
                        <SlideRenderer slide={slide} theme={p.lookFor(slide).theme} />
                        <span className="sthumb-num" aria-hidden>{i + 1}</span>
                        {on && <span className="now-badge" aria-hidden>Now</span>}
                      </span>
                      <span className="sthumb-label">{slide.label}</span>
                    </button>
                    <button className={cx("thumb-look", p.slideLook(slide.key) && "set", picker?.key === slide.key && "open")} data-look-anchor
                      onClick={(e) => { const anchor = e.currentTarget; setPicker((open) => (open?.key === slide.key ? null : { key: slide.key, anchor })); }}
                      aria-haspopup="menu" aria-expanded={picker?.key === slide.key}
                      aria-label={`Background for ${slide.label}`} title="Background for this slide"><Icon name="image" size={13} /></button>
                  </div>
                );
              })}
            </div>
            {p.neighbours.after && (
              <button className="extend" onClick={() => p.index === total - 1 ? p.onNext() : p.onGoto(total - 1)} title="Go to the end, then into the next chapter">
                {p.neighbours.after}<Icon name="next" size={12} />
              </button>
            )}
          </div>
          {picker && pickerSlide && (
            <LookPicker title={`Background for ${pickerSlide.label}`} looks={p.looks}
              defaultTheme={p.defaultTheme} current={p.slideLook(picker.key)} anchor={picker.anchor}
              onPick={(id) => p.onSlideLook(picker.key, id)} onClose={closePicker} />
          )}
        </>
      ) : (
        <>
          <div className="slides-empty">
            <p>Nothing is loaded to present.</p>
            <p className="muted small">Select a Bible passage or a song, then choose <strong>▶ Present Now</strong>. Every verse and every song section becomes its own slide.</p>
          </div>
          <div className="session-actions">
            {p.projector !== "off" && (
              <button className="btn stop" onClick={p.onStop} title="Turn the projector screen off (Esc)"><Icon name="stop" size={13} />Stop presentation</button>
            )}
            <button className="btn close" onClick={p.onEnd} aria-label="Close presentation" title="Hide these controls"><Icon name="x" size={15} />Close</button>
          </div>
        </>
      )}
    </aside>
  );
}
