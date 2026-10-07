import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import churchLogo from "../assets/church-logo.webp";
import { CHURCH_BACKGROUND_ID, CHURCH_BACKGROUND_URL, galleryUrl } from "../lib/gallery";
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
    case "gallery":
      return { background: `${t.backgroundColor} center / cover no-repeat url("${galleryUrl(t.galleryId)}")` };
    case "image":
      return t.backgroundImage
        ? { background: `${t.backgroundColor} center / cover no-repeat url("${t.backgroundImage}")` }
        : { background: t.backgroundColor };
  }
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
  const showText = !!slide && !clear && !blackout;
  const showFooter = showText && theme.showReference && !!slide?.footer;
  // The church background is light and carries the logo, so it gets its own readable text treatment and no corner logo.
  const onChurch = theme.backgroundKind === "gallery" && theme.galleryId === CHURCH_BACKGROUND_ID;
  const cornerLogo = !!logo && !blackout && !onChurch;

  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const measure = () => {
      setHeight(frameRef.current?.clientHeight ?? 0);
      let scale = 1;
      body.style.setProperty("--fit", "1");
      // Shrink in small steps until the text fits (never below 35%).
      while (scale > 0.35 && (body.scrollHeight > body.clientHeight + 1 || body.scrollWidth > body.clientWidth + 1)) {
        scale *= 0.92;
        body.style.setProperty("--fit", String(scale));
      }
      setFit(scale);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (frameRef.current) ro.observe(frameRef.current);
    return () => ro.disconnect();
  }, [slide, theme.fontSize, theme.fontFamily, theme.showReference, theme.bilingualLayout, showText, cornerLogo, onChurch]);

  // Blur is stored as pixels at 1080p and scaled to this frame, so every size matches the projector.
  const blurPx = ((theme.blur ?? 0) * height) / 1080;
  const bgStyle: CSSProperties = {
    ...backgroundStyle(theme),
    filter: `brightness(${theme.brightness ?? 1})${blurPx > 0.2 ? ` blur(${blurPx.toFixed(2)}px)` : ""}`,
    // Grow the blurred layer past the edges so the blur doesn't fade in from the sides.
    inset: blurPx > 0.2 ? `${-blurPx * 2}px` : 0,
  };
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
    <div ref={frameRef} className={`slide ${cornerLogo ? "has-logo" : ""} ${className ?? ""}`} data-footer={showFooter || undefined} data-bg={onChurch ? "church" : undefined} style={style} data-align={theme.align} lang={slide?.lang}>
      <div className="slide-bg" style={bgStyle} />
      {(theme.overlay ?? 0) > 0 && <div className="slide-dim" style={{ opacity: theme.overlay }} />}
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
      {blackout && <div className="slide-blank" style={{ backgroundImage: `url("${CHURCH_BACKGROUND_URL}")` }} />}
    </div>
  );
}
