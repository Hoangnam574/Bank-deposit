/**
 * MyDeposits "/deposits" (T6.9) — list NFT của user:
 *   balanceOf + tokenOfOwnerByIndex (OZ v5 không có tokensOfOwner — loop như
 *   getUserDepositIds trong contract). Filter Active/Closed + Countdown.
 * Empty state rõ ràng.
 */
import { useEffect, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Inbox } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import Countdown from "@/components/Countdown";
import NoDeploymentState from "@/components/NoDeploymentState";
import { SkeletonRows } from "@/components/Skeleton";
import { useContracts } from "@/providers/ContractsProvider";
import { useWallet } from "@/providers/WalletProvider";
import { fmtToken, formatBps } from "@/lib/format";

export const STATUS_ACTIVE = 0;

export interface DepositRow {
  id: number;
  planId: bigint;
  principal: bigint;
  startAt: bigint;
  maturityAt: bigint;
  aprBpsAtOpen: bigint;
  penaltyBpsAtOpen: bigint;
  tenorDays: bigint;
  status: bigint;
}

export default function MyDeposits() {
  const { contracts, hasDeployment } = useContracts();
  const { address, getBrowser } = useWallet();
  const [rows, setRows] = useState<DepositRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "active" | "closed">("all");
  const [nowSec, setNowSec] = useState(0);

  useEffect(() => {
    if (!contracts || !hasDeployment || !address) {
      setRows([]);
      setNowSec(0);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const block = await getBrowser()?.getBlock("latest");
        if (!cancelled && block) setNowSec(Number(block.timestamp));
        const bal = Number((await contracts.core.balanceOf(address)) as bigint);
        const list: DepositRow[] = [];
        for (let i = 0; i < bal; i++) {
          const id = (await contracts.core.tokenOfOwnerByIndex(address, i)) as bigint;
          const d = (await contracts.core.getDeposit(id)) as unknown[];
          list.push({
            id: Number(id),
            planId: d[0] as bigint,
            principal: d[1] as bigint,
            startAt: d[3] as bigint,
            maturityAt: d[4] as bigint,
            aprBpsAtOpen: d[5] as bigint,
            penaltyBpsAtOpen: d[6] as bigint,
            tenorDays: d[7] as bigint,
            status: d[8] as bigint,
          });
        }
        if (!cancelled) setRows(list);
      } catch {
        if (!cancelled) setError("Đọc deposits lỗi — deploy/seed trước và connect ví đúng mạng");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contracts, hasDeployment, address]);

  const filtered = rows.filter((r) =>
    filter === "active"
      ? Number(r.status) === STATUS_ACTIVE
      : filter === "closed"
        ? Number(r.status) !== STATUS_ACTIVE
        : true,
  );

  const pct = (d: DepositRow): string => {
    const p = ((nowSec - Number(d.startAt)) / Math.max(1, Number(d.maturityAt) - Number(d.startAt))) * 100;
    return Math.max(0, Math.min(100, p)).toFixed(3);
  };

  return (
    <main className="mx-auto w-full max-w-[1680px] px-4 sm:px-6 lg:px-10 pb-16">
      <div className="flex flex-wrap items-center justify-between gap-3 mt-8 mb-6">
        <div>
          <span className="eyebrow">NFT receipts</span>
          <h1 className="mt-3 text-4xl font-bold font-display tracking-tight">Sổ tiết kiệm</h1>
        </div>
        <Link to="/open" className="btn btn-cta inline-flex items-center gap-1 self-end">
          Mới <ArrowRight size={15} />
        </Link>
      </div>

      {!contracts && <NoDeploymentState page="Sổ tiết kiệm" />}
      {contracts && error && <div className="card border-err/40 text-err text-sm mb-4">{error}</div>}
      {contracts && loading && <SkeletonRows count={2} />}
      {contracts && !loading && !error && rows.length === 0 && (
        <div className="card text-center py-12 border-dashed !border-line">
          <Inbox className="mx-auto text-subtle" size={42} aria-hidden />
          <p className="mt-3 text-subtle">Bạn chưa có deposit nào</p>
          <Link to="/open" className="btn btn-cta mt-4 inline-block cursor-pointer">
            Mở tiết kiệm đầu tiên
          </Link>
        </div>
      )}

      {contracts && rows.length > 0 && (
        <>
          {/* Bộ lọc — segmented buttons aria-pressed (bỏ role=tablist thiếu tabpanel) */}
          <div className="flex gap-2 mb-4 text-sm" aria-label="Lọc deposit">
            {(
              [
                ["all", "Tất cả"],
                ["active", "Đang hoạt động"],
                ["closed", "Đã đóng"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                aria-pressed={filter === v}
                onClick={() => setFilter(v)}
                className={`rounded-full border px-3 py-1.5 cursor-pointer transition-colors duration-200 ${
                  filter === v
                    ? "border-primary/60 bg-primary/10 text-primary font-semibold"
                    : "border-line text-subtle hover:text-txt hover:border-white/25"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {filtered.map((d) => (
              <Link
                key={d.id}
                to={`/deposit/${d.id}`}
                className="card card-int focus-visible:outline focus-visible:outline-2 focus-visible:outline-secondary"
              >
                <div className="flex items-center justify-between">
                  <div className="eyebrow">Deposit #{d.id}</div>
                  <StatusBadge status={d.status} />
                </div>
                <div className="num mt-2 text-2xl font-display text-txt">{fmtToken(d.principal)} USDC</div>
                {/* Progress % thời gian đã gửi — scaleX GPU-safe (không animate width) */}
                {Number(d.status) === STATUS_ACTIVE && Number(d.maturityAt) > 0 && (
                  <div className="mt-3 progress-track !h-1.5" aria-hidden>
                    <div
                      className="progress-fill"
                      style={{ "--p": pct(d) } as CSSProperties}
                    />
                  </div>
                )}
                <div className="text-xs mt-2.5">
                  <Countdown targetSec={d.maturityAt} nowSec={nowSec} showExact />
                </div>
                <div className="num mt-2 text-sm flex gap-4 text-subtle">
                  <span className="text-primary">{formatBps(d.aprBpsAtOpen)} APR</span>
                  <span>{Number(d.tenorDays)} ngày</span>
                  <span className="text-warn">Phạt {formatBps(d.penaltyBpsAtOpen)}</span>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
