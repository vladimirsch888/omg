import { ButtonHTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:bg-accent-hover shadow-sm",
  secondary: "bg-raised text-ink border border-line hover:border-line-strong hover:bg-overlay",
  ghost: "text-ink-muted hover:text-ink hover:bg-raised",
  danger: "text-expense hover:bg-expense-soft",
};

// Touch targets stay at 44px on phones (Apple HIG) and tighten up on desktop,
// where a 44px-tall button in a table row looks oversized.
const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-xs sm:h-8",
  md: "h-11 px-4 text-sm sm:h-10",
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
  loading?: boolean;
  children?: ReactNode;
}

export function Button({
  variant = "secondary",
  size = "md",
  icon: Icon,
  loading = false,
  className = "",
  disabled,
  children,
  ...rest
}: Props) {
  return (
    <button
      disabled={disabled || loading}
      className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:pointer-events-none disabled:opacity-40 ${variants[variant]} ${sizes[size]} ${className}`}
      {...rest}
    >
      {loading ? (
        <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        Icon && <Icon className="size-4" strokeWidth={1.75} />
      )}
      {children}
    </button>
  );
}

/** Square icon-only button — row actions, menu triggers, close buttons. */
export function IconButton({
  icon: Icon,
  label,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={`inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors duration-150 outline-none hover:bg-raised hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:pointer-events-none disabled:opacity-40 ${className}`}
      {...rest}
    >
      <Icon className="size-4.5" strokeWidth={1.75} />
    </button>
  );
}
