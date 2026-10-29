/**
 * NetworkGuard (T6.4) — chain không thuộc danh sách allowed → banner cảnh báo
 * ngay dưới nav với action switch. Chain *allowed nhưng chưa deploy* được
 * xử lý ở component NoDeploymentState (dùng trong các page).
 */
import { AlertTriangle } from "lucide-react";
import { useWallet } from "@/providers/WalletProvider";
import { useLang, rawT } from "@/lib/i18n";

export const ALLOWED_CHAINS = [31337, 11155111] as const;

export const CHAIN_LABEL: Record<number, string> = {
  31337: "Hardhat Local",
  11155111: "Sepolia Testnet",
};

export function chainLabel(chainId: number | null): string {
  if (chainId === null) return rawT("chain.unknown");
  return CHAIN_LABEL[chainId] ?? `Chain ${chainId}`;
}

export function isAllowedChain(chainId: number | null): boolean {
  return chainId !== null && (ALLOWED_CHAINS as readonly number[]).includes(chainId);
}

/** Pill màu cho trạng thái chain — xanh lá local, tím sepolia, đỏ/lạ màu khác.
 *  compact: bản gọn cho header mobile — nhãn ngắn, ẩn đuôi "· 31337". */
export function ChainPill({ chainId, compact, className = "" }: { chainId: number | null; compact?: boolean; className?: string }) {
  const allowed = isAllowedChain(chainId);
  const unknown = chainId === null || !allowed;
  const cls = chainId === 31337 ? "bg-ok/15 text-ok border-ok/40 group-hover:bg-ok/25 group-hover:border-ok/80 hover:bg-ok/25 hover:border-ok/80" : chainId === 11155111 ? "bg-cta/15 text-cta border-cta/40 group-hover:bg-cta/25 group-hover:border-cta/80 hover:bg-cta/25 hover:border-cta/80" : "bg-err/10 text-err border-err/40 group-hover:bg-err/20 group-hover:border-err/80 hover:bg-err/20 hover:border-err/80";
  const shortLabel = chainId === 31337 ? "Hardhat" : chainId === 11155111 ? "Sepolia" : chainLabel(chainId);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs whitespace-nowrap transition-colors duration-200 ${cls} ${className}`}
    >
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${unknown ? "bg-err" : chainId === 31337 ? "bg-ok" : "bg-cta"}`} />
      {compact ? shortLabel : chainLabel(chainId)}
      {chainId !== null && !compact && <span className="opacity-70">· {chainId}</span>}
    </span>
  );
}

export function NetworkGuard() {
  const { chainId, hasWallet } = useWallet();
  const { t } = useLang();
  if (!hasWallet || isAllowedChain(chainId)) return null;

  return (
    <div role="alert" className="bg-err/10 border-b border-err/40 px-4 py-2.5 text-sm flex flex-wrap items-center gap-3">
      <AlertTriangle size={16} className="text-err shrink-0" />
      <span>
        {t("chain.guardLine")} <strong>{chainLabel(chainId)}</strong> {t("chain.guardReq")}
      </span>
      <span className="text-subtle text-xs">{t("chain.guardHint")}</span>
    </div>
  );
}
