/**
 * ConfirmDialog — xác nhận in-app thay cho window.confirm (user yêu cầu:
 * "tất cả alert đều thành cửa sổ"). Overlay token-based #1E2329 / hairline,
 * không dùng các dialog native của browser. API: useConfirm()(opts) → Promise<boolean>.
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { CircleAlert } from "lucide-react";

export interface ConfirmOptions {
  /** Tiêu đề cửa sổ (mặc định "Xác nhận"). */
  title?: string;
  /** Nội dung — chấp nhận JSX (in số liệu mono, <strong>…). */
  message: ReactNode;
  /** "danger" → nút OK màu đỏ (hành động mất tiền); mặc định vàng CTA. */
  tone?: "danger" | "primary";
  /** Nhãn nút xác nhận (mặc định "Xác nhận"). */
  okLabel?: string;
  /** Nhãn nút hủy (mặc định "Hủy"). */
  cancelLabel?: string;
}

interface PendingOptions extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

const ConfirmCtx = createContext<(o: ConfirmOptions) => Promise<boolean>>(() => Promise.resolve(false));

export function useConfirm(): (o: ConfirmOptions) => Promise<boolean> {
  return useContext(ConfirmCtx);
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingOptions | null>(null);

  const confirm = useCallback(
    (o: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setPending({ ...o, resolve });
      }),
    [],
  );

  const settle = useCallback(
    (value: boolean) => {
      pending?.resolve(value);
      setPending(null);
    },
    [pending],
  );

  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        settle(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, settle]);

  const tone = pending?.tone ?? "primary";

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {pending && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
          onClick={() => settle(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={pending.title ?? "Xác nhận"}
            className="card w-full max-w-md !p-0 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5">
              <div className="flex items-start gap-3">
                <CircleAlert
                  size={20}
                  className={tone === "danger" ? "text-err shrink-0 mt-0.5" : "text-primary shrink-0 mt-0.5"}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-semibold font-display text-txt">
                    {pending.title ?? "Xác nhận"}
                  </h3>
                  <div className="mt-2 text-sm text-subtle whitespace-pre-wrap">{pending.message}</div>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-line px-5 py-4">
              <button type="button" className="btn btn-outline cursor-pointer" onClick={() => settle(false)}>
                {pending.cancelLabel ?? "Hủy"}
              </button>
              <button
                type="button"
                autoFocus
                className={`btn cursor-pointer ${tone === "danger" ? "btn-danger" : "btn-cta"}`}
                onClick={() => settle(true)}
              >
                {pending.okLabel ?? "Xác nhận"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmCtx.Provider>
  );
}
