"use client";

import { CheckCircle2, CircleAlert, Info, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";

export type ToastTone = "success" | "danger" | "info";

type ToastInput = {
  title: string;
  body?: string;
  tone?: ToastTone;
  duration?: number;
};

type Toast = ToastInput & { id: number; tone: ToastTone; duration: number };

type ToastContextValue = {
  toast: (input: ToastInput) => number;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counterRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      counterRef.current += 1;
      const id = counterRef.current;
      const duration = input.duration ?? 4200;
      const next: Toast = {
        id,
        title: input.title,
        body: input.body,
        tone: input.tone ?? "info",
        duration
      };

      setToasts((prev) => [...prev.slice(-3), next]);
      if (duration > 0) {
        window.setTimeout(() => dismiss(id), duration);
      }
      return id;
    },
    [dismiss]
  );

  const value = useMemo<ToastContextValue>(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport dismiss={dismiss} toasts={toasts} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside a ToastProvider");
  }
  return context;
}

function ToastViewport({
  dismiss,
  toasts
}: {
  dismiss: (id: number) => void;
  toasts: Toast[];
}) {
  return (
    <div aria-label="Notifications" className="toast-viewport" role="region">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} onDismiss={() => dismiss(toast.id)} toast={toast} />
      ))}
    </div>
  );
}

function ToastItem({ onDismiss, toast }: { onDismiss: () => void; toast: Toast }) {
  const Icon =
    toast.tone === "success" ? CheckCircle2 : toast.tone === "danger" ? CircleAlert : Info;

  return (
    <div
      className="toast"
      data-tone={toast.tone}
      role={toast.tone === "danger" ? "alert" : "status"}
      style={
        toast.duration > 0
          ? ({ "--toast-duration": `${toast.duration}ms` } as React.CSSProperties)
          : undefined
      }
    >
      <span aria-hidden="true" className="toast-icon">
        <Icon size={16} />
      </span>
      <div className="toast-body">
        <strong>{toast.title}</strong>
        {toast.body ? <p>{toast.body}</p> : null}
      </div>
      <button
        aria-label="Dismiss notification"
        className="toast-dismiss"
        onClick={onDismiss}
        type="button"
      >
        <X aria-hidden="true" size={14} />
      </button>
      {toast.duration > 0 ? <span aria-hidden="true" className="toast-progress" /> : null}
    </div>
  );
}
