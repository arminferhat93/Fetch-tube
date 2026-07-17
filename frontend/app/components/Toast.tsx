import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export type ToastType = "success" | "error" | "info" | "warning";

export interface Toast {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration?: number;
}

interface ToastCtx {
  addToast: (t: Omit<Toast, "id">) => void;
}

const ToastContext = createContext<ToastCtx | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

const ICONS: Record<ToastType, string> = {
  success: "✓",
  error: "✕",
  info: "ℹ",
  warning: "⚠",
};

const STYLES: Record<ToastType, { wrap: string; icon: string; title: string }> = {
  success: {
    wrap: "bg-zinc-900 border-green-500/30 shadow-green-500/5",
    icon: "text-green-400 bg-green-500/10",
    title: "text-green-300",
  },
  error: {
    wrap: "bg-zinc-900 border-red-500/30 shadow-red-500/5",
    icon: "text-red-400 bg-red-500/10",
    title: "text-red-300",
  },
  info: {
    wrap: "bg-zinc-900 border-blue-500/30 shadow-blue-500/5",
    icon: "text-blue-400 bg-blue-500/10",
    title: "text-blue-300",
  },
  warning: {
    wrap: "bg-zinc-900 border-amber-500/30 shadow-amber-500/5",
    icon: "text-amber-400 bg-amber-500/10",
    title: "text-amber-300",
  },
};

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const s = STYLES[toast.type];

  const dismiss = useCallback(() => {
    setLeaving(true);
    setTimeout(() => onDismiss(toast.id), 350);
  }, [toast.id, onDismiss]);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    const t = setTimeout(dismiss, toast.duration ?? 5000);
    return () => clearTimeout(t);
  }, [dismiss, toast.duration]);

  return (
    <div
      className={`flex items-start gap-3 w-80 p-4 rounded-2xl border shadow-xl backdrop-blur-sm transition-all duration-350
        ${s.wrap}
        ${visible && !leaving ? "opacity-100 translate-x-0" : "opacity-0 translate-x-5"}`}
    >
      <span
        className={`mt-0.5 w-7 h-7 flex items-center justify-center rounded-lg text-sm font-bold shrink-0 ${s.icon}`}
      >
        {ICONS[toast.type]}
      </span>
      <div className="flex-1 min-w-0">
        {toast.title && (
          <p className={`text-sm font-semibold leading-tight ${s.title}`}>
            {toast.title}
          </p>
        )}
        <p className="text-sm text-zinc-400 leading-snug mt-0.5">{toast.message}</p>
      </div>
      <button
        onClick={dismiss}
        className="text-zinc-600 hover:text-zinc-300 transition-colors mt-0.5 shrink-0"
        aria-label="Dismiss"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path
            d="M1 1l12 12M13 1L1 13"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((t: Omit<Toast, "id">) => {
    const id = Math.random().toString(36).slice(2, 9);
    setToasts((prev) => [...prev, { ...t, id }]);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto">
            <ToastItem toast={t} onDismiss={dismiss} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
