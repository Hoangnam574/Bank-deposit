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
import { useLang } from "@/lib/i18n";

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
    /* min-w-[46%] + flex-wrap → grid 2×2 trên mobile: 4 tile không còn bị ép
       vào 1 hàng gây tràn ngang; ≥sm: về hàng ngang 150px như cũ. */
    <div className="stat-tile flex-1 min-w-[46%] sm:min-w-[150px]">
      <div className="flex items-center gap-1.5 text-xs text-subtle">
        {icon}
        {label}
      </div>
      {/* tabular-nums + truncate: số dài (499,981.5) hiển thị vừa frame, không cắt rìa phải */}
      <div className={`num mt-1 text-base sm:text-lg font-display truncate ${accent ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}

export default function StatStrip() {
  const { address } = useWallet();
  const { contracts, hasDeployment } = useContracts();
  const stats = useWalletStats();
  const { t } = useLang();

  if (!address || !contracts || !hasDeployment) return null;

  return (
    <div className="mx-auto w-full max-w-[1680px] px-4 sm:px-6 lg:px-10 pt-4">
      <div className="card !py-3 flex flex-wrap items-stretch gap-x-2 gap-y-2 sm:divide-x sm:divide-line">
        <Tile
          icon={<Coins size={14} />}
          label={t("stat.usdc")}
          value={stats.usdcBalance !== null ? `${fmtToken(stats.usdcBalance, 2)}` : "…"}
        />
        <Tile
          icon={<PiggyBank size={14} />}
          label={t("stat.active")}
          value={stats.activeCount !== null ? String(stats.activeCount) : "…"}
        />
        <Tile
          icon={<Wallet size={14} />}
          label={t("stat.principal")}
          value={stats.totalPrincipal !== null ? `${fmtToken(stats.totalPrincipal, 2)}` : "…"}
        />
        {stats.isAdmin && (
          <Tile
            icon={<Vault size={14} />}
            label={t("stat.vault")}
            value={stats.vaultAvailable !== null ? `${fmtToken(stats.vaultAvailable, 2)}` : "…"}
            accent
          />
        )}
        <button
          type="button"
          aria-label={t("stat.refresh")}
          title={t("stat.refresh")}
          onClick={stats.refresh}
          className="self-center ml-auto text-subtle hover:text-txt cursor-pointer p-1.5 transition-colors duration-200"
        >
          {stats.loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
        </button>
      </div>
    </div>
  );
}
