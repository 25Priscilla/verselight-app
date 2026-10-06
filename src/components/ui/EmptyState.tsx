import type { ReactNode } from "react";
import { Icon, type IconName } from "../Icon";

/** What a screen shows when it has nothing yet: a title, one sentence, and one thing to do. */
export function EmptyState({ title, icon, action, children }: {
  title: string;
  icon?: IconName;
  /** Usually one main button */
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      {icon && <span className="empty-icon"><Icon name={icon} size={24} /></span>}
      <h3>{title}</h3>
      {children}
      {action}
    </div>
  );
}
