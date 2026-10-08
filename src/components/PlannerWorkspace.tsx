import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { newId } from "../lib/id";
import { activeService, entryInfo, moveEntry, planEntries, setEntries, updateService } from "../lib/plan";
import type { NewPlanEntry, PlanEntry, Song } from "../lib/types";
import { SERVICE_NAME, useLibrary } from "../state/library";
import { Icon } from "./Icon";
import { PlannerAddDialog } from "./PlannerAddDialog";
import { Button, EmptyState, IconButton, Menu, MenuItem, cx } from "./ui";

interface Props {
  /** The translation being read on the Bible screen, offered first when adding a reading */
  readingBibleId: string;
  /** The service item being presented, or null */
  liveEntryId: string | null;
  /** The service is on the projector now */
  live: boolean;
  /** Clicking a row puts that item on screen (only while presenting) */
  canJump: boolean;
  onPresent: () => void;
  onPresentEntry: (index: number) => void;
}

/**
 * The Service Planner: the order of service, prepared ahead and presented with one press.
 * Only the title, + Add, Present and the rows. Presenting controls stay in the Presentation Panel.
 */
export function PlannerWorkspace({ readingBibleId, liveEntryId, live, canJump, onPresent, onPresentEntry }: Props) {
  const { library, update } = useLibrary();
  const service = activeService(library);
  const entries = planEntries(library);
  const songs = useMemo(() => new Map(library.items.filter((i): i is Song => i.kind === "song").map((s) => [s.id, s])), [library.items]);
  const [adding, setAdding] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const listRef = useRef<HTMLOListElement>(null);

  const change = (fn: (list: PlanEntry[]) => PlanEntry[]) => update((lib) => setEntries(lib, fn));
  const move = (from: number, to: number) => change((list) => moveEntry(list, from, to));
  const add = (entry: NewPlanEntry) => change((list) => [...list, { ...entry, id: newId() } as PlanEntry]);
  const rename = (id: string, label: string) => change((list) => list.map((e) => (e.id === id ? { ...e, label: label.trim() || undefined } : e)));
  const remove = (id: string) => change((list) => list.filter((e) => e.id !== id));

  // Alt+↑ / Alt+↓ on a row's handle moves it, for reordering without a mouse.
  const onGripKey = (e: KeyboardEvent, i: number) => {
    const to = e.altKey && e.key === "ArrowUp" ? i - 1 : e.altKey && e.key === "ArrowDown" ? i + 1 : -1;
    if (to < 0 || to >= entries.length) return;
    e.preventDefault();
    move(i, to);
    requestAnimationFrame(() => listRef.current?.querySelectorAll<HTMLElement>(".plan-grip")[to]?.focus());
  };

  const addButton = <Button icon="plus" onClick={() => setAdding(true)}>Add</Button>;

  return (
    <main className="page planner">
      <div className="page-inner">
        <header className="planner-head">
          <input className="planner-title" value={service?.name ?? ""} placeholder={SERVICE_NAME} aria-label="Service name"
            onChange={(e) => update((lib) => updateService(lib, () => ({ name: e.target.value })))}
            onBlur={(e) => { if (!e.target.value.trim()) update((lib) => updateService(lib, () => ({ name: SERVICE_NAME }))); }}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
          {entries.length > 0 && addButton}
          {entries.length > 0 && (live ? (
            <span className="planner-live" role="status"><span className="dot" aria-hidden />Presenting</span>
          ) : (
            <Button variant="live" icon="play" onClick={onPresent} title="Show the service on the projector, starting with the first item">Present</Button>
          ))}
        </header>

        {entries.length === 0 ? (
          <div className="planner-empty">
            <EmptyState title="Service Planner" icon="calendar" action={addButton}>
              <p>Add songs and Bible passages to prepare your service.</p>
            </EmptyState>
          </div>
        ) : (
          <ol className="plan-list" ref={listRef} aria-label="Order of service">
            {entries.map((entry, i) => {
              const info = entryInfo(entry, songs, library.bibles);
              const on = entry.id === liveEntryId;
              const text = (
                <>
                  <span className="plan-num">{i + 1}</span>
                  <span className={cx("plan-kind", on && "on")}><Icon name={entry.kind === "song" ? "music" : "book"} size={18} /></span>
                  <span className="plan-text">
                    {renaming === entry.id ? (
                      <input className="plan-rename" autoFocus defaultValue={entry.label ?? ""} placeholder={info.label} aria-label="Item label"
                        onClick={(e) => e.stopPropagation()}
                        onBlur={(e) => { rename(entry.id, e.target.value); setRenaming(null); }}
                        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
                    ) : <span className="plan-label">{info.label}</span>}
                    <span className="plan-title" lang={info.lang}>
                      {info.title}{info.tag && <span className="plan-tag">{info.tag}</span>}
                    </span>
                    {info.problem && <span className="plan-problem">{info.problem}</span>}
                  </span>
                </>
              );
              return (
                <li key={entry.id}
                  className={cx("plan-row", on && "on", info.problem && "missing", dragFrom === i && "dragging", dragOver === i && dragFrom !== i && "drop")}
                  aria-current={on ? "true" : undefined}
                  onDragOver={(e) => { if (dragFrom !== null) { e.preventDefault(); setDragOver(i); } }}
                  onDrop={(e) => { e.preventDefault(); if (dragFrom !== null && dragFrom !== i) move(dragFrom, i); setDragFrom(null); setDragOver(null); }}>
                  <span className="plan-grip" role="button" tabIndex={0} draggable
                    aria-label={`Move ${info.title}. Drag, or press Alt and the up or down arrow`} title="Drag to reorder"
                    onDragStart={(e) => { setDragFrom(i); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", info.title); }}
                    onDragEnd={() => { setDragFrom(null); setDragOver(null); }}
                    onKeyDown={(e) => onGripKey(e, i)}>
                    <Icon name="grip" size={16} />
                  </span>
                  {canJump && renaming !== entry.id ? (
                    <button type="button" className="plan-main" onClick={() => onPresentEntry(i)}
                      title={on ? "On screen now" : "Show this on the projector now"}>{text}</button>
                  ) : <div className="plan-main">{text}</div>}
                  <IconButton icon="more" label={`More for ${info.title}`} size="sm" className="plan-more" data-plan-menu
                    aria-haspopup="menu" aria-expanded={menu === entry.id} onClick={() => setMenu((m) => (m === entry.id ? null : entry.id))} />
                  {menu === entry.id && (
                    <Menu label={`${info.title} actions`} className="plan-menu" ignore="[data-plan-menu]" onClose={() => setMenu(null)}>
                      <MenuItem icon="edit" onSelect={() => { setMenu(null); setRenaming(entry.id); }}>Rename label</MenuItem>
                      <MenuItem icon="trash" danger onSelect={() => { setMenu(null); remove(entry.id); }}>Remove</MenuItem>
                    </Menu>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>
      {adding && <PlannerAddDialog readingBibleId={readingBibleId} onAdd={(e) => { add(e); setAdding(false); }} onClose={() => setAdding(false)} />}
    </main>
  );
}
