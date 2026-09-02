import {
  createContext,
  FormEvent,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { Button } from "./Button";
import { Field, Input } from "./Field";
import { Modal } from "./Modal";

/*
  Replaces window.confirm / window.prompt / window.alert. Those render as the
  browser's own chrome — grey, unstyleable, and on iOS they show the site's
  hostname above the message, which is the fastest way to make a product feel
  unfinished. Same call sites, same await-a-value ergonomics, our own UI.
*/

interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface PromptOptions {
  title: string;
  message?: ReactNode;
  label?: string;
  defaultValue?: string;
  confirmLabel?: string;
  type?: "text" | "number";
  hint?: ReactNode;
}

type ToastTone = "success" | "error" | "info";
interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

interface UiContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  prompt: (options: PromptOptions) => Promise<string | null>;
  toast: (message: string, tone?: ToastTone) => void;
}

const UiContext = createContext<UiContextValue | null>(null);

export function useUi() {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error("useUi must be used inside <UiProvider>");
  return ctx;
}

export function UiProvider({ children }: { children: ReactNode }) {
  const [confirmState, setConfirmState] = useState<
    (ConfirmOptions & { resolve: (v: boolean) => void }) | null
  >(null);
  const [promptState, setPromptState] = useState<
    (PromptOptions & { resolve: (v: string | null) => void }) | null
  >(null);
  const [promptValue, setPromptValue] = useState("");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextToastId = useRef(1);
  const promptInputRef = useRef<HTMLInputElement>(null);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => setConfirmState({ ...options, resolve })),
    []
  );

  const prompt = useCallback(
    (options: PromptOptions) =>
      new Promise<string | null>((resolve) => {
        setPromptValue(options.defaultValue ?? "");
        setPromptState({ ...options, resolve });
      }),
    []
  );

  const toast = useCallback((message: string, tone: ToastTone = "info") => {
    const id = nextToastId.current++;
    setToasts((current) => [...current, { id, tone, message }]);
    setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), 5000);
  }, []);

  const value = useMemo(() => ({ confirm, prompt, toast }), [confirm, prompt, toast]);

  function resolveConfirm(result: boolean) {
    confirmState?.resolve(result);
    setConfirmState(null);
  }

  function resolvePrompt(result: string | null) {
    promptState?.resolve(result);
    setPromptState(null);
  }

  function submitPrompt(e: FormEvent) {
    e.preventDefault();
    resolvePrompt(promptValue);
  }

  // Focus (and select) the prompt field so the value can be overtyped at once.
  useEffect(() => {
    if (!promptState) return;
    const id = setTimeout(() => promptInputRef.current?.select(), 60);
    return () => clearTimeout(id);
  }, [promptState]);

  return (
    <UiContext.Provider value={value}>
      {children}

      <Modal
        open={confirmState !== null}
        onClose={() => resolveConfirm(false)}
        title={confirmState?.title ?? ""}
        description={confirmState?.message}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => resolveConfirm(false)}>
              {confirmState?.cancelLabel ?? "Отмена"}
            </Button>
            <Button
              variant={confirmState?.danger ? "primary" : "primary"}
              className={confirmState?.danger ? "bg-expense text-canvas hover:bg-expense/85" : ""}
              onClick={() => resolveConfirm(true)}
            >
              {confirmState?.confirmLabel ?? "Подтвердить"}
            </Button>
          </>
        }
      />

      <Modal
        open={promptState !== null}
        onClose={() => resolvePrompt(null)}
        title={promptState?.title ?? ""}
        description={promptState?.message}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => resolvePrompt(null)}>
              Отмена
            </Button>
            <Button variant="primary" onClick={() => resolvePrompt(promptValue)}>
              {promptState?.confirmLabel ?? "Подтвердить"}
            </Button>
          </>
        }
      >
        <form onSubmit={submitPrompt} className="pb-2">
          <Field label={promptState?.label} hint={promptState?.hint}>
            <Input
              ref={promptInputRef}
              type={promptState?.type ?? "text"}
              inputMode={promptState?.type === "number" ? "decimal" : undefined}
              step="0.01"
              value={promptValue}
              onChange={(e) => setPromptValue(e.target.value)}
              autoFocus
            />
          </Field>
        </form>
      </Modal>

      <ToastStack toasts={toasts} onDismiss={(id) => setToasts((c) => c.filter((t) => t.id !== id))} />
    </UiContext.Provider>
  );
}

const toastStyles: Record<ToastTone, { icon: typeof Info; className: string }> = {
  success: { icon: CheckCircle2, className: "text-income" },
  error: { icon: AlertTriangle, className: "text-expense" },
  info: { icon: Info, className: "text-accent" },
};

function ToastStack({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 px-4 pb-[calc(env(safe-area-inset-bottom)+5.5rem)] sm:bottom-4 sm:left-auto sm:right-4 sm:items-end sm:pb-0">
      {toasts.map((t) => {
        const { icon: Icon, className } = toastStyles[t.tone];
        return (
          <div
            key={t.id}
            className="pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-xl border border-line bg-overlay px-3.5 py-3 shadow-xl motion-safe:animate-[toast_180ms_ease-out]"
          >
            <Icon className={`mt-0.5 size-4 shrink-0 ${className}`} strokeWidth={2} />
            <p className="min-w-0 flex-1 text-sm leading-snug text-ink">{t.message}</p>
            <button
              onClick={() => onDismiss(t.id)}
              aria-label="Скрыть"
              className="-mt-0.5 -mr-1 rounded p-1 text-ink-subtle transition-colors hover:text-ink"
            >
              <X className="size-4" />
            </button>
          </div>
        );
      })}
      <style>{`@keyframes toast { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: translateY(0) } }`}</style>
    </div>
  );
}
