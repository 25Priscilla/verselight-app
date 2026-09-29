import { useEffect, type ReactNode } from "react";
import { Button, IconButton } from "./Button";

/**
 * A short message at the bottom of the window, with an optional action ("Undo").
 * It stays until dismissed unless `timeout` (ms) is given.
 */
export function Toast({ message, action, onDismiss, timeout, tone = "info" }: {
  message: ReactNode;
  action?: { label: string; onClick: () => void };
  /** Omit to hide the dismiss button */
  onDismiss?: () => void;
  timeout?: number;
  tone?: "info" | "error";
}) {
  useEffect(() => {
    if (!timeout || !onDismiss) return;
    const t = window.setTimeout(onDismiss, timeout);
    return () => window.clearTimeout(t);
  }, [timeout, onDismiss, message]);
  return (
    <div className={`toast${tone === "error" ? " error" : ""}`} role="status">
      <span>{message}</span>
      {action && <Button variant="quiet" size="sm" onClick={action.onClick}>{action.label}</Button>}
      {onDismiss && <IconButton icon="x" size="sm" label="Dismiss" onClick={onDismiss} />}
    </div>
  );
}
