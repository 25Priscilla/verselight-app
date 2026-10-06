import { useEffect, type ReactNode } from "react";
import { Button, IconButton } from "./Button";

/** A centred dialog over a dimmed screen. Esc, the ✕ or a click outside closes it. */
export function Modal({ title, onClose, children, actions, className }: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Buttons for the bottom right, main action last */
  actions?: ReactNode;
  className?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${className ? ` ${className}` : ""}`} role="dialog" aria-modal aria-label={title}>
        <header>
          <h2>{title}</h2>
          <IconButton icon="x" label="Close" onClick={onClose} title="" />
        </header>
        {children}
        {actions && <div className="modal-actions">{actions}</div>}
      </div>
    </div>
  );
}

/**
 * Asks before something that can't easily be undone. The question is the title, the consequence is one sentence,
 * the risky button is named after the action ("Delete song"), and focus starts on Cancel.
 */
export function ConfirmDialog({ title, message, confirmLabel, cancelLabel = "Cancel", danger = true, onConfirm, onCancel }: {
  title: string;
  message?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** Red confirm button for destructive actions */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal title={title} onClose={onCancel} className="confirm"
      actions={<>
        <Button autoFocus onClick={onCancel}>{cancelLabel}</Button>
        <Button variant={danger ? "danger" : "primary"} onClick={onConfirm}>{confirmLabel}</Button>
      </>}>
      {message && <p className="confirm-message">{message}</p>}
    </Modal>
  );
}
