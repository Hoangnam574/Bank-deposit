/**
 * StatStrip — 4 stat-callout trên mọi trang (v4 Binance: trong suốt trong card,
 * label muted 12px, số mono trắng / yellow accent cho vault available).
 */
import { type ReactNode } from "react";
import { Coins, Wallet, PiggyBank, Vault, RefreshCw, Loader2 } from "lucide-react";
import { useWallet } from "@/providers/WalletProvider";
import { useContracts } from "@/providers/ContractsProvider";
import { useWalletStats } from "@/hooks/useWalletStats";
import { fmtToken } from "@/lib/format";

function Tile({
  icon,
  label,
  value,
  accent = false,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="stat-tile flex-1 min-w-[150px]">
      <div className="flex items-center gap-1.5 text-xs text-subtle">
        {icon}
        {label}
      </div>
      <div className={`num mt-1 text-lg font-display ${accent ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}

export default function StatStrip() {
  const { address } = useWallet();
  const { contracts, hasDeployment } = useContracts();
  const stats = useWalletStats();

  if (!address || !contracts || !hasDeployment) return null;

  return (
    <div className="mx-auto max-w-5xl px-4 pt-4">
      <div className="card !py-3 flex flex-wrap items-stretch gap-x-2 gap-y-2 divide-x divide-line">
        <Tile
          icon={<Coins size={14} />}
          label="USDC khả dụng"
          value={stats.usdcBalance !== null ? `${fmtToken(stats.usdcBalance, 2)}` : "…"}
        />
        <Tile
          icon={<PiggyBank size={14} />}
          label="Deposits Active"
          value={stats.activeCount !== null ? String(stats.activeCount) : "…"}
        />
        <Tile
          icon={<Wallet size={14} />}
          label="Đang gửi (principal)"
          value={stats.totalPrincipal !== null ? `${fmtToken(stats.totalPrincipal, 2)}` : "…"}
        />
        {stats.isAdmin && (
          <Tile
            icon={<Vault size={14} />}
            label="Vault available (admin)"
            value={stats.vaultAvailable !== null ? `${fmtToken(stats.vaultAvailable, 2)}` : "…"}
            accent
          />
        )}
        <button
          type="button"
          aria-label="Làm mới số liệu"
          title="Làm mới số liệu"
          onClick={stats.refresh}
          className="self-center ml-auto text-subtle hover:text-txt cursor-pointer p-1.5 transition-colors duration-200"
        >
          {stats.loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
        </button>
      </div>
    </div>
  );
}
