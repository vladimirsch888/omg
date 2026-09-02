import { InputHTMLAttributes, ReactNode, Ref, SelectHTMLAttributes, useId } from "react";

const controlBase =
  "w-full rounded-lg border border-line bg-raised px-3 text-sm text-ink transition-colors duration-150 outline-none placeholder:text-ink-subtle hover:border-line-strong focus:border-accent focus:ring-2 focus:ring-accent/25 disabled:opacity-40";

// 44px on phones, 40px from sm up — same rule as Button.
const controlHeight = "h-11 sm:h-10";

/** Label + control + optional hint, so every form field looks identical. */
export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label?: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      {label && <span className="text-xs font-medium text-ink-muted">{label}</span>}
      {children}
      {hint && <span className="text-[11px] leading-relaxed text-ink-subtle">{hint}</span>}
    </label>
  );
}

export function Input({
  className = "",
  ref,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> }) {
  return <input ref={ref} className={`${controlBase} ${controlHeight} ${className}`} {...rest} />;
}

export function Select({
  className = "",
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`${controlBase} ${controlHeight} appearance-none bg-[length:1rem] bg-[right_0.65rem_center] bg-no-repeat pr-9 ${className}`} style={caretStyle} {...rest}>
      {children}
    </select>
  );
}

/** Compact select for inline use inside table rows. */
export function SelectCompact({
  className = "",
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`${controlBase} h-9 appearance-none bg-[length:0.85rem] bg-[right_0.5rem_center] bg-no-repeat pr-8 text-xs sm:h-8 ${className}`}
      style={caretStyle}
      {...rest}
    >
      {children}
    </select>
  );
}

// Inline chevron: a native select arrow renders as an unstyleable light-grey
// triangle on a dark control in most browsers.
const caretStyle = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%23a8a29a' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m4 6 4 4 4-4'/%3E%3C/svg%3E\")",
};

export function Checkbox({
  label,
  className = "",
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const id = useId();
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <input
        id={id}
        type="checkbox"
        className="size-4.5 shrink-0 cursor-pointer appearance-none rounded-[5px] border border-line-strong bg-raised transition-colors duration-150 outline-none checked:border-accent checked:bg-accent focus-visible:ring-2 focus-visible:ring-accent/40 checked:bg-[length:0.8rem] checked:bg-center checked:bg-no-repeat"
        style={checkStyle}
        {...rest}
      />
      <label htmlFor={id} className="cursor-pointer text-sm text-ink select-none">
        {label}
      </label>
    </div>
  );
}

const checkStyle = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%230f2b28' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m3.5 8.5 3 3 6-6.5'/%3E%3C/svg%3E\")",
};

/** Read-only value shown where an input would be (e.g. immutable fields on edit). */
export function ReadonlyValue({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-ink-muted">{label}</span>
      <div className={`flex items-center rounded-lg border border-dashed border-line px-3 text-sm text-ink-muted ${controlHeight}`}>
        {value}
      </div>
    </div>
  );
}
