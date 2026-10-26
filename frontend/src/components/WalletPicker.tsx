/**
 * WalletPicker — modal chọn ví khi trang có ≥2 wallet cài song song
 * (EIP-6963: MetaMask, Rabby, OKX…). User bấm chọn → connect qua provider đó.
 * Binance style: backdrop đen mờ, card #1E2329 phẳng + hairline (không glass).
 */
import { useEffect } from "react";
import { X } from "lucide-react";
import { useWallet, type WalletEntry } from "@/providers/WalletProvider";

export default function WalletPicker() {
  const { wallets, pickOpen, closePicker, connect, connecting } = useWallet();

  /* ESC để đóng; khoá scroll nền khi modal mở */
  useEffect(() => {
    if (!pickOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePicker();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [pickOpen, closePicker]);

  if (!pickOpen) return null;

  const pick = (entry: WalletEntry) => {
    closePicker();
    void connect(entry);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center px-4"
      onClick={closePicker}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Chọn ví để kết nối"
        className="card w-full max-w-sm !p-0 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <div>
            <span className="eyebrow !text-muted">Kết nối ví</span>
            <h2 className="mt-1.5 text-base font-display font-semibold">Chọn ví của bạn</h2>
          </div>
          <button
            type="button"
            aria-label="Đóng"
            className="grid place-items-center w-8 h-8 rounded-md text-subtle hover:text-txt hover:bg-panel cursor-pointer transition-colors duration-200"
            onClick={closePicker}
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-3">
          {wallets.map((w) => (
            <button
              key={w.info.uuid}
              type="button"
              disabled={connecting}
              onClick={() => pick(w)}
              className="w-full flex items-center gap-3 rounded-lg border border-transparent hover:border-line hover:bg-panel px-3 py-2.5 cursor-pointer transition-colors duration-200 text-left disabled:opacity-45"
            >
              <img src={w.info.icon} alt="" width={28} height={28} className="rounded-md" />
              <span className="text-sm font-semibold text-txt">{w.info.name}</span>
              <span className="ml-auto text-xs text-subtle">{w.info.rdns}</span>
            </button>
          ))}
          <p className="px-3 pb-2 pt-1 text-xs text-muted leading-relaxed">
            Bấm vào ví bạn muốn dùng — trang chỉ giao dịch với ví đã chọn.
          </p>
        </div>
      </div>
    </div>
  );
}
