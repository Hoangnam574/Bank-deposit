/**
 * NetworkGuard (T6.4) — chain không thuộc danh sách allowed → banner cảnh báo
 * ngay dưới nav với action switch. Chain *allowed nhưng chưa deploy* được
 * xử lý ở component NoDeploymentState (dùng trong các page).
 */
import { AlertTriangle } from "lucide-react";
import { useWallet } from "@/providers/WalletProvider";

export const ALLOWED_CHAINS = [31337, 11155111] as const;

export const CHAIN_LABEL: Record<number, string> = {
  31337: "Hardhat Local",
  11155111: "Sepolia Testnet",
};

export function chainLabel(chainId: number | null): string {
  if (chainId === null) return "Không rõ";
  return CHAIN_LABEL[chainId] ?? `Chain ${chainId}`;
}

export function isAllowedChain(chainId: number | null): boolean {
  return chainId !== null && (ALLOWED_CHAINS as readonly number[]).includes(chainId);
}

/** Pill màu cho trạng thái chain — xanh lá local, tím sepolia, đỏ/lạ màu khác */
export function ChainPill({ chainId }: { chainId: number | null }) {
  const allowed = isAllowedChain(chainId);
  const unknown = chainId === null || !allowed;
  const cls = chainId === 31337 ? "bg-ok/15 text-ok border-ok/40" : chainId === 11155111 ? "bg-cta/15 text-cta border-cta/40" : "bg-err/10 text-err border-err/40";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${cls}`}
      title="Chain MetaMask đang kết nối"
    >
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${unknown ? "bg-err" : chainId === 31337 ? "bg-ok" : "bg-cta"}`} />
      {chainLabel(chainId)}
      {chainId !== null && <span className="opacity-70">· {chainId}</span>}
    </span>
  );
}

export function NetworkGuard() {
  const { chainId, hasWallet } = useWallet();
  if (!hasWallet || isAllowedChain(chainId)) return null;

  return (
    <div role="alert" className="bg-err/10 border-b border-err/40 px-4 py-2.5 text-sm flex flex-wrap items-center gap-3">
      <AlertTriangle size={16} className="text-err shrink-0" />
      <span>
        MetaMask đang ở <strong>{chainLabel(chainId)}</strong> — dapp cần Hardhat Local (31337) hoặc Sepolia (11155111).
      </span>
      <span className="text-subtle text-xs">
        Bấm vào pill tên mạng ở góc trên bên phải (kể cả khi mạng lạ) để chọn lại mạng.
      </span>
    </div>
  );
}
