/**
 * The church background's flame, drawn as its own layer so it stays whole and prominent on every screen shape.
 *
 * The background artwork is 16:9. On a narrower screen (16:10, 4:3, or a TV fed a 4:3 picture) "cover" cuts off the
 * image's sides, which used to leave only a sliver of the flame. So the background is drawn in three layers, all cut
 * from the original artwork by scripts/church-flame-layers.py:
 *   1. church-background-plain.webp: the background with the flame and the logo watermark painted out,
 *   2. church-flame.webp: the flame alone, pinned to the screen's left edge and sized here,
 *   3. church-wave.webp: the bottom wave alone, in front, so the flame's base always tucks behind it,
 *   4. church-watermark.webp: the faint logo watermark, which moves in from the right edge like Blank's logo (slide.css).
 * Layers 1 and 3 use the same "cover" placement as before, so the wave sits exactly where it always did.
 */

/** The artwork's size, in image pixels */
const IMG_W = 1920;
const IMG_H = 1080;
/** church-flame.webp's size; its top-left corner is the artwork's top-left corner */
export const FLAME_W = 367;
export const FLAME_H = 966;
/** The flame's rightmost point */
export const FLAME_RIGHT = 363;
/** Columns where the flame's base meets the wave (elsewhere it ends above the wave's pale glow) */
const BASE_FROM = 196;
const BASE_TO = 304;
/** Top edge of the bottom wave: image y at x = 0, 20, 40 … 1160 */
const WAVE_STEP = 20;
const WAVE_TOP = [
  731, 750, 770, 788, 806, 824, 840, 856, 872, 886, 900, 914, 926, 938, 950, 960, 970, 980, 988, 997, 1004, 1011, 1018,
  1024, 1030, 1035, 1040, 1045, 1049, 1053, 1057, 1061, 1064, 1068, 1071, 1075, 1077, 1079, 1080, 1080, 1080, 1080,
  1080, 1080, 1080, 1080, 1080, 1079, 1077, 1061, 1055, 1052, 1048, 1045, 1040, 1036, 1032, 1026, 1020,
];

/** Up to 15% larger than in the artwork… */
export const FLAME_MAX_SCALE = 1.15;
/** …but never wider than this share of the screen, so the centre stays free for the words */
export const FLAME_MAX_WIDTH = 0.22;
/** Room above the flame's tip, in image pixels */
const TIP_MARGIN = 16;

function waveTop(x: number): number {
  const i = Math.max(0, Math.min(WAVE_TOP.length - 1.001, x / WAVE_STEP));
  const lo = Math.floor(i);
  return WAVE_TOP[lo] + (WAVE_TOP[lo + 1] - WAVE_TOP[lo]) * (i - lo);
}

export interface FlameLayout {
  /** Pixels from the top of the frame (the flame's left edge is the frame's left edge) */
  top: number;
  width: number;
  height: number;
}

/** Where the flame layer goes in a frame of this size, in pixels. Null before the frame has a size. */
export function churchFlameLayout(w: number, h: number): FlameLayout | null {
  if (!(w > 0 && h > 0)) return null;
  // The artwork's "cover" scale, and how much of it is cut off at the left and top.
  const s = Math.max(w / IMG_W, h / IMG_H);
  const cropX = (IMG_W * s - w) / 2 / s;
  const cropY = (IMG_H * s - h) / 2 / s;
  const f = Math.min(FLAME_MAX_SCALE, (FLAME_MAX_WIDTH * (w / s)) / FLAME_RIGHT);
  // Just below the top, unless it must sit lower for its base to reach behind the wave where the wave shows on this screen.
  let top = TIP_MARGIN;
  for (let x = BASE_FROM; x <= BASE_TO; x += 4) {
    top = Math.max(top, waveTop(f * x + cropX) - cropY - f * waveTop(x));
  }
  return { top: top * s, width: FLAME_W * f * s, height: FLAME_H * f * s };
}

/** For tests: the wave's top edge on screen at frame x, in pixels */
export function waveTopOnScreen(w: number, h: number, frameX: number): number {
  const s = Math.max(w / IMG_W, h / IMG_H);
  const cropX = (IMG_W * s - w) / 2 / s;
  const cropY = (IMG_H * s - h) / 2 / s;
  return (waveTop(frameX / s + cropX) - cropY) * s;
}

/** For tests: the flame's base (where the artwork cuts it along the wave) on screen at frame x, in pixels */
export function flameBaseOnScreen(layout: FlameLayout, frameX: number): number {
  const f = layout.width / FLAME_W;
  return layout.top + waveTop(frameX / f) * f;
}
