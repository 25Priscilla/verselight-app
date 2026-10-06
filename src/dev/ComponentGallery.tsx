import { useState } from "react";
import { Icon, type IconName } from "../components/Icon";
import {
  Button, Card, Checkbox, Chip, ConfirmDialog, Drawer, EmptyState, Field, FilterChip, IconButton, ListRow, Menu, MenuDivider,
  MenuItem, Modal, Popover, SearchField, Segmented, Select, StatusChip, TextArea, TextInput, Toast, type ButtonVariant,
} from "../components/ui";

/**
 * Development only (npm run dev, then open /?gallery). Shows every shared component and token so the
 * design system can be reviewed on its own. Never included in the installed app.
 */

const COLORS = [
  ["--bg", "Page"], ["--surface", "Panel"], ["--surface-2", "Raised"], ["--surface-hover", "Hover"], ["--border", "Border"],
  ["--text", "Text"], ["--text-muted", "Muted text"], ["--text-soft", "Soft text"], ["--accent", "Accent"], ["--accent-soft", "Accent soft"],
  ["--live", "Live"], ["--danger-text", "Danger text"], ["--success", "Success"], ["--warning", "Warning"],
];
const TYPE = [["--text-2xl", "Page title"], ["--text-xl", "Section title"], ["--text-lg", "Large"], ["--text-md", "Body"], ["--text-sm", "Label"], ["--text-xs", "Caption"]];
const SPACE = ["--space-1", "--space-2", "--space-3", "--space-4", "--space-5", "--space-6", "--space-8", "--space-10"];
const VARIANTS: ButtonVariant[] = ["primary", "secondary", "quiet", "live", "live-outline", "danger"];
const ICONS: IconName[] = [
  "home", "calendar", "book", "music", "image", "settings", "help", "search", "plus", "edit", "trash", "eye", "eyeOff", "menu", "more",
  "play", "stop", "square", "prev", "next", "up", "down", "x", "check", "checkCircle", "info", "warning", "star", "clock", "link",
  "external", "upload", "download", "copy", "bookmark", "monitor", "type", "refresh", "grip", "study",
];

const CSS = `
.gallery-page { height: 100%; overflow-y: auto; }
.gallery-inner { max-width: 1080px; margin: 0 auto; padding: 32px 32px 80px; display: flex; flex-direction: column; gap: 28px; }
.gallery-inner > header h1 { font: 600 var(--text-2xl)/1.2 var(--font-read); }
.g-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
.g-swatch { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--text-muted); }
.g-swatch span:first-child { height: 44px; border-radius: var(--radius-sm); border: 1px solid var(--border); }
.g-row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.g-col { display: flex; flex-direction: column; gap: 12px; }
.g-two { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.g-space { display: flex; align-items: center; gap: 12px; font-size: 12px; color: var(--text-muted); }
.g-space span:first-child { height: 12px; background: var(--accent); border-radius: 2px; }
.g-icons { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 8px; }
.g-icons div { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 10px 4px; border-radius: var(--radius-sm); background: var(--surface-2); font-size: 11px; color: var(--text-muted); }
.g-stage { position: relative; height: 420px; border: 1px dashed var(--border); border-radius: var(--radius); overflow: hidden; display: grid; place-items: center; }
.g-anchor { position: relative; }
.g-anchor .popover, .g-anchor .menu { position: absolute; top: calc(100% + 6px); left: 0; }
.g-list { margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; max-width: 360px; }
`;

export function ComponentGallery() {
  const [seg, setSeg] = useState<"en" | "ml" | "both">("en");
  const [filters, setFilters] = useState({ fav: true, recent: false });
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const [checked, setChecked] = useState(true);
  const [row, setRow] = useState(1);
  const [open, setOpen] = useState<null | "modal" | "confirm" | "drawer" | "popover" | "menu" | "toast">(null);
  const close = () => setOpen(null);

  return (
    <div className="gallery-page">
      <style>{CSS}</style>
      <div className="gallery-inner">
        <header>
          <h1>VerseLight components</h1>
          <p className="muted">Development only. Everything here is built from src/styles/tokens.css and src/components/ui.</p>
        </header>

        <Card title="Colours">
          <div className="g-grid">
            {COLORS.map(([v, name]) => (
              <div key={v} className="g-swatch"><span style={{ background: `var(${v})` }} /><span>{name} · {v}</span></div>
            ))}
          </div>
        </Card>

        <div className="g-two">
          <Card title="Type">
            {TYPE.map(([v, name]) => <div key={v} style={{ fontSize: `var(${v})` }}>{name} · {v}</div>)}
            <div style={{ font: "var(--text-xl)/1.4 var(--font-read)" }}>Reading serif for scripture and lyrics</div>
            <div lang="ml" style={{ font: "var(--text-lg)/1.8 var(--font-read)" }}>മലയാളം വായനാ അക്ഷരം</div>
          </Card>
          <Card title="Space">
            {SPACE.map((v) => <div key={v} className="g-space"><span style={{ width: `var(${v})` }} /><span>{v}</span></div>)}
          </Card>
        </div>

        <Card title="Buttons">
          {(["md", "sm", "lg"] as const).map((size) => (
            <div key={size} className="g-row">
              {VARIANTS.map((v) => <Button key={v} variant={v} size={size} icon={v === "live" ? "play" : v === "live-outline" ? "stop" : undefined}>{v}</Button>)}
              <Button size={size} disabled>Disabled</Button>
            </div>
          ))}
          <div className="g-row">
            <IconButton icon="more" label="More" />
            <IconButton icon="star" label="Favourite" active />
            <IconButton icon="trash" label="Delete" />
            <IconButton icon="x" label="Close" size="sm" />
            <IconButton icon="refresh" label="Refresh" disabled />
            <button className="linklike">Link-style button</button>
          </div>
        </Card>

        <div className="g-two">
          <Card title="Form">
            <Field label="Song title" hint="In the song's own language."><TextInput value={text} onChange={(e) => setText(e.target.value)} placeholder="Amazing Grace" /></Field>
            <Field label="Copyright" optional><TextInput placeholder="Public domain" /></Field>
            <Field label="Translation"><Select defaultValue="kjv"><option value="kjv">KJV · King James Version</option><option>Malayalam 1910</option></Select></Field>
            <Field label="Notes"><TextArea rows={3} placeholder="Anything the next volunteer should know" /></Field>
            <Checkbox label="Show reference and song credit" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
            <SearchField label="Search songs" value={search} onChange={setSearch} onClear={() => setSearch("")} placeholder="Search songs · പാട്ട് തിരയുക" compact />
            <SearchField label="Search the Bible" value="" onChange={() => undefined} placeholder="John 3:16, or any words…" />
          </Card>
          <Card title="Choices and status">
            <div className="g-row">
              <Segmented label="Bible language" value={seg} onChange={setSeg}
                options={[{ value: "en", label: "English" }, { value: "ml", label: "മലയാളം", lang: "ml" }, { value: "both", label: "Both" }]} />
            </div>
            <Segmented label="Background" value={seg === "en" ? "en" : "ml"} onChange={(v) => setSeg(v)} full
              options={[{ value: "en", label: "Solid" }, { value: "ml", label: "Gradient" }]} />
            <div className="g-row">
              <FilterChip selected={filters.fav} icon="star" onClick={() => setFilters((f) => ({ ...f, fav: !f.fav }))}>Favourites</FilterChip>
              <FilterChip selected={filters.recent} icon="clock" onClick={() => setFilters((f) => ({ ...f, recent: !f.recent }))}>Recent</FilterChip>
              <Chip icon="book">3 verses</Chip>
            </div>
            <div className="g-row">
              <StatusChip tone="off">Projector off</StatusChip>
              <StatusChip tone="ready">Projector ready</StatusChip>
              <StatusChip tone="live">Live on EPSON</StatusChip>
              <StatusChip tone="warning">Only one screen</StatusChip>
            </div>
          </Card>
        </div>

        <div className="g-two">
          <Card title="List rows" actions={<IconButton icon="plus" label="New song" size="sm" />}>
            <ul className="g-list">
              {["Amazing Grace", "Be Thou My Vision", "പരീക്ഷണ ഗാനം"].map((t, i) => (
                <ListRow key={t} title={t} subtitle={i === 2 ? "Pareekshana ganam" : "Writer name"} lang={i === 2 ? "ml" : undefined}
                  leading={<Icon name="music" size={16} />} selected={row === i} onClick={() => setRow(i)}
                  actions={<><IconButton icon="plus" label="Add to service" size="sm" /><IconButton icon="play" label="Show now" size="sm" /></>} />
              ))}
            </ul>
          </Card>
          <Card title="Empty state">
            <EmptyState title="Your song library is empty" icon="music" action={<Button variant="primary" icon="plus">New song</Button>}>
              <p>Add a song, or import songs from a file.</p>
            </EmptyState>
          </Card>
        </div>

        <Card title="Overlays">
          <div className="g-row">
            <Button onClick={() => setOpen("modal")}>Modal</Button>
            <Button onClick={() => setOpen("confirm")}>Confirm dialog</Button>
            <Button onClick={() => setOpen("drawer")}>Drawer</Button>
            <span className="g-anchor">
              <Button onClick={() => setOpen(open === "popover" ? null : "popover")} data-g-toggle>Popover</Button>
              {open === "popover" && (
                <Popover label="Text style" title="Text style" onClose={close} ignore="[data-g-toggle]">
                  <Field label="Font"><Select><option>Lora (serif)</option></Select></Field>
                  <Checkbox label="Text shadow" defaultChecked />
                </Popover>
              )}
            </span>
            <span className="g-anchor">
              <Button onClick={() => setOpen(open === "menu" ? null : "menu")} icon="more" data-g-toggle>Menu</Button>
              {open === "menu" && (
                <Menu label="Song actions" onClose={close} ignore="[data-g-toggle]">
                  <MenuItem icon="edit" onSelect={close}>Edit song</MenuItem>
                  <MenuItem icon="copy" onSelect={close}>Duplicate</MenuItem>
                  <MenuDivider />
                  <MenuItem icon="trash" danger onSelect={close}>Delete song…</MenuItem>
                </Menu>
              )}
            </span>
            <Button onClick={() => setOpen("toast")}>Toast</Button>
          </div>
          <div className="g-stage">
            <span className="muted small">Drawers slide in over the working area</span>
            {open === "drawer" && (
              <Drawer title="Add a song" subtitle="to Sunday Service" onClose={close} actions={<Button variant="primary" onClick={close}>Done</Button>}>
                <SearchField label="Search songs" value="" onChange={() => undefined} placeholder="Search songs" compact />
                <ul className="g-list">
                  <ListRow title="Amazing Grace" subtitle="John Newton" actionsAlwaysVisible actions={<Button size="sm" icon="plus">Add</Button>} />
                  <ListRow title="Be Thou My Vision" subtitle="Irish traditional" actionsAlwaysVisible actions={<Button size="sm" icon="plus">Add</Button>} />
                </ul>
              </Drawer>
            )}
          </div>
        </Card>

        <Card title="Icons">
          <div className="g-icons">{ICONS.map((n) => <div key={n}><Icon name={n} size={20} />{n}</div>)}</div>
        </Card>
      </div>

      {open === "modal" && (
        <Modal title="Import a Bible" onClose={close}
          actions={<><Button variant="quiet" onClick={close}>Cancel</Button><Button variant="primary" onClick={close}>Import Bible</Button></>}>
          <p className="muted">Choose a Bible file from a source you're allowed to use.</p>
          <div className="row2">
            <Field label="Name"><TextInput defaultValue="King James Version" /></Field>
            <Field label="Short name"><TextInput defaultValue="KJV" /></Field>
          </div>
        </Modal>
      )}
      {open === "confirm" && (
        <ConfirmDialog title="Delete this song?" message="Amazing Grace will be removed from your library and from any services that use it."
          confirmLabel="Delete song" onConfirm={close} onCancel={close} />
      )}
      {open === "toast" && <Toast message="Removed Amazing Grace" action={{ label: "Undo", onClick: close }} onDismiss={close} timeout={5000} />}
    </div>
  );
}
