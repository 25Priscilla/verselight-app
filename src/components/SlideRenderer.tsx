import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import churchPlain from "../assets/church-background-plain.webp";
import churchFlame from "../assets/church-flame.webp";
import churchLogo from "../assets/church-logo.webp";
import churchWatermark from "../assets/church-watermark.webp";
import churchWave from "../assets/church-wave.webp";
import { churchFlameLayout } from "../lib/churchFlame";
import { CHURCH_BACKGROUND_ID, galleryUrl } from "../lib/gallery";
import { FONTS, type Slide, type Theme } from "../lib/types";

interface Props {
  slide: Slide | null;
  theme: Theme;
  /** Blank: the church background with no words (the `blackout` name is from when it was black) */
  blackout?: boolean;
  clear?: boolean;
  /** Draw the church logo in the bottom-right corner (the projector only); hidden while Blank and on the church background, which carries it as a watermark */
  logo?: boolean;
  className?: string;
}

function backgroundStyle(t: Theme): CSSProperties {
  switch (t.backgroundKind) {
    case "color":
      return { background: t.backgroundColor };
    case "gradient":
      return { background: `linear-gradient(${t.gradientAngle ?? 160}deg, ${t.gradientFrom}, ${t.gradientTo})` };
    case "gallery": {
      // The church background is drawn without its flame and logo watermark; ChurchArtwork adds them back.
      const url = t.galleryId === CHURCH_BACKGROUND_ID ? churchPlain : galleryUrl(t.galleryId);
      return { background: `${t.backgroundColor} center / cover no-repeat url("${url}")` };
    }
    case "image":
      return t.backgroundImage
        ? { background: `${t.backgroundColor} center / cover no-repeat url("${t.backgroundImage}")` }
        : { background: t.backgroundColor };
  }
}

/**
 * The church background's flame, pinned to the left edge at a size that suits this frame, with the wave in front of it,
 * and its logo watermark, which moves in from the right on screens narrower than 16:9 so it is never cut off.
 */
function ChurchArtwork({ width, height }: { width: number; height: number }) {
  const layout = churchFlameLayout(width, height);
  return (
    <>
      {layout && <img className="slide-flame" src={churchFlame} alt="" draggable={false} style={{ top: layout.top, width: layout.width, height: layout.height }} />}
      <div className="slide-wave" style={{ backgroundImage: `url("${churchWave}")` }} />
      <img className="slide-watermark" src={churchWatermark} alt="" draggable={false} />
    </>
  );
}

/**
 * Draws one slide. All sizes use container-query units, so a thumbnail,
 * the operator preview and the projector render identically at any size.
 * Text that doesn't fit shrinks until it does.
 */
export function SlideRenderer({ slide, theme, blackout, clear, logo, className }: Props) {
  const frameRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(1);
  const [height, setHeight] = useState(0);
  const [width, setWidth] = useState(0);
  const showText = !!slide && !clear && !blackout;
  const showRef = showText && theme.showReference && !!slide?.footer;
  // A Bible reference heads the slide so whoever is reading finds the passage at a glance; song credits stay below.
  const refOnTop = showRef && slide?.kind === "scripture";
  const showFooter = showRef && !refOnTop;
  // The church background is light and carries the logo, so it gets its own readable text treatment and no corner logo.
  const onChurch = theme.backgroundKind === "gallery" && theme.galleryId === CHURCH_BACKGROUND_ID;
  const cornerLogo = !!logo && !blackout && !onChurch;

  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    // Side by side, a lyric block can spill into its neighbour without the body overflowing, so each block is checked too.
    const overflows = () => body.scrollHeight > body.clientHeight + 1 || body.scrollWidth > body.clientWidth + 1
      || [...body.querySelectorAll<HTMLElement>(".slide-lines")].some((l) => l.scrollWidth > l.clientWidth + 1);
    const setScale = (s: number) => body.style.setProperty("--fit", String(s));
    // The largest scale (never below 35%) at which the text fits, so long slides lose no more size than they must.
    const largestFit = () => {
      setScale(1);
      if (!overflows()) return 1;
      let lo = 0.35;
      let hi = 1;
      for (let i = 0; i < 9; i++) {
        const mid = (lo + hi) / 2;
        setScale(mid);
        if (overflows()) hi = mid;
        else lo = mid;
      }
      setScale(lo);
      return lo;
    };
    const measure = () => {
      setHeight(frameRef.current?.clientHeight ?? 0);
      setWidth(frameRef.current?.clientWidth ?? 0);
      delete body.dataset.nowrap;
      let scale = largestFit();
      // A lyric line reads best whole: keep each line on one line unless that would make the words much smaller.
      if (body.querySelector(".slide-lines")) {
        body.dataset.nowrap = "";
        const whole = largestFit();
        if (whole >= scale * 0.88) scale = whole;
        else {
          delete body.dataset.nowrap;
          setScale(scale);
        }
      }
      setFit(scale);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (frameRef.current) ro.observe(frameRef.current);
    // Malayalam, Tamil and Kannada fonts may finish loading after the first measure; measure again with the real shapes.
    // Fonts load separately and on first use, so `ready` can settle before the Malayalam face arrives: measure again
    // each time any font finishes loading, too.
    let live = true;
    const remeasure = () => { if (live) measure(); };
    document.fonts?.ready.then(remeasure);
    document.fonts?.addEventListener("loadingdone", remeasure);
    return () => {
      live = false;
      ro.disconnect();
      document.fonts?.removeEventListener("loadingdone", remeasure);
    };
  }, [slide, theme.fontSize, theme.fontFamily, theme.showReference, theme.bilingualLayout, showText, cornerLogo, onChurch]);

  // Blur is stored as pixels at 1080p and scaled to this frame, so every size matches the projector.
  const blurPx = ((theme.blur ?? 0) * height) / 1080;
  const bgStyle: CSSProperties = {
    ...backgroundStyle(theme),
    filter: `brightness(${theme.brightness ?? 1})${blurPx > 0.2 ? ` blur(${blurPx.toFixed(2)}px)` : ""}`,
    // Grow the blurred layer past the edges so the blur doesn't fade in from the sides.
    inset: blurPx > 0.2 ? `${-blurPx * 2}px` : 0,
  };
  const bgGrow = blurPx > 0.2 ? blurPx * 4 : 0;
  const style = {
    "--slide-font": FONTS[theme.fontFamily].css,
    "--slide-size": theme.fontSize,
    "--slide-color": theme.textColor,
    "--fit": fit,
  } as CSSProperties;

  // Verse numbers show when a slide holds more than one verse; a verse missing from one translation shows nothing there.
  const scripture = (lines: string[], lang?: string) => (
    <p className="slide-scripture" lang={lang}>
      {lines.map((line, i) => line ? (
        <span key={i}>
          {lines.length > 1 && slide?.verseNumbers?.[i] && <sup className="verse-num">{slide.verseNumbers[i]}</sup>}
          {line}{" "}
        </span>
      ) : null)}
    </p>
  );

  const songLines = (lines: string[], lang?: string) => (
    <div className="slide-lines" lang={lang}>
      {lines.map((line, i) => (
        <div key={i}>{line}</div>
      ))}
    </div>
  );

  return (
    <div ref={frameRef} className={`slide ${cornerLogo ? "has-logo" : ""} ${className ?? ""}`} data-kind={showText ? slide.kind : undefined} data-footer={showFooter || undefined} data-ref={refOnTop ? "top" : undefined} data-bg={onChurch ? "church" : undefined} style={style} data-align={theme.align} lang={slide?.lang}>
      <div className="slide-bg" style={bgStyle}>
        {/* The blurred layer is grown past the frame's edges, so the flame is laid out for that larger box */}
        {onChurch && <ChurchArtwork width={width + bgGrow} height={height + bgGrow} />}
      </div>
      {(theme.overlay ?? 0) > 0 && <div className="slide-dim" style={{ opacity: theme.overlay }} />}
      {refOnTop && (
        <div className={`slide-header ${theme.shadow ? "has-shadow" : ""}`}><span className="slide-ref">{slide?.footer}</span></div>
      )}
      <div ref={bodyRef} className={`slide-body ${theme.shadow ? "has-shadow" : ""}`}>
        {showText && slide.kind === "scripture" && slide.parallelLines ? (
          <div className={`bilingual ${theme.bilingualLayout === "columns" ? "cols" : "stack"}`}>
            {scripture(slide.lines, slide.lang)}
            <div className="bilingual-rule" aria-hidden />
            {scripture(slide.parallelLines, slide.parallelLang)}
          </div>
        ) : showText && slide.kind === "scripture" ? (
          scripture(slide.lines, slide.lang)
        ) : showText && slide.parallelLines?.length ? (
          // A song section with its translation: each language stays a whole block, never mixed line by line.
          <div className={`bilingual song-pair ${theme.bilingualLayout === "columns" ? "cols" : "stack"}`}>
            {slide.lines.length > 0 && songLines(slide.lines, slide.lang)}
            {slide.lines.length > 0 && <div className="bilingual-rule" aria-hidden />}
            {songLines(slide.parallelLines, slide.parallelLang)}
          </div>
        ) : showText ? (
          songLines(slide.lines)
        ) : null}
      </div>
      {showFooter && (
        <div className="slide-footer"><span className="slide-ref">{slide?.footer}</span></div>
      )}
      {cornerLogo && <img className="slide-logo" src={churchLogo} alt="" draggable={false} />}
      {blackout && (
        <div className="slide-blank" style={{ backgroundImage: `url("${churchPlain}")` }}>
          <ChurchArtwork width={width} height={height} />
          {/* The full-colour logo over the background's faint watermark, so Blank shows the church's own logo */}
          <img className="slide-blank-logo" src={churchLogo} alt="" draggable={false} />
        </div>
      )}
    </div>
  );
}
