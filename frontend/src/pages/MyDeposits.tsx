/**
 * MyDeposits "/deposits" (T6.9) — list NFT của user:
 *   balanceOf + tokenOfOwnerByIndex (OZ v5 không có tokensOfOwner — loop như
 *   getUserDepositIds trong contract). Filter Active/Closed + Countdown.
 * Empty state rõ ràng.
 * LỊCH SỬ: NFT bị burn sau rút/renew → không còn trong balanceOf. Dựng lịch sử
 * từ event log (đề §5 index đủ): DepositOpened(owner🔒) + Withdrawn(owner🔒,
 * isEarly) + EmergencyWithdrawn(owner🔒) + Renewed(lọc owner client-side).
 */
import { useEffect, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, History, Inbox } from "lucide-react";
import type { EventLog } from "ethers";
import StatusBadge from "@/components/StatusBadge";
import Countdown from "@/components/Countdown";
import NoDeploymentState from "@/components/NoDeploymentState";
import { SkeletonRows } from "@/components/Skeleton";
import { useContracts } from "@/providers/ContractsProvider";
import { usePlans } from "@/hooks/usePlans";
import { useWallet } from "@/providers/WalletProvider";
import { fmtToken, formatBps, fmtDate } from "@/lib/format";
import { useLang, type TKey } from "@/lib/i18n";

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

/** 1 dòng lịch sử tất toán (từ event log) */
interface HistoryRow {
  key: string;
  id: number;
  kind: "maturity" | "early" | "partial" | "emergency" | "renewed";
  /** số tiền user nhận (renew: principal ghép của sổ mới) */
  amount: bigint;
  /** lãi nhận (0 với rút sớm) */
  interest: bigint;
  /** phạt rút sớm đã nộp = lỗ (0 nếu không có) */
  penalty: bigint;
  /** snapshot từ DepositOpened — trang trí card giống thẻ active */
  planId?: number;
  apr?: bigint;
  /** renew → id sổ mới */
  newId?: number;
  /** partial → deposit vẫn còn sống */
  stillActive?: boolean;
  blockNumber: number;
  ts?: number;
}

const KIND_META: Record<HistoryRow["kind"], { key: TKey; cls: string }> = {
  maturity: { key: "dep.kind.maturity", cls: "border-ok/40 bg-ok/10 text-ok" },
  early: { key: "dep.kind.early", cls: "border-warn/40 bg-warn/10 text-warn" },
  partial: { key: "dep.kind.partial", cls: "border-secondary/40 bg-secondary/10 text-secondary" },
  emergency: { key: "dep.kind.emergency", cls: "border-err/40 bg-err/10 text-err" },
  renewed: { key: "dep.kind.renewed", cls: "border-line bg-panel text-subtle" },
};

export default function MyDeposits() {
  const { contracts, hasDeployment } = useContracts();
  const { address, getBrowser, chainId } = useWallet();
  const { plans: planRows } = usePlans();
  const { t } = useLang();
  const [rows, setRows] = useState<DepositRow[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "active" | "closed">("all");
  const [nowSec, setNowSec] = useState(0);

  /* Poll block mới theo thời gian tạo khối (block.timestamp) — không nhảy ngược */
  useEffect(() => {
    if (!contracts || !hasDeployment) return;
    let cancelled = false;
    let lastSeen = 0;
    const t = window.setInterval(() => {
      void (async () => {
        try {
          const block = await getBrowser()?.getBlock("latest");
          if (!block || cancelled) return;
          const ts = Number(block.timestamp);
          if (ts > 0 && ts !== lastSeen) {
            lastSeen = ts;
            if (!cancelled) setNowSec((prev) => Math.max(prev, ts));
          }
        } catch {
        }
      })();
    }, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [contracts, hasDeployment, getBrowser]);

  /* ── Load active NFT list + lịch sử event-log (refetch khi tx thành công) ── */
  useEffect(() => {
    if (!contracts || !hasDeployment || !address) {
      setRows([]);
      setHistory([]);
      setNowSec(0);
      setError(null);
      return;
    }
    let cancelled = false;
    const core = contracts.core;

    /* cache block.timestamp theo blockNumber — tránh gọi trùng RPC */
    const tsCache = new Map<number, Promise<number | undefined>>();
    const blockTs = (bn: number): Promise<number | undefined> => {
      const hit = tsCache.get(bn);
      if (hit) return hit;
      const p = getBrowser()
        ?.getBlock(bn)
        .then((b) => (b ? Number(b.timestamp) : undefined))
        .catch(() => undefined);
      if (p) tsCache.set(bn, p);
      return p ?? Promise.resolve(undefined);
    };

    const load = async (): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        const block = await getBrowser()?.getBlock("latest");
        if (!cancelled && block) setNowSec(Number(block.timestamp));

        /* ── 1. Sổ đang giữ NFT (Active) ── */
        const bal = Number((await core.balanceOf(address)) as bigint);
        const list: DepositRow[] = [];
        for (let i = 0; i < bal; i++) {
          const id = (await core.tokenOfOwnerByIndex(address, i)) as bigint;
          const d = (await core.getDeposit(id)) as unknown[];
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

        /* ── 2. Lịch sử từ event log (dùng fromBlock trên Sepolia để không timeout RPC) ── */
        try {
          const fromBlock = chainId === 11155111 ? 12017000 : 0;
          const opened = (await core.queryFilter(core.filters.DepositOpened(null, address), fromBlock)) as EventLog[];
          const openedMap = new Map<number, { planId: number; principal: bigint; apr: bigint }>();
          for (const l of opened) {
            const a = l.args as unknown[];
            openedMap.set(Number(a[0]), { planId: Number(a[2]), principal: a[3] as bigint, apr: a[5] as bigint });
          }

          /* Phạt rút sớm đã nộp theo deposit (PenaltyCharged) = LỖ thực */
          const penLogs = (await core.queryFilter(core.filters.PenaltyCharged(null, address), fromBlock)) as EventLog[];
          const penaltyMap = new Map<number, bigint>();
          for (const l of penLogs) {
            const a = l.args as unknown[];
            const id = Number(a[0]);
            penaltyMap.set(id, (penaltyMap.get(id) ?? 0n) + (a[2] as bigint));
          }

          const hist: HistoryRow[] = [];

          /* Withdrawn — rút đúng hạn / sớm / MỘT PHẦN */
          const withdrawn = (await core.queryFilter(core.filters.Withdrawn(null, address), fromBlock)) as EventLog[];
          for (const l of withdrawn) {
            const a = l.args as unknown[];
            const id = Number(a[0]);
            const isEarly = Number(a[4]) === 1;
            let stillActive = false;
            try {
              const d = (await core.getDeposit(id)) as unknown[];
              stillActive = Number(d[8]) === STATUS_ACTIVE;
            } catch {
              /* burn rồi → đóng hẳn */
            }
            const info = openedMap.get(id);
            let penalty = penaltyMap.get(id) ?? 0n;
            if (penalty === 0n && info && !stillActive && isEarly) {
              const diff = info.principal - (a[2] as bigint);
              if (diff > 0n) penalty = diff;
            }
            hist.push({
              key: `w-${id}-${l.blockNumber}-${l.index}`,
              id,
              kind: stillActive ? "partial" : isEarly ? "early" : "maturity",
              amount: a[2] as bigint,
              interest: a[3] as bigint,
              penalty,
              planId: info?.planId,
              apr: info?.apr,
              stillActive,
              blockNumber: l.blockNumber,
              ts: await blockTs(l.blockNumber),
            });
          }

          /* Emergency */
          try {
            const emergency = (await core.queryFilter(core.filters.EmergencyWithdrawn(null, address), fromBlock)) as EventLog[];
            for (const l of emergency) {
              const a = l.args as unknown[];
              const id = Number(a[0]);
              hist.push({
                key: `e-${id}-${l.blockNumber}`,
                id,
                kind: "emergency",
                amount: a[2] as bigint,
                interest: 0n,
                penalty: 0n,
                planId: openedMap.get(id)?.planId,
                apr: openedMap.get(id)?.apr,
                blockNumber: l.blockNumber,
                ts: await blockTs(l.blockNumber),
              });
            }
          } catch {
            /* ABI cũ không có event — bỏ qua */
          }

          /* Renewed — lọc qua tập DepositOpened của user */
          const renewed = (await core.queryFilter(core.filters.Renewed(), fromBlock)) as EventLog[];
          for (const l of renewed) {
            const a = l.args as unknown[];
            const oldId = Number(a[0]);
            if (!openedMap.has(oldId)) continue;
            hist.push({
              key: `r-${oldId}-${l.blockNumber}`,
              id: oldId,
              kind: "renewed",
              amount: a[2] as bigint,
              interest: 0n,
              penalty: 0n,
              planId: openedMap.get(oldId)?.planId,
              apr: openedMap.get(oldId)?.apr,
              newId: Number(a[1]),
              blockNumber: l.blockNumber,
              ts: await blockTs(l.blockNumber),
            });
          }

          hist.sort((x, y) => y.blockNumber - x.blockNumber);
          if (!cancelled) setHistory(hist);
        } catch {
          /* Lỗi RPC event — không phá danh sách active */
        }
      } catch {
        if (!cancelled) setError(t("dep.loadError"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    const onTxOk = () => void load();
    window.addEventListener("bank:tx-ok", onTxOk);
    return () => {
      cancelled = true;
      window.removeEventListener("bank:tx-ok", onTxOk);
    };
  }, [contracts, hasDeployment, address, chainId, getBrowser]);

  /* scaleX cần phần 0..1 — chia 100 */
  const pct = (d: DepositRow): string => {
    const p = ((nowSec - Number(d.startAt)) / Math.max(1, Number(d.maturityAt) - Number(d.startAt))) * 100;
    return (Math.max(0, Math.min(100, p)) / 100).toFixed(3);
  };

  const renderHistoryCard = (h: HistoryRow) => {
    const meta = KIND_META[h.kind];
    const tenor = h.planId !== undefined ? planRows.find((p) => p.id === h.planId) : undefined;
    return (
      <Link
        key={h.key}
        to={`/deposit/${h.id}`}
        className="card card-int focus-visible:outline focus-visible:outline-2 focus-visible:outline-secondary"
      >
        <div className="flex items-center justify-between">
          <div className="eyebrow">Deposit #{h.id}</div>
          <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${meta.cls}`}>
            {t(meta.key)}
          </span>
        </div>
        <div className="num mt-2 text-2xl font-display text-txt">{fmtToken(h.amount)} USDC</div>
        <div className="text-xs text-subtle mt-2.5">
          {h.stillActive
            ? t("dep.partialNote")
            : h.kind === "renewed" && h.newId
              ? t("dep.renewedNote", { id: h.newId })
              : h.ts
                ? t("dep.closedAt", { date: fmtDate(h.ts) })
                : t("dep.blockNote", { n: h.blockNumber })}
        </div>
        <div className="num mt-2 text-sm flex flex-wrap gap-x-4 gap-y-1 text-subtle">
          {h.apr !== undefined && <span className="text-primary">{formatBps(h.apr)} APR</span>}
          {tenor !== undefined && <span>{t("detail.days", { d: Number(tenor.tenorDays) })}</span>}
          {h.interest > 0n && <span className="text-ok">+{fmtToken(h.interest, 4)} USDC</span>}
          {h.penalty > 0n && <span className="text-err">−{fmtToken(h.penalty, 2)} USDC</span>}
        </div>
      </Link>
    );
  };

  const hasAny = rows.length > 0 || history.length > 0;

  return (
    <main className="mx-auto w-full max-w-[1680px] px-4 sm:px-6 lg:px-10 pb-16">
      <div className="flex flex-wrap items-center justify-between gap-3 mt-8 mb-6">
        <div>
          <span className="eyebrow">{t("dep.eyebrow")}</span>
          <h1 className="mt-3 text-4xl font-bold font-display tracking-tight">{t("dep.title")}</h1>
        </div>
        <Link to="/open" className="btn btn-cta inline-flex items-center gap-1 self-end">
          {t("dep.new")} <ArrowRight size={15} />
        </Link>
      </div>

      {!contracts && <NoDeploymentState page={t("dep.page")} />}
      {contracts && error && <div className="card border-err/40 text-err text-sm mb-4">{error}</div>}
      {contracts && loading && !hasAny && <SkeletonRows count={2} />}
      {contracts && !loading && !error && !hasAny && (
        <div className="card text-center py-12 border-dashed !border-line">
          <Inbox className="mx-auto text-subtle" size={42} aria-hidden />
          <p className="mt-3 text-subtle">{t("dep.empty")}</p>
          <Link to="/open" className="btn btn-cta mt-4 inline-block cursor-pointer">
            {t("dep.emptyCta")}
          </Link>
        </div>
      )}

      {contracts && hasAny && (
        <>
          {/* Bộ lọc — segmented buttons */}
          <div className="flex gap-2 mb-4 text-sm" aria-label={t("dep.filterAria")}>
            {(
              [
                ["all", t("dep.filterAll")],
                ["active", `${t("dep.filterActive")} (${rows.length})`],
                ["closed", `${t("dep.filterClosed")} (${history.length})`],
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

          {/* TAB: ĐANG CHẠY (hoặc TẤT CẢ) */}
          {(filter === "all" || filter === "active") && (
            <>
              {rows.length === 0 && filter === "active" ? (
                <div className="card text-center py-10 border-dashed !border-line">
                  <Inbox className="mx-auto text-subtle" size={36} aria-hidden />
                  <p className="mt-2 text-sm text-subtle">{t("dep.emptyActive")}</p>
                  <Link to="/open" className="btn btn-cta mt-3 inline-block cursor-pointer">
                    {t("dep.emptyCta")}
                  </Link>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {rows.map((d) => (
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
                        <span>{t("detail.days", { d: Number(d.tenorDays) })}</span>
                        <span className="text-warn">{t("plan.penalty")} {formatBps(d.penaltyBpsAtOpen)}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </>
          )}

          {/* TAB: ĐÃ ĐÓNG */}
          {filter === "closed" && (
            <>
              {history.length === 0 ? (
                <div className="card text-center py-10 border-dashed !border-line">
                  <Inbox className="mx-auto text-subtle" size={36} aria-hidden />
                  <p className="mt-2 text-sm text-subtle">{t("dep.emptyClosed")}</p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {history.map(renderHistoryCard)}
                </div>
              )}
            </>
          )}

          {/* LỊCH SỬ KHI Ở TAB "TẤT CẢ" */}
          {filter === "all" && history.length > 0 && (
            <section className="mt-10" aria-label={t("dep.historyAria")}>
              <div className="flex items-center gap-2">
                <History size={15} className="text-subtle" aria-hidden />
                <span className="eyebrow">{t("dep.historyEyebrow")}</span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 mt-3">
                {history.map(renderHistoryCard)}
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}
