/**
 * ToastProvider — notification "toast" đơn giản, hỗ trợ aria-live
 * cho trạng thái tx (T6.6 — UX accessibility), không làm UI gẫy.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, XCircle, Loader2, Info, X } from "lucide-react";
import { shortAddress } from "@/lib/format";

export type ToastKind = "success" | "error" | "info" | "pending";

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  /** transaction hash nếu có (hiển thị gắn link với explorer) */
  hash?: string;
  /** URL explore khi click (toasts live trong 4s old) */
  explorer?: string;
  /** true nếu javít cần user click để đóng (error) — mặc định auto-dismiss */
  sticky?: boolean;
}

interface ToastCtx {
  push: (t: Omit<Toast, "id"> & { id?: number }) => Toast | null;
  dismiss: (id: number) => void;
}

const Ctx = createContext<ToastCtx | null>(null);
let toastSeq = 1;

export const EXPLORERS: Record<number, string> = {
  31337: "", // local — chỉ hiện hash, no link
  11155111: "https://sepolia.etherscan.io/tx/",
};

export function useToast(): ToastCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast: phải nằm trong <ToastProvider>");
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number): void => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback<ToastCtx["push"]>(
    (t) => {
      const id = t.id ?? toastSeq++;
      setToasts((prev) => [...prev.filter((x) => x.id !== id), { ...t, id }]);
      return { ...t, id };
    },
    [],
  );

  const value = useMemo(() => ({ push, dismiss }), [push, dismiss]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {/* aria-live: screen reader đọc nội dung toast khi tx xong/lỗi */}
      <div aria-live="polite" className="fixed bottom-[4.25rem] sm:bottom-4 right-4 z-50 flex flex-col gap-2 max-w-[95vw]">
        {toasts.map((t) => (
          <ToastRow key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </Ctx.Provider>
  );
}

const ICON = {
  success: <CheckCircle2 className="text-ok" size={20} />,
  error: <XCircle className="text-err" size={20} />,
  info: <Info className="text-subtle" size={20} />,
  pending: <Loader2 className="text-secondary animate-spin" size={20} />,
} as const;

function ToastRow({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  // Auto-dismiss sau 4.5s nếu không sticky (error thường để user đọc lâu hơn)
  useEffect(() => {
    if (toast.sticky) return;
    const timer = window.setTimeout(onDismiss, 4500);
    return () => window.clearTimeout(timer);
  }, [toast.sticky, onDismiss]);

  const border =
    toast.kind === "error" ? "border-err/50" : toast.kind === "success" ? "border-ok/50" : "border-line";
  const link = toast.hash && toast.explorer ? `${toast.explorer}${toast.hash}` : undefined;
  return (
    <div
      role="status"
      className={`card !rounded-xl ${border} flex items-center gap-3 min-w-[280px] shadow-lg shadow-black/40`}
    >
      {ICON[toast.kind]}
      <div className="flex-1">
        <div className="text-sm">{toast.message}</div>
        {link && (
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className="text-xs underline text-secondary hover:text-primary cursor-pointer"
          >
            Xem trên explorer ↗
          </a>
        )}
        {toast.hash && !link && <div className="text-xs text-subtle">{shortAddress(toast.hash)}</div>}
      </div>
      <button type="button" onClick={onDismiss} aria-label="Đóng thông báo" className="cursor-pointer">
        <X className="text-subtle hover:text-txt cursor-pointer" size={18} />
      </button>
    </div>
  );
}
