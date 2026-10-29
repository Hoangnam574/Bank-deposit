/**
 * NetworkMenu — pill chain ở Navbar thành button; bấm mở modal chọn network
 * ngay TRONG app (Hardhat Local / Sepolia). Lý do: popup chọn network của
 * MetaMask xuất hiện rất nhanh và MetaMask có thể tự chuyển network
 * ("Automatically switch app networks") — modal của app cho user thời gian
 * chọn thoải mái; chỉ sau lựa chọn mới gọi wallet_switchEthereumChain 1 lần.
 */
import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { useWallet } from "@/providers/WalletProvider";
import { ChainPill, ALLOWED_CHAINS, CHAIN_LABEL } from "@/components/NetworkGuard";
import HardhatKeyImport from "@/components/HardhatKeyImport";
import { useLang } from "@/lib/i18n";

export default function NetworkMenu({ compact }: { compact?: boolean }) {
  const { chainId } = useWallet();
  const { t } = useLang();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label={t("chain.pillAria")}
        onClick={() => setOpen(true)}
        className="group inline-flex items-center cursor-pointer rounded-full transition-transform duration-150 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-info focus-visible:outline-offset-2"
      >
        <ChainPill chainId={chainId} compact={compact} />
      </button>

      {open && <NetworkModal onClose={() => setOpen(false)} />}
    </>
  );
}

function NetworkModal({ onClose }: { onClose: () => void }) {
  const { chainId, switchNetwork } = useWallet();
  const { t } = useLang();
  const [busy, setBusy] = useState<number | null>(null);

  const choose = async (c: number) => {
    if (chainId === c) {
      /* Local: giữ modal mở — khối key import Hardhat hiển thị theo chain local.
         Mạng khác: đóng như thường. */
      if (c !== 31337) onClose();
      return;
    }
    setBusy(c);
    const ok = await switchNetwork(c);
    setBusy(null);
    if (ok && c !== 31337) onClose();
    /* KHÔNG reload — chainChanged cập nhật chainId state, ContractsProvider
       tự rebuild theo chain mới (reactive). Chọn local → giữ modal mở để
       người dùng thấy ngay key import ví local. */
    // user bấm Cancel trong popup MetaMask → giữ modal mở để chọn lại
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center px-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("chain.modalAria")}
        className="card w-full max-w-md max-h-[85vh] overflow-y-auto !p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-line px-5 py-3.5">
          <span className="eyebrow !text-muted">{t("chain.modalEyebrow")}</span>
          <h2 className="mt-1.5 text-base font-display font-semibold">{t("chain.modalTitle")}</h2>
          <p className="text-xs text-subtle mt-1">
            {t("chain.modalHint")}
          </p>
        </div>
        <div className="p-3">
          {ALLOWED_CHAINS.map((c) => {
            const current = chainId === c;
            return (
              <button
                key={c}
                type="button"
                disabled={busy !== null}
                onClick={() => void choose(c)}
                className="w-full flex items-center gap-3 rounded-lg border border-transparent hover:border-line hover:bg-panel px-3 py-2.5 cursor-pointer transition-colors duration-200 text-left disabled:opacity-45"
              >
                <span
                  className={`inline-block w-2 h-2 rounded-full ${c === 31337 ? "bg-ok" : "bg-cta"}`}
                />
                <span className="text-sm font-semibold text-txt">{CHAIN_LABEL[c]}</span>
                <span className="text-xs text-subtle num">· {c}</span>
                <span className="ml-auto text-xs" aria-live="polite">
                  {busy === c ? (
                    <span className="text-subtle">{t("chain.switching")}</span>
                  ) : current ? (
                    <span className="inline-flex items-center gap-1 text-ok">
                      <Check size={13} /> {t("chain.current")}
                    </span>
                  ) : (
                    <span className="text-muted">{t("chain.switch")}</span>
                  )}
                </span>
              </button>
            );
          })}
          {/* Key import ví local — hiện NGAY trong modal khi đang ở Hardhat
              Local (key Hardhat không tồn tại trên Sepolia): */}
          {chainId === 31337 && (
            <div className="mt-3 pt-3 border-t border-line">
              <HardhatKeyImport defaultOpen />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
