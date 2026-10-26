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

export default function NetworkMenu() {
  const { chainId } = useWallet();
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
        title="Bấm để chọn mạng (network)"
        aria-label="Chọn mạng"
        onClick={() => setOpen(true)}
        className="cursor-pointer rounded-full hover:outline hover:outline-1 hover:outline-primary/50"
      >
        <ChainPill chainId={chainId} />
      </button>

      {open && <NetworkModal onClose={() => setOpen(false)} />}
    </>
  );
}

function NetworkModal({ onClose }: { onClose: () => void }) {
  const { chainId, switchNetwork } = useWallet();
  const [busy, setBusy] = useState<number | null>(null);

  const choose = async (c: number) => {
    if (chainId === c) {
      onClose(); // đang network đó rồi — không gọi switch để tránh popup thừa
      return;
    }
    setBusy(c);
    const ok = await switchNetwork(c);
    setBusy(null);
    if (ok) {
      onClose();
      /* KHÔNG reload — chainChanged cập nhật chainId state, ContractsProvider
         tự rebuild theo chain mới (reactive). User đổi mạng lại chỉ cần bấm
         pill mạng ở header. */
    }
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
        aria-label="Chọn mạng"
        className="card w-full max-w-xs !p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-line px-5 py-3.5">
          <span className="eyebrow !text-muted">Network</span>
          <h2 className="mt-1.5 text-base font-display font-semibold">Chọn mạng của bạn</h2>
          <p className="text-xs text-subtle mt-1">
            MetaMask sẽ hiện popup xác nhận sau khi bạn chọn — bấm từ từ, không tự chạy.
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
                    <span className="text-subtle">Đang chuyển…</span>
                  ) : current ? (
                    <span className="inline-flex items-center gap-1 text-ok">
                      <Check size={13} /> Đang dùng
                    </span>
                  ) : (
                    <span className="text-muted">Chuyển →</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
