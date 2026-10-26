/**
 * NoDeploymentState — "empty state có hành động" cho chain allowed nhưng
 * chưa có contract (vd: vào /admin khi MetaMask đang ở Sepolia mà chưa deploy).
 * Thay cho câu text lơ lửng (anti-pattern dead-end): card context + action.
 */
import { useState } from "react";
import { AlertTriangle, RefreshCw, KeyRound, ArrowRight } from "lucide-react";
import { useWallet } from "@/providers/WalletProvider";
import { HARDHAT_ACCOUNTS } from "@/lib/accounts";

const CHAIN_LABEL: Record<number, string> = {
  31337: "Hardhat Local",
  11155111: "Sepolia Testnet",
};

export default function NoDeploymentState({ page }: { page: string }) {
  const { chainId, switchNetwork } = useWallet();
  const [switching, setSwitching] = useState<number | null>(null);
  const [copied, setCopied] = useState<number | null>(null);

  const doSwitch = async (target: number) => {
    setSwitching(target);
    await switchNetwork(target);
    setSwitching(null);
    /* KHÔNG reload — chainChanged cập nhật state, mọi hook chạy theo chain mới. */
  };

  return (
    <div className="card max-w-2xl mx-auto mt-10 border-warn/40" role="alert">
      <div className="flex items-start gap-3">
        <AlertTriangle className="text-warn shrink-0 mt-0.5" size={22} />
        <div>
          <h2 className="font-display text-lg">Trang {page} chưa có dữ liệu contract</h2>
          <p className="text-sm text-subtle mt-1">
            Chain đang kết nối:{" "}
            <strong className="num text-txt">{chainId ?? "—"}</strong>
            {chainId !== null && CHAIN_LABEL[chainId] ? ` (${CHAIN_LABEL[chainId]})` : ""} — dapp chỉ có
            deployment trên <strong className="text-primary">31337 (local)</strong> và{" "}
            <strong className="text-primary">11155111 (Sepolia, nếu đã deploy)</strong>.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {chainId !== 31337 && (
          <button
            type="button"
            className="btn btn-cta inline-flex items-center gap-1"
            onClick={() => void doSwitch(31337)}
            disabled={switching !== null}
          >
            Switch → Hardhat Local (31337) <ArrowRight size={15} />
          </button>
        )}
        {chainId !== 11155111 && (
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => void doSwitch(11155111)}
            disabled={switching !== null}
          >
            Switch → Sepolia
          </button>
        )}
        <button type="button" className="btn btn-outline" onClick={() => window.location.reload()}>
          <RefreshCw size={14} className="mr-1 inline" /> Reload trang
        </button>
      </div>

      {/* Hướng dẫn account Hardhat — CHỈ hiện khi đang mạng local 31337
          (key Hardhat không tồn tại trên Sepolia): */}
      {chainId === 31337 && (
      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-subtle hover:text-txt inline-flex items-center gap-1">
          <KeyRound size={14} /> Account ví không có tiền local? Import key Hardhat (mở rộng)
        </summary>
        <ol className="mt-2 space-y-2 list-decimal list-inside text-subtle">
          <li>
            MetaMask → <strong>Import account</strong> (chọn Private key) → dán key của account #0 hoặc
            #1 bên dưới.
          </li>
          <li>Kiểm tra network của MetaMask phải là <strong>Hardhat Local 31337</strong>.</li>
        </ol>
        <div className="mt-3 space-y-2">
          {HARDHAT_ACCOUNTS.map((a) => (
            <div key={a.index} className="rounded-lg bg-bg/60 border border-line p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono">
                  #{a.index} {a.address}
                </span>
                <button
                  type="button"
                  className="btn btn-outline !py-0.5 !px-2 text-[11px] cursor-pointer"
                  onClick={() => {
                    void navigator.clipboard.writeText(a.key);
                    setCopied(a.index);
                    window.setTimeout(() => setCopied(null), 1500);
                  }}
                >
                  {copied === a.index ? "Đã copy ✔" : "Copy private key"}
                </button>
              </div>
              <div className="text-subtle mt-1">{a.role}</div>
            </div>
          ))}
          <p className="text-[11px] text-subtle">Key mặc định của Hardhat — chỉ dùng demo local, không phải tài sản thật.</p>
        </div>
      </details>
      )}
    </div>
  );
}
