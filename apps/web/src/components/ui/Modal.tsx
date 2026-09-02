import { ReactNode, useEffect } from "react";
import { X } from "lucide-react";
import { IconButton } from "./Button";

/**
 * Centred dialog on desktop, bottom sheet on phones — the sheet keeps the
 * content within thumb reach and matches what an iPhone user expects.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  footer,
  children,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    // Stop the page behind the sheet from scrolling with it.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  const width = size === "sm" ? "sm:max-w-sm" : size === "lg" ? "sm:max-w-2xl" : "sm:max-w-lg";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px] motion-safe:animate-[fade_140ms_ease-out]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-surface shadow-2xl motion-safe:animate-[sheet_180ms_cubic-bezier(0.32,0.72,0,1)] sm:rounded-2xl ${width} [padding-bottom:env(safe-area-inset-bottom)] sm:[padding-bottom:0]`}
      >
        {/* Drag affordance — signals "swipe/tap away" on touch. */}
        <div className="flex justify-center pt-2.5 sm:hidden">
          <span className="h-1 w-9 rounded-full bg-line-strong" />
        </div>

        <header className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 sm:pt-5">
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight text-ink">{title}</h2>
            {description && (
              <p className="mt-1 text-sm leading-relaxed text-ink-muted">{description}</p>
            )}
          </div>
          <IconButton icon={X} label="Закрыть" onClick={onClose} className="-mt-1 -mr-2" />
        </header>

        {children && <div className="overflow-y-auto px-5 pb-2">{children}</div>}

        {footer && (
          <footer className="flex flex-col-reverse gap-2 border-t border-line px-5 py-4 sm:flex-row sm:justify-end">
            {footer}
          </footer>
        )}
      </div>

      <style>{`
        @keyframes fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes sheet {
          from { opacity: 0; transform: translateY(12px) scale(0.99) }
          to { opacity: 1; transform: translateY(0) scale(1) }
        }
      `}</style>
    </div>
  );
}
