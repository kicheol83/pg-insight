import React, { createContext, useContext, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
} from "lucide-react";

interface ToastItem {
  id: string;
  type: "success" | "error" | "warning" | "info";
  title: string;
  message?: string;
}

const ToastCtx = createContext<{
  toasts: ToastItem[];
  addToast: (t: Omit<ToastItem, "id">, duration?: number) => void;
  remove: (id: string) => void;
} | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const remove = (id: string) => setToasts((p) => p.filter((t) => t.id !== id));

  const addToast = (t: Omit<ToastItem, "id">, duration = 4000) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((p) => [...p, { ...t, id }]);
    if (duration > 0) setTimeout(() => remove(id), duration);
  };

  return (
    <ToastCtx.Provider value={{ toasts, addToast, remove }}>
      {children}
      <ToastContainer />
    </ToastCtx.Provider>
  );
}

function ToastContainer() {
  const ctx = useContext(ToastCtx)!;
  const icons = {
    success: <CheckCircle2 size={15} className="text-green-400 shrink-0" />,
    error: <AlertCircle size={15} className="text-red-400 shrink-0" />,
    warning: <AlertTriangle size={15} className="text-yellow-400 shrink-0" />,
    info: <Info size={15} className="text-blue-400 shrink-0" />,
  };
  return (
    <div className="toast-container">
      {ctx.toasts.map((t) => (
        <div key={t.id} className="toast">
          {icons[t.type]}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-primary">{t.title}</p>
            {t.message && (
              <p className="text-xs text-muted mt-0.5">{t.message}</p>
            )}
          </div>
          <button
            onClick={() => ctx.remove(t.id)}
            className="text-muted hover:text-primary shrink-0"
          >
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be inside ToastProvider");
  return ctx.addToast;
}
