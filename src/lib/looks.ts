import { DEFAULT_LOOK_ID, type Library, type Look, type Slide, type Theme } from "./types";

export type LookSource = "slide" | "item" | "type" | "default";

/**
 * The single place that decides which look a slide uses. The projector, the live preview
 * and every thumbnail call this, so what the operator sees is exactly what is projected.
 * Order: this slide → its song or passage → all Bible / all song slides → Default.
 */
export function lookForSlide(lib: Pick<Library, "looks" | "assign" | "theme">, slide: Slide | null): { id: string; theme: Theme; source: LookSource } {
  const byId = (id: string | null | undefined): Look | undefined => (id ? lib.looks.find((l) => l.id === id) : undefined);
  if (slide) {
    const candidates: [string | null | undefined, LookSource][] = [
      [lib.assign.slides[slide.key], "slide"],
      [lib.assign.items[slide.itemId], "item"],
      [slide.kind === "scripture" ? lib.assign.bible : lib.assign.songs, "type"],
    ];
    for (const [id, source] of candidates) {
      if (id === DEFAULT_LOOK_ID) return { id, theme: lib.theme, source };
      const look = byId(id);
      if (look) return { id: look.id, theme: look.theme, source };
    }
  }
  return { id: DEFAULT_LOOK_ID, theme: lib.theme, source: "default" };
}

export const themeForSlide = (lib: Pick<Library, "looks" | "assign" | "theme">, slide: Slide | null) =>
  lookForSlide(lib, slide).theme;

/** Removes assignments that point at a look that no longer exists. */
export function withoutLook(assign: Library["assign"], lookId: string): Library["assign"] {
  const drop = <T extends Record<string, string>>(m: T) =>
    Object.fromEntries(Object.entries(m).filter(([, v]) => v !== lookId)) as T;
  return {
    bible: assign.bible === lookId ? null : assign.bible,
    songs: assign.songs === lookId ? null : assign.songs,
    items: drop(assign.items),
    slides: drop(assign.slides),
  };
}

/** Downscales an uploaded image so looks stay light enough to send to the projector instantly. */
export async function prepareImage(file: File, maxW = 1920, maxH = 1080): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("the image couldn't be opened"));
      i.src = url;
    });
    const scale = Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.86);
  } finally {
    URL.revokeObjectURL(url);
  }
}
