import { useMemo, useRef, useState } from "react";
import { GALLERY } from "../lib/gallery";
import { newId } from "../lib/id";
import { prepareImage, withoutLook } from "../lib/looks";
import { DEFAULT_LOOK_ID, FONTS, type BackgroundKind, type FontKey, type Look, type Slide, type Theme } from "../lib/types";
import { DEFAULT_THEME, useLibrary } from "../state/library";
import { Icon } from "./Icon";
import { SlideRenderer } from "./SlideRenderer";
import { Field } from "./ui";

// Sample text is placeholder wording, never scripture or lyrics.
const SAMPLE_BIBLE: Slide = {
  key: "sample-bible", itemId: "sample", kind: "scripture", label: "Bible sample",
  lines: ["Your Bible passage appears here, in the translation you imported, sized to fit the screen."],
  footer: "Book 1:1 (Translation)",
};
const SAMPLE_SONG: Slide = {
  key: "sample-song", itemId: "sample", kind: "song", label: "Song sample",
  lines: ["Song lyrics appear here", "One line on screen per line", "Up to four lines on a slide"],
  footer: "Song writer  |  Copyright",
};

const GRADIENTS: [string, string][] = [
  ["#1d2742", "#0d1120"], ["#3b2d5c", "#120f24"], ["#0f3b44", "#061519"],
  ["#5a2a3c", "#1a0c14"], ["#6b4a1f", "#1d130a"], ["#24324a", "#6c4d6b"],
];

interface Props {
  active: boolean;
  /** The live slide or first slide in the presentation, used for the "Live slide" preview */
  liveSample: Slide | null;
}

export function BackgroundsWorkspace({ active, liveSample }: Props) {
  const { library, update } = useLibrary();
  const [selectedId, setSelectedId] = useState<string>(DEFAULT_LOOK_ID);
  // Prefer the real current slide; fall back to a sample when the presentation is empty.
  const [sample, setSample] = useState<"live" | "bible" | "song">("live");
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const upload = useRef<HTMLInputElement>(null);

  const look = library.looks.find((l) => l.id === selectedId);
  const isDefault = !look;
  const theme = look ? look.theme : library.theme;
  const name = look ? look.name : "Default look";

  const setTheme = (patch: Partial<Theme>) =>
    update((lib) =>
      isDefault
        ? { ...lib, theme: { ...lib.theme, ...patch } }
        : { ...lib, looks: lib.looks.map((l) => (l.id === selectedId ? { ...l, theme: { ...l.theme, ...patch }, updatedAt: Date.now() } : l)) },
    );

  const rename = (value: string) =>
    update((lib) => ({ ...lib, looks: lib.looks.map((l) => (l.id === selectedId ? { ...l, name: value } : l)) }));

  const saveAsNew = () => {
    const copy: Look = { id: newId(), name: isDefault ? "My look" : `${name} copy`, theme: { ...theme }, updatedAt: Date.now() };
    update((lib) => ({ ...lib, looks: [...lib.looks, copy] }));
    setSelectedId(copy.id);
  };

  const remove = () => {
    if (isDefault) return;
    update((lib) => ({ ...lib, looks: lib.looks.filter((l) => l.id !== selectedId), assign: withoutLook(lib.assign, selectedId) }));
    setSelectedId(DEFAULT_LOOK_ID);
  };

  const usedFor = (kind: "bible" | "songs") => library.assign[kind] === selectedId || (isDefault && library.assign[kind] === DEFAULT_LOOK_ID);
  const toggleUse = (kind: "bible" | "songs") =>
    update((lib) => ({ ...lib, assign: { ...lib.assign, [kind]: usedFor(kind) ? null : selectedId } }));

  const onImage = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (!file.type.startsWith("image/")) return setError("That file isn't an image. Choose a JPG, PNG or WebP.");
    try {
      setTheme({ backgroundKind: "image", backgroundImage: await prepareImage(file), overlay: Math.max(theme.overlay, 0.3) });
    } catch (e) {
      setError(`The image couldn't be used: ${e instanceof Error ? e.message : e}`);
    }
  };

  const previewSlide = sample === "live" && liveSample ? liveSample : sample === "song" ? SAMPLE_SONG : SAMPLE_BIBLE;

  // How many slides and items use each look, for the sidebar badges.
  const usage = useMemo(() => {
    const count = new Map<string, number>();
    for (const id of [...Object.values(library.assign.items), ...Object.values(library.assign.slides)]) count.set(id, (count.get(id) ?? 0) + 1);
    return count;
  }, [library.assign]);

  const lookRow = (id: string, label: string, t: Theme) => {
    const tags = [library.assign.bible === id && "Bible", library.assign.songs === id && "Songs", usage.get(id) && `${usage.get(id)} in presentation`].filter(Boolean);
    return (
      <li key={id}>
        <button className={`look-row ${selectedId === id ? "on" : ""}`} onClick={() => setSelectedId(id)}>
          <span className="look-thumb"><SlideRenderer slide={null} theme={t} /></span>
          <span className="look-meta">
            <span className="song-title">{label}</span>
            <span className="song-artist">{id === DEFAULT_LOOK_ID ? "Used wherever nothing else is set" : tags.join(" · ") || "Not in use"}</span>
          </span>
        </button>
      </li>
    );
  };

  const kinds: [BackgroundKind, string][] = [["color", "Colour"], ["gradient", "Gradient"], ["gallery", "Gallery"], ["image", "Image"]];

  return (
    <div className="workspace" style={{ display: active ? "contents" : "none" }}>
      <aside className="context">
        <div className="context-head">
          <h2 className="context-title">Looks</h2>
          <button className="btn wide" onClick={saveAsNew}><Icon name="plus" />New look</button>
        </div>
        <ul className="song-list">
          {lookRow(DEFAULT_LOOK_ID, "Default look", library.theme)}
          {library.looks.map((l) => lookRow(l.id, l.name || "Untitled look", l.theme))}
        </ul>
      </aside>

      <main className="work">
        <div className="bg-editor">
          <header className="bg-head">
            {isDefault ? (
              <h1 className="bg-name">Default look</h1>
            ) : (
              <input className="bg-name" value={name} onChange={(e) => rename(e.target.value)} aria-label="Look name" placeholder="Look name" />
            )}
            <button className="btn" onClick={saveAsNew} title="Save these settings as a new preset"><Icon name="bookmark" size={15} />Save as new look</button>
            {!isDefault && <button className="icon-btn" onClick={remove} aria-label="Delete look" title="Delete look"><Icon name="trash" /></button>}
          </header>

          <div className="bg-preview-wrap">
            <div className="bg-preview"><SlideRenderer slide={previewSlide} theme={theme} /></div>
            <div className="bg-preview-bar">
              <div className="seg" role="radiogroup" aria-label="Preview with">
                <button role="radio" aria-checked={sample === "live" && !!liveSample} className={sample === "live" && liveSample ? "on" : ""} disabled={!liveSample} onClick={() => setSample("live")}>Current slide</button>
                <button role="radio" aria-checked={sample === "bible" || (sample === "live" && !liveSample)} className={sample === "bible" || (sample === "live" && !liveSample) ? "on" : ""} onClick={() => setSample("bible")}>Bible</button>
                <button role="radio" aria-checked={sample === "song"} className={sample === "song" ? "on" : ""} onClick={() => setSample("song")}>Song</button>
              </div>
              <span className="muted small">Exactly as the projector will show it</span>
            </div>
          </div>

          <section className="bg-section">
            <h3>Use this look for</h3>
            <div className="use-row">
              <button className={`chip-toggle ${usedFor("bible") ? "on" : ""}`} aria-pressed={usedFor("bible")} onClick={() => toggleUse("bible")}>
                <Icon name={usedFor("bible") ? "check" : "book"} size={15} />All Bible slides
              </button>
              <button className={`chip-toggle ${usedFor("songs") ? "on" : ""}`} aria-pressed={usedFor("songs")} onClick={() => toggleUse("songs")}>
                <Icon name={usedFor("songs") ? "check" : "music"} size={15} />All song slides
              </button>
            </div>
            <p className="muted small">
              To give one song, one passage or one slide its own look, use the <Icon name="image" size={12} /> button on it in the presentation panel.
            </p>
          </section>

          <section className="bg-section">
            <h3>Background</h3>
            <div className="seg four" role="radiogroup" aria-label="Background type">
              {kinds.map(([k, label]) => (
                <button key={k} role="radio" aria-checked={theme.backgroundKind === k} className={theme.backgroundKind === k ? "on" : ""}
                  onClick={() => setTheme({ backgroundKind: k })}>{label}</button>
              ))}
            </div>

            {theme.backgroundKind === "color" && (
              <Field label="Colour"><input type="color" value={theme.backgroundColor} onChange={(e) => setTheme({ backgroundColor: e.target.value })} /></Field>
            )}

            {theme.backgroundKind === "gradient" && (
              <>
                <div className="swatches">
                  {GRADIENTS.map(([a, b]) => (
                    <button key={a + b} className={`swatch ${theme.gradientFrom === a && theme.gradientTo === b ? "on" : ""}`}
                      style={{ background: `linear-gradient(${theme.gradientAngle}deg, ${a}, ${b})` }}
                      onClick={() => setTheme({ gradientFrom: a, gradientTo: b })} aria-label={`Gradient ${a} to ${b}`} />
                  ))}
                </div>
                <div className="row2">
                  <Field label="From"><input type="color" value={theme.gradientFrom} onChange={(e) => setTheme({ gradientFrom: e.target.value })} /></Field>
                  <Field label="To"><input type="color" value={theme.gradientTo} onChange={(e) => setTheme({ gradientTo: e.target.value })} /></Field>
                </div>
                <Field label={`Direction · ${theme.gradientAngle}°`}>
                  <input type="range" min={0} max={360} step={5} value={theme.gradientAngle} onChange={(e) => setTheme({ gradientAngle: Number(e.target.value) })} />
                </Field>
              </>
            )}

            {theme.backgroundKind === "gallery" && (
              <div className="gallery">
                {GALLERY.map((g) => (
                  <button key={g.id} className={`gallery-item ${theme.galleryId === g.id ? "on" : ""}`}
                    onClick={() => setTheme({ backgroundKind: "gallery", galleryId: g.id, textColor: g.text })}
                    aria-pressed={theme.galleryId === g.id}>
                    <SlideRenderer slide={null} theme={{ ...theme, backgroundKind: "gallery", galleryId: g.id, overlay: 0, blur: 0, brightness: 1 }} />
                    <span>{g.name}</span>
                  </button>
                ))}
              </div>
            )}

            {theme.backgroundKind === "image" && (
              <div
                className={`dropzone ${dragOver ? "over" : ""}`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); onImage(e.dataTransfer.files[0]); }}
              >
                {theme.backgroundImage ? (
                  <div className="dz-current">
                    <span className="dz-thumb" style={{ backgroundImage: `url("${theme.backgroundImage}")` }} />
                    <div>
                      <strong>Your image</strong>
                      <p className="muted small">Resized to fit a 1920 × 1080 screen and saved inside VerseLight, so it works offline.</p>
                      <div className="row">
                        <button className="btn small" onClick={() => upload.current?.click()}><Icon name="upload" size={14} />Replace</button>
                        <button className="btn ghost small" onClick={() => setTheme({ backgroundImage: "" })}>Remove</button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <Icon name="image" size={26} />
                    <p>Drop an image here, or</p>
                    <button className="btn primary small" onClick={() => upload.current?.click()}><Icon name="upload" size={14} />Choose image</button>
                    <p className="muted small">JPG, PNG or WebP. Use photos you own or are licensed to project.</p>
                  </>
                )}
                <input ref={upload} type="file" accept="image/*" hidden onChange={(e) => { onImage(e.target.files?.[0]); e.target.value = ""; }} />
              </div>
            )}
            {error && <div className="alert">{error}</div>}
          </section>

          <section className="bg-section">
            <h3>Adjust background</h3>
            <Field label={`Brightness · ${Math.round(theme.brightness * 100)}%`}>
              <input type="range" min={0.4} max={1.4} step={0.05} value={theme.brightness} onChange={(e) => setTheme({ brightness: Number(e.target.value) })} />
            </Field>
            <Field label={`Dark overlay · ${Math.round(theme.overlay * 100)}%`} hint="Darkens the background so text stays readable.">
              <input type="range" min={0} max={0.85} step={0.05} value={theme.overlay} onChange={(e) => setTheme({ overlay: Number(e.target.value) })} />
            </Field>
            <Field label={`Blur · ${theme.blur === 0 ? "off" : theme.blur}`}>
              <input type="range" min={0} max={20} step={1} value={theme.blur} onChange={(e) => setTheme({ blur: Number(e.target.value) })} />
            </Field>
          </section>

          <section className="bg-section">
            <h3>Text</h3>
            <div className="row2">
              <Field label="Font">
                <select value={theme.fontFamily} onChange={(e) => setTheme({ fontFamily: e.target.value as FontKey })}>
                  {Object.entries(FONTS).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}
                </select>
              </Field>
              <Field label="Alignment">
                <select value={theme.align} onChange={(e) => setTheme({ align: e.target.value as Theme["align"] })}>
                  <option value="center">Centred</option>
                  <option value="left">Left</option>
                </select>
              </Field>
            </div>
            <Field label="Bilingual scripture" hint="How English and Malayalam show together on screen.">
              <div className="seg full" role="radiogroup" aria-label="Bilingual layout">
                <button role="radio" aria-checked={theme.bilingualLayout !== "columns"} className={theme.bilingualLayout !== "columns" ? "on" : ""} onClick={() => setTheme({ bilingualLayout: "stacked" })}>Stacked</button>
                <button role="radio" aria-checked={theme.bilingualLayout === "columns"} className={theme.bilingualLayout === "columns" ? "on" : ""} onClick={() => setTheme({ bilingualLayout: "columns" })}>Side by side</button>
              </div>
            </Field>
            <Field label={`Font size · ${theme.fontSize}% of screen height`} hint="Long slides still shrink to fit automatically.">
              <input type="range" min={4} max={12} step={0.5} value={theme.fontSize} onChange={(e) => setTheme({ fontSize: Number(e.target.value) })} />
            </Field>
            <div className="row2">
              <Field label="Text colour"><input type="color" value={theme.textColor} onChange={(e) => setTheme({ textColor: e.target.value })} /></Field>
              <div className="checks">
                <label className="check"><input type="checkbox" checked={theme.shadow} onChange={(e) => setTheme({ shadow: e.target.checked })} />Text shadow</label>
                <label className="check"><input type="checkbox" checked={theme.showReference} onChange={(e) => setTheme({ showReference: e.target.checked })} />Reference and credits</label>
              </div>
            </div>
            <button className="btn ghost small" onClick={() => setTheme(DEFAULT_THEME)}>Reset this look</button>
          </section>
        </div>
      </main>
    </div>
  );
}
