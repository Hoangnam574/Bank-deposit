/**
 * MyDeposits "/deposits" (T6.9) — list NFT của user:
 *   balanceOf + tokenOfOwnerByIndex (OZ v5 không có tokensOfOwner — loop như
 *   getUserDepositIds trong contract). Filter Active/Closed + Countdown.
 * Empty state rõ ràng.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Inbox } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import Countdown from "@/components/Countdown";
import NoDeploymentState from "@/components/NoDeploymentState";
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

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="mt-8 text-3xl font-bold">Sổ tiết kiệm</h1>
        <Link to="/open" className="btn btn-cta !py-1.5 inline-flex items-center gap-1 mt-8">
          Mới <ArrowRight size={15} />
        </Link>
      </div>

      {!contracts && <NoDeploymentState page="Sổ tiết kiệm" />}
      {contracts && error && <div className="card border-err/40 text-err text-sm mb-4">{error}</div>}
      {contracts && loading && <div className="text-subtle text-sm">Đang tải danh sách…</div>}
      {contracts && !loading && !error && rows.length === 0 && (
        <div className="card text-center py-12 border-dashed border-line">
          <Inbox className="mx-auto text-subtle" size={42} aria-hidden />
          <p className="mt-3 text-subtle">Bạn chưa có deposit nào</p>
          <Link to="/open" className="btn btn-cta mt-4 inline-block cursor-pointer">
            Mở tiết kiệm đầu tiên
          </Link>
        </div>
      )}

      {contracts && rows.length > 0 && (
        <>
          <div className="flex gap-2 mb-4 text-sm" role="tablist" aria-label="Lọc deposit">
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
                role="tab"
                aria-selected={filter === v}
                onClick={() => setFilter(v)}
                className={`px-3 py-1 rounded-full border cursor-pointer transition-colors duration-200 ${
                  filter === v ? "border-primary text-primary" : "border-line text-subtle hover:text-txt"
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
                className="card cursor-pointer hover:-translate-y-0.5 transition-transform duration-200 focus-visible:outline-secondary"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-subtle text-xs">Deposit #{d.id}</div>
                    <div className="text-2xl font-display text-txt glow-num">{fmtToken(d.principal)} USDC</div>
                  </div>
                  <StatusBadge status={d.status} />
                </div>
                {/* Progress % thời gian đã gửi (startAt → maturityAt) */}
                {Number(d.status) === STATUS_ACTIVE && Number(d.maturityAt) > 0 && (
                  <div className="mt-3" aria-hidden>
                    <div className="h-1.5 rounded-full bg-line/70 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-primary to-secondary transition-[width] duration-500"
                        style={{
                          width: `${Math.max(
                            0,
                            Math.min(
                              100,
                              ((nowSec - Number(d.startAt)) /
                                Math.max(1, Number(d.maturityAt) - Number(d.startAt))) *
                                100,
                            ),
                          ).toFixed(1)}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
                {!Number.isNaN(Number(d.maturityAt)) && (
                  <div className="text-xs mt-2">
                    <Countdown targetSec={d.maturityAt} nowSec={nowSec} showExact />
                  </div>
                )}
                <div className="mt-2 text-sm flex gap-4 text-subtle">
                  <span className="text-primary">{formatBps(d.aprBpsAtOpen)} APR</span>
                  <span>{Number(d.tenorDays)} ngày</span>
                  <span className="text-warn">Phạt {formatBps(d.penaltyBpsAtOpen)}</span>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
