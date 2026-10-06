import type { ButtonHTMLAttributes } from "react";
import { Icon, type IconName } from "../Icon";

/**
 * Button levels, one look per job:
 *   primary: the one main action on a screen · secondary: everything else · quiet: low-emphasis
 *   live: going live (red, used only for presenting) · live-outline: stop presenting · danger: confirm a delete
 */
export type ButtonVariant = "primary" | "secondary" | "quiet" | "live" | "live-outline" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "primary", secondary: "", quiet: "ghost", live: "present", "live-outline": "stop", danger: "danger-solid",
};
const SIZE: Record<ButtonSize, string> = { sm: "small", md: "", lg: "large" };
const ICON_SIZE: Record<ButtonSize, number> = { sm: 14, md: 16, lg: 18 };

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconAfter?: IconName;
  /** Full width of its container */
  wide?: boolean;
}

export function Button({ variant = "secondary", size = "md", icon, iconAfter, wide, className, children, type = "button", ...rest }: ButtonProps) {
  return (
    <button type={type} className={cx("btn", VARIANT[variant], SIZE[size], wide && "wide", className)} {...rest}>
      {icon && <Icon name={icon} size={ICON_SIZE[size]} />}
      {children}
      {iconAfter && <Icon name={iconAfter} size={ICON_SIZE[size]} />}
    </button>
  );
}

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  icon: IconName;
  /** Spoken by screen readers and shown as the tooltip */
  label: string;
  size?: "sm" | "md";
  /** Shows the button as switched on */
  active?: boolean;
}

export function IconButton({ icon, label, size = "md", active, className, type = "button", title, ...rest }: IconButtonProps) {
  return (
    <button type={type} className={cx("icon-btn", size === "sm" && "sm", active && "on", className)} aria-label={label} title={title ?? label} {...rest}>
      <Icon name={icon} size={size === "sm" ? 14 : 18} />
    </button>
  );
}
