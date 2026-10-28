/**
 * WalletPicker — modal chọn ví mỗi khi bấm "Kết nối ví" (LUÔN hiển thị,
 * kể cả chỉ 1 ví — user chủ động chọn). Danh sách = các ví EIP-6963
 * announce (MetaMask/Rabby/OKX…) + fallback window.ethereum.
 * Binance style: backdrop đen mờ, card #1E2329 phẳng + hairline (không glass).
 */
import { useEffect } from "react";
import { X, Wallet } from "lucide-react";
import { useWallet, type WalletEntry } from "@/providers/WalletProvider";
import { useLang } from "@/lib/i18n";

export default function WalletPicker() {
  const { walletOptions, pickOpen, closePicker, connect, connecting } = useWallet();
  const { t } = useLang();

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
        aria-label={t("wallet.pickerAria")}
        className="card w-full max-w-sm !p-0 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <div>
            <span className="eyebrow !text-muted">{t("wallet.pickerEyebrow")}</span>
            <h2 className="mt-1.5 text-base font-display font-semibold">{t("wallet.pickerTitle")}</h2>
          </div>
          <button
            type="button"
            aria-label={t("common.close")}
            className="grid place-items-center w-8 h-8 rounded-md text-subtle hover:text-txt hover:bg-panel cursor-pointer transition-colors duration-200"
            onClick={closePicker}
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-3">
          {walletOptions.map((w) => (
            <button
              key={w.info.uuid}
              type="button"
              disabled={connecting}
              onClick={() => pick(w)}
              className="w-full flex items-center gap-3 rounded-lg border border-transparent hover:border-line hover:bg-panel px-3 py-2.5 cursor-pointer transition-colors duration-200 text-left disabled:opacity-45"
            >
              {w.info.icon ? (
                <img src={w.info.icon} alt="" width={28} height={28} className="rounded-md" />
              ) : (
                <span className="grid place-items-center w-7 h-7 rounded-md border border-line text-subtle">
                  <Wallet size={14} />
                </span>
              )}
              <span className="text-sm font-semibold text-txt">{w.info.name}</span>
              <span className="ml-auto text-xs text-subtle">{w.info.rdns}</span>
            </button>
          ))}
          <p className="px-3 pb-2 pt-1 text-xs text-muted leading-relaxed">
            {t("wallet.pickerHint")}
          </p>
        </div>
      </div>
    </div>
  );
}
