/**
 * DepositDetail "/deposit/:id" (T6.10) — thông tin đầy đủ + nút theo trạng thái:
 *   - Active & đã mature  → Withdraw (principal + lãi)
 *   - Active & chưa mature → Early Withdraw (CẢNH BÁO mất lãi + penalty)
 *   - Partial / Top-up    → cần amount (+ approve riêng cho top-up)
 *   - Renew               → chọn plan từ dropdown (mặc định plan hiện tại; hover xem thông số)
 *   - Pause hoạt động     → Emergency Withdraw C5 nếu pause ≥ 7 ngày
 *   - có pending lãi NỢ (C1 defer) → Claim Pending
 * Mọi action có confirm (ConfirmDialog in-app) + map lỗi thân thiện.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, AlertTriangle, Loader2, SearchX, CheckCircle2 } from "lucide-react";
import type { ContractTransactionResponse, EventLog } from "ethers";
import StatusBadge from "@/components/StatusBadge";
import Countdown from "@/components/Countdown";
import MaturityRing from "@/components/MaturityRing";
import InterestTicker from "@/components/InterestTicker";
import NoDeploymentState from "@/components/NoDeploymentState";
import { useConfirm } from "@/components/ConfirmDialog";
import { useContracts, useSignerContracts, useContractTime } from "@/providers/ContractsProvider";
import { useWallet } from "@/providers/WalletProvider";
import { useTx } from "@/hooks/useTx";
import { usePlans } from "@/hooks/usePlans";
import RenewPlanSelect from "@/components/RenewPlanSelect";
import { fmtToken, fmtTokenFixed, formatBps, fmtDate, computeChunkDeltaInterest } from "@/lib/format";
import { useLang, rawT } from "@/lib/i18n";

const SCALAR = 1_000_000n;
const ACTIVE = 0;

interface Detail {
  planId: bigint;
  principal: bigint;
  startAt: bigint;
  maturityAt: bigint;
  aprBpsAtOpen: bigint;
  penaltyBpsAtOpen: bigint;
  tenorDays: bigint;
  status: bigint;
}

interface Preview {
  principal: bigint;
  interest: bigint;
  penalty: bigint;
  amountIfEarly: bigint;
  maturityAt: bigint;
  status: bigint;
}

/** Kết quả tất toán của sổ đã đóng — dựng từ event log (NFT đã burn) */
interface ClosedResult {
  at: number | null;
  received: bigint;
  interest: bigint;
  penalty: bigint;
  newId: number | null;
}

function parseInput(input: string): bigint {
  if (!/^[0-9]+(\.[0-9]+)?$/.test(input)) throw new Error(rawT("err.amountInvalid"));
  const [int, frac = ""] = input.split(".");
  const fracPadded = frac.padEnd(6, "0").slice(0, 6);
  return BigInt(int || "0") * SCALAR + BigInt(fracPadded || "0");
}

export default function DepositDetail() {
  const { id } = useParams();
  const depositId = useMemo(() => (id ? Number(id) : null), [id]);
  const navigate = useNavigate();
  const { contracts, hasDeployment } = useContracts();
  const signerC = useSignerContracts();
  const { daySeconds, gracePeriod, emergencyDelay, yearSeconds } = useContractTime();
  const { address, getBrowser, chainId } = useWallet();
  const { state, run } = useTx();
  const confirm = useConfirm();
  const { t } = useLang();

  const [d, setD] = useState<Detail | null>(null);
  const [pv, setPv] = useState<Preview | null>(null);
  const [nowSec, setNowSec] = useState(0);
  const [paused, setPaused] = useState<boolean>(false);
  const [pauseAt, setPauseAt] = useState<number | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const [pendingInterest, setPendingInterest] = useState<bigint | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [withdrawnOk, setWithdrawnOk] = useState(false);
  const [approved, setApproved] = useState(false);
  const [closedResult, setClosedResult] = useState<ClosedResult | null>(null);

  const [inputAmount, setInputAmount] = useState("");
  const [renewPlan, setRenewPlan] = useState<number | null>(null);



  const amount = useMemo(() => {
    try {
      return inputAmount.trim() ? parseInput(inputAmount) : null;
    } catch {
      return null;
    }
  }, [inputAmount]);

  const pending = state.status === "pending";
  const { plans, loading: plansLoading } = usePlans();

  /* Mở deposit khác → reset lựa chọn plan (deposit id đổi sau renew → NFT mới) */
  useEffect(() => {
    setRenewPlan(null);
  }, [depositId]);

  /* Default plan cho Renew = plan hiện tại (nếu enabled), ngược lại plan enabled đầu tiên */
  useEffect(() => {
    if (renewPlan !== null || !d || plans.length === 0) return;
    const current = plans.find((p) => p.id === Number(d.planId));
    setRenewPlan(current && current.enabled ? current.id : (plans.find((p) => p.enabled)?.id ?? null));
  }, [d, plans, renewPlan]);

  /* ── Fetch deposit + preview + vault pause status ── */
  useEffect(() => {
    if (!contracts || !hasDeployment || depositId === null) return;
    let cancelled = false;
    void (async () => {
      try {
        const block = await getBrowser()?.getBlock("latest");
        if (!cancelled && block) setNowSec(Number(block.timestamp));
        const raw = (await contracts.core.getDeposit(depositId)) as unknown[];
        /* ownerOf revert với NFT đã burn (sổ đóng) — KHÔNG phải notFound:
           contract giữ nguyên DepositInfo (chỉ status đổi) → vẫn xem đầy đủ,
           chỉ thiếu owner (isOwner=false → mọi nút thao tác tự ẩn). */
        let own: string | null = null;
        try {
          own = String(await contracts.core.ownerOf(depositId)).toLowerCase();
        } catch {
          own = null; // NFT đã burn — sổ đóng
        }
        const isActivePaused = Boolean(await contracts.vault.isPaused());
        const pausedAtRaw = Number(String(await contracts.vault.pausedAt()));
        const pend = address ? ((await contracts.core.pendingInterestOf(address)) as bigint) : 0n;
        const px = (await contracts.core.previewExit(depositId)) as unknown[];
        if (!cancelled) {
          setD({
            planId: raw[0] as bigint,
            principal: raw[1] as bigint,
            startAt: raw[3] as bigint,
            maturityAt: raw[4] as bigint,
            aprBpsAtOpen: raw[5] as bigint,
            penaltyBpsAtOpen: raw[6] as bigint,
            tenorDays: raw[7] as bigint,
            status: raw[8] as bigint,
          });
          setPv({
            principal: px[0] as bigint,
            interest: px[1] as bigint,
            penalty: px[2] as bigint,
            amountIfEarly: px[3] as bigint,
            maturityAt: px[4] as bigint,
            status: px[5] as bigint,
          });
          setOwner(own);
          setPaused(isActivePaused);
          setPauseAt(pausedAtRaw);
          setPendingInterest(pend);
          setNotFound(false);
        }
      } catch {
        if (!cancelled) setNotFound(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contracts, hasDeployment, depositId, address, state.status]);

  /* Check allowance cho top-up */
  useEffect(() => {
    let cancelled = false;
    if (!signerC || !amount || amount <= 0n) {
      setApproved(false);
      return;
    }
    void signerC.usdc
      .allowance(address, signerC.savingCoreAddress)
      .then((a) => {
        if (!cancelled) setApproved((a as bigint) >= amount);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [signerC, address, amount, state.status]);

  const matured = d !== null && nowSec >= Number(d.maturityAt);
  const overGrace = d !== null && nowSec >= Number(d.maturityAt) + gracePeriod;
  const isOwner = owner !== null && address !== null && owner.toLowerCase() === address.toLowerCase();
  const emergencyUnlocked = paused && pauseAt !== null && nowSec >= pauseAt + emergencyDelay;
  const closed = d !== null && Number(d.status) !== ACTIVE;

  const remainingSec = useMemo(() => {
    if (!d) return 0;
    return Math.max(0, Number(d.maturityAt) - nowSec);
  }, [d, nowSec]);

  const chunkCalc = useMemo(() => {
    if (!d || amount === null || amount <= 0n || matured) return null;
    const deltaInterest = computeChunkDeltaInterest(
      amount,
      remainingSec,
      d.aprBpsAtOpen,
      yearSeconds,
    );
    const penalty = (amount * d.penaltyBpsAtOpen) / 10000n;
    const receive = amount > penalty ? amount - penalty : 0n;
    const newPrincipalTopup = d.principal + amount;
    const remainingPrincipalPartial = d.principal > amount ? d.principal - amount : 0n;

    return {
      deltaInterest,
      penalty,
      receive,
      newPrincipalTopup,
      remainingPrincipalPartial,
    };
  }, [d, amount, matured, remainingSec, yearSeconds]);



  /* ── Sổ đóng → dựng "Kết quả tất toán" từ event log: thời điểm rút, số nhận,
        lãi, phạt rút sớm (PenaltyCharged), renew → sổ mới ── */
  useEffect(() => {
    if (!contracts || !hasDeployment || depositId === null || !closed) {
      setClosedResult(null);
      return;
    }
    let cancelled = false;
    const core = contracts.core;
    void (async () => {
      try {
        const fromBlock = chainId === 11155111 ? 12017000 : 0;
        const withdrawn = (await core.queryFilter(core.filters.Withdrawn(depositId, null), fromBlock)) as EventLog[];
        const emergency = (await core.queryFilter(core.filters.EmergencyWithdrawn(depositId, null), fromBlock)) as EventLog[];
        const renewed = (await core.queryFilter(core.filters.Renewed(depositId, null), fromBlock)) as EventLog[];
        const penalties = (await core.queryFilter(core.filters.PenaltyCharged(depositId, null), fromBlock)) as EventLog[];

        let received = 0n;
        let interest = 0n;
        let penalty = 0n;
        let at: number | null = null;
        let newId: number | null = null;

        for (const l of withdrawn) {
          const a = l.args as unknown[];
          received += a[2] as bigint;
          interest += a[3] as bigint;
          const b = await getBrowser()?.getBlock(l.blockNumber).catch(() => null);
          if (b) at = Number(b.timestamp);
        }
        for (const l of emergency) {
          const a = l.args as unknown[];
          received += a[2] as bigint;
          const b = await getBrowser()?.getBlock(l.blockNumber).catch(() => null);
          if (b) at = Number(b.timestamp);
        }
        for (const l of renewed) {
          const a = l.args as unknown[];
          newId = Number(a[1]);
          const b = await getBrowser()?.getBlock(l.blockNumber).catch(() => null);
          if (b) at = Number(b.timestamp);
        }
        for (const l of penalties) {
          const a = l.args as unknown[];
          penalty += a[2] as bigint;
        }

        if (!cancelled) setClosedResult({ at, received, interest, penalty, newId });
      } catch {
        /* RPC giới hạn — bỏ qua, card không hiện */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contracts, hasDeployment, depositId, closed, chainId, getBrowser]);

  /* ── Poll block mới: khi deposit Active chưa matured, block được ghi mới →
        refetch pv + cập nhật nowSec — lãi hiển thị chỉ thay đổi theo block ── */
  /* ── Poll block mới: chạy theo thời gian tạo khối (block.timestamp) ── */
  const isDepositActive = d !== null && Number(d.status) === ACTIVE;
  useEffect(() => {
    if (!contracts || !hasDeployment || !isDepositActive || depositId === null) return;
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
            if (!matured) {
              const px = (await contracts.core.previewExit(depositId)) as unknown[];
              if (!cancelled) setPv((p) => (p ? { ...p, interest: px[1] as bigint } : p));
            }
          }
        } catch {
          /* lỗi poll lẻ — tick sau thử lại */
        }
      })();
    }, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [contracts, hasDeployment, depositId, isDepositActive, matured, getBrowser]);

  const contractCall = (
    label: string,
    call: () => Promise<ContractTransactionResponse>,
  ): void => {
    void run(label, async () => call());
  };

  /* Action burn NFT (rút full / rút sớm / emergency) — tiền về ví và deposit id
     hết tồn tại; thành công → trang chuyển sang màn "Rút thành công" + nút về /deposits */
  const withdrawCall = (
    label: string,
    call: () => Promise<ContractTransactionResponse>,
  ): void => {
    void run(label, async () => call()).then((hash) => {
      if (hash) setWithdrawnOk(true);
    });
  };



  if (notFound) {
    if (withdrawnOk) {
      return (
        <main className="mx-auto w-full max-w-[1680px] px-4 sm:px-6 lg:px-10 pb-20">
          <section className="mt-10 card !rounded-2xl py-16 px-6 text-center">
            <CheckCircle2 size={44} className="text-ok mx-auto" aria-hidden />
            <h1 className="mt-4 text-xl font-semibold font-display text-txt">{t("detail.withdrawnOkTitle")}</h1>
            <p className="mt-2 text-sm text-subtle max-w-md mx-auto">
              {t("detail.withdrawnOkBody", { id: depositId })}
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <Link to="/deposits" className="btn btn-cta cursor-pointer">
                {t("detail.toDeposits")}
              </Link>
              <Link to="/" className="btn btn-outline cursor-pointer">
                {t("detail.toHome")}
              </Link>
            </div>
          </section>
        </main>
      );
    }
    return (
      <main className="mx-auto w-full max-w-[1680px] px-4 sm:px-6 lg:px-10 pb-20">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mt-8 btn btn-outline !py-1.5 !px-3 text-xs inline-flex items-center gap-1 cursor-pointer"
        >
          <ArrowLeft size={14} /> {t("detail.back")}
        </button>
        <section className="mt-4 card !rounded-2xl py-16 px-6 text-center">
          <SearchX size={40} className="text-subtle mx-auto" aria-hidden />
          <h1 className="mt-4 text-xl font-semibold font-display text-txt">{t("detail.notFoundTitle", { id: depositId })}</h1>
          <p className="mt-2 text-sm text-subtle max-w-md mx-auto">
            {t("detail.notFoundBody")}
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link to="/deposits" className="btn btn-cta cursor-pointer">
              {t("detail.toDeposits")}
            </Link>
            <Link to="/" className="btn btn-outline cursor-pointer">
              {t("detail.toHome")}
            </Link>
          </div>
        </section>
      </main>
    );
  }
  if (!contracts) {
    return (
      <main className="mx-auto w-full max-w-[1680px] px-4 sm:px-6 lg:px-10 pb-10">
        <NoDeploymentState page={t("detail.page")} />
      </main>
    );
  }
  if (!d || !pv) {
    /* Loading — skeleton khớp shape trang (không spinner/text treo) */
    return (
      <main className="mx-auto w-full max-w-[1680px] px-4 sm:px-6 lg:px-10 pb-20" aria-busy="true">
        <div className="skeleton mt-8 h-8 w-28" aria-hidden />
        <div className="skeleton mt-4 h-28 w-full !rounded-2xl" aria-hidden />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-6" aria-hidden>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="skeleton h-20 !rounded-lg" />
          ))}
        </div>
        <div className="skeleton mt-6 h-48 w-full !rounded-2xl" aria-hidden />
        <span className="sr-only">{t("detail.loadingAria", { id: depositId })}</span>
      </main>
    );
  }

  const tenurePct = Math.max(
    0,
    Math.min(
      100,
      ((nowSec - Number(d.startAt)) / Math.max(1, Number(d.maturityAt) - Number(d.startAt))) * 100,
    ),
  );

  return (
    <main className="mx-auto w-full max-w-[1680px] px-4 sm:px-6 lg:px-10 pb-20">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mt-8 btn btn-outline !py-1.5 !px-3 text-xs inline-flex items-center gap-1 cursor-pointer"
      >
        <ArrowLeft size={14} /> {t("detail.back")}
      </button>

      <section className="mt-4 rounded-2xl border border-line band px-6 py-6">
        <span className="eyebrow">{t("detail.eyebrow")}</span>
        <h1 className="mt-3 text-2xl sm:text-3xl font-bold font-display flex items-center gap-3">
          {t("detail.title")} #{depositId} <StatusBadge status={d.status} />
        </h1>
        <p className="text-sm text-subtle mt-1">
          {t("detail.subApr")} <strong className="num text-primary">{formatBps(d.aprBpsAtOpen)}</strong>{" "}
          {t("detail.subPenalty")} <strong className="num text-warn">{formatBps(d.penaltyBpsAtOpen)}</strong>{" "}
          {t("detail.subLocked")}
        </p>
      </section>

      {owner && !isOwner && (
        <div className="card border-warn/40 text-warn text-sm mt-4">
          {t("detail.notOwner", { short: owner.slice(0, 10), you: address?.slice(0, 10) ?? "—" })}
        </div>
      )}

      {/* ── Thông tin số liệu ─── */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-6 items-stretch">
        <InfoBox
          label={t("detail.boxPrincipal")}
          value={<>{fmtToken(d.principal)} <span className="text-subtle text-sm">USDC</span></>}
          sub={<span className="text-[11px] text-subtle">USDC (6 số lẻ)</span>}
        />
        <InfoBox
          label={t("detail.boxApr")}
          value={<span className="num text-primary">{formatBps(d.aprBpsAtOpen)}</span>}
          sub={<span className="text-[11px] text-subtle">{t("detail.subLocked")}</span>}
        />
        <InfoBox
          label={t("detail.boxTenor")}
          value={<span className="num">{t("detail.days", { d: Number(d.tenorDays) })}</span>}
          sub={<span className="text-[11px] text-subtle">{daySeconds === 1 ? "1 ngày = 1 giây" : "Kỳ hạn cố định"}</span>}
        />
        <InfoBox
          label={t("detail.boxMaturity")}
          value={
            nowSec > 0 ? (
              <span className="flex items-center gap-2">
                {Number(d.status) === ACTIVE && Number(d.maturityAt) > 0 && (
                  <MaturityRing
                    pct={tenurePct}
                    matured={matured}
                    center={matured ? "100%" : `${Math.floor(tenurePct)}%`}
                  />
                )}
                <span className="text-sm font-semibold">
                  <Countdown targetSec={d.maturityAt} nowSec={nowSec} />
                </span>
              </span>
            ) : (
              <span className="num">{fmtDate(d.maturityAt)}</span>
            )
          }
          sub={<span className="num text-[11px] text-subtle">{fmtDate(d.maturityAt)}</span>}
        />
        <InfoBox
          label={matured ? t("detail.boxInterestMatured") : t("detail.boxInterestEst")}
          value={
            Number(d.status) === 0 && !matured ? (
              <InterestTicker
                baseInterest={pv.interest}
                principal={d.principal}
                aprBps={d.aprBpsAtOpen}
                ticking={!closed}
              />
            ) : (
              <span className="num text-ok">{fmtTokenFixed(pv.interest, 6)} USDC</span>
            )
          }
          sub={<span className="text-[11px] text-subtle font-normal">{matured ? "Lãi tính theo giây (6 số lẻ)" : "Lãi dự kiến khi đáo hạn"}</span>}
        />
        <InfoBox
          label={t("detail.boxPenalty")}
          value={<span className="text-warn num">−{formatBps(d.penaltyBpsAtOpen)}</span>}
          sub={<span className="text-[11px] text-subtle font-normal">{t("detail.penaltyApprox", { amount: fmtToken(pv.penalty, 2) })}</span>}
        />
      </div>

      {overGrace && Number(d.status) === ACTIVE && (
        <div className="card mt-4 border-primary/60 bg-primary/10 text-sm">
          <strong>{t("og.a")}</strong> ({daySeconds === 86400 ? "đáo hạn + 3 ngày" : `đáo hạn + ${gracePeriod} giây`}) — hệ thống có thể tự gọi autoRenewDeposit: gốc + lãi ghép chuyển sang kỳ hạn mới, APR <strong>{t("og.c")}</strong> {formatBps(d.aprBpsAtOpen)} {t("og.d")} {Number(d.tenorDays)} {t("og.e")} Bạn cũng có thể bấm nút <strong>Tái ký</strong> bên dưới để tái ký thủ công bất kỳ lúc nào.
        </div>
      )}

      {pendingInterest !== null && pendingInterest > 0n && (isOwner || !owner) && (
        <div className="card mt-4 border-warn/50 flex flex-wrap items-center gap-3">
          <span className="text-sm flex-1">
            {t("detail.deferred1")} <strong>{t("detail.deferred2")}</strong>{" "}
            <strong className="text-ok">{fmtToken(pendingInterest)} USDC</strong>.
          </span>
          <button
            type="button"
            className="btn btn-cta"
            onClick={() => contractCall(t("detail.deferredTx"), async () => (await signerC!.core.claimPendingInterest()) as unknown as ContractTransactionResponse)}
            disabled={pending}
          >
            {t("detail.deferredCta", { amount: fmtToken(pendingInterest, 2) })}
          </button>
        </div>
      )}

      {/* ── Cảnh báo rút sớm ─── */}
      {!matured && !closed && (
        <div className="card mt-4 border-err/50 bg-err/5 text-sm flex items-start gap-2" role="alert">
          <AlertTriangle size={18} className="text-err shrink-0 mt-0.5" />
          <span>
            {t("detail.earlyWarn", {
              penalty: formatBps(d.penaltyBpsAtOpen),
              amount: fmtToken(pv.penalty, 2),
            })}{" "}
            <strong>{fmtToken(pv.amountIfEarly, 2)} USDC</strong>.
          </span>
        </div>
      )}

      {closed && (
        <div className="card mt-4 border-subtle/40 text-subtle text-sm">
          {t("detail.closedNote")} <strong className="text-txt">{t("detail.closedStrong")}</strong> {t("detail.closedTail")}
        </div>
      )}

      {/* Kết quả tất toán — thời gian rút, số nhận, lãi/lỗ (phạt), renew → sổ mới */}
      {closed && closedResult && (
        <div className="card mt-4">
          <span className="eyebrow">{t("detail.settleEyebrow")}</span>
          <dl className="num mt-3 space-y-2 text-sm">
            {closedResult.at !== null && (
              <div className="flex justify-between gap-4">
                <dt className="text-subtle">{t("detail.settleAt")}</dt>
                <dd>{fmtDate(closedResult.at)}</dd>
              </div>
            )}
            <div className="flex justify-between gap-4">
              <dt className="text-subtle">{t("detail.settleReceived")}</dt>
              <dd>{fmtToken(closedResult.received, 2)} USDC</dd>
            </div>
            {closedResult.interest > 0n && (
              <div className="flex justify-between gap-4">
                <dt className="text-subtle">{t("detail.settleInterest")}</dt>
                <dd className="text-ok">+{fmtToken(closedResult.interest, 4)} USDC</dd>
              </div>
            )}
            {closedResult.penalty > 0n && (
              <div className="flex justify-between gap-4">
                <dt className="text-subtle">{t("detail.settlePenalty")}</dt>
                <dd className="text-err">−{fmtToken(closedResult.penalty, 2)} USDC</dd>
              </div>
            )}
            {closedResult.newId !== null && (
              <div className="flex justify-between gap-4">
                <dt className="text-subtle">{t("detail.settleRenewed")}</dt>
                <dd>
                  <Link to={`/deposit/${closedResult.newId}`} className="text-secondary hover:underline">
                    {t("detail.settleLink", { id: closedResult.newId })}
                  </Link>
                </dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {paused && !closed && !emergencyUnlocked && pauseAt !== null && (
        <div className="text-xs text-warn mt-3">
          {t("detail.pauseNote")}{" "}
          {pauseAt + emergencyDelay - nowSec < 3600
            ? `${Math.max(0, pauseAt + emergencyDelay - nowSec)}s`
            : `${Math.max(0, Math.ceil((pauseAt + emergencyDelay - nowSec) / 3600))} ${t("detail.pauseHours")}`}
        </div>
      )}

      {/* ── Actions ─── */}
      {isOwner && !closed && (
        <div className="card mt-6">
          <h2 className="font-display tracking-wider mb-3">{t("detail.actions")}</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="op-amount">{t("detail.opAmountLabel")}</label>
              <input
                id="op-amount"
                className="field num"
                inputMode="decimal"
                placeholder={t("detail.opPh")}
                value={inputAmount}
                onChange={(e) => setInputAmount(e.target.value)}
              />
              <p className="text-xs text-subtle mt-1">
                {t("detail.topupNote")}
              </p>
            </div>
            <div>
              <label htmlFor="renew-plan">{t("detail.renewPlanLabel")}</label>
              <RenewPlanSelect
                plans={plans}
                currentPlanId={d !== null ? Number(d.planId) : 0}
                value={renewPlan}
                onChange={setRenewPlan}
                disabled={pending}
                plansLoading={plansLoading}
              />
              <p className="text-xs text-subtle mt-1">{t("detail.renewNote")}</p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            {matured && !paused && (
              <button
                type="button"
                className="btn btn-cta"
                disabled={pending}
                onClick={() =>
                  withdrawCall(t("detail.txWithdrawFull"), async () => (await signerC!.core.withdrawAtMaturity(depositId!)) as unknown as ContractTransactionResponse)
                }
              >
                {t("detail.btnWithdrawFull", { interest: fmtToken(pv.interest, 2) })}
              </button>
            )}
            {!matured && (
              <button
                type="button"
                className="btn btn-danger"
                disabled={pending}
                onClick={async () => {
                  const ok = await confirm({
                    title: t("detail.earlyTitle"),
                    message: (
                      <>
                        {t("detail.earlyMsg", {
                          principal: fmtToken(pv.principal, 2),
                          days: Number(d.maturityAt) > nowSec ? Math.ceil((Number(d.maturityAt) - nowSec) / daySeconds) : 0,
                          interest: fmtToken(pv.interest, 4),
                          penalty: formatBps(d.penaltyBpsAtOpen),
                          approx: fmtToken(pv.penalty, 2),
                        })}
                        <br />
                        {t("detail.earlyReceive", { amount: fmtToken(pv.amountIfEarly, 2) })}
                      </>
                    ),
                    tone: "danger",
                    okLabel: t("detail.earlyOk"),
                  });
                  if (ok) {
                    withdrawCall(t("detail.txEarly"), async () => (await signerC!.core.earlyWithdraw(depositId!)) as unknown as ContractTransactionResponse);
                  }
                }}
              >
                {t("detail.btnEarly", { penalty: formatBps(d.penaltyBpsAtOpen) })}
              </button>
            )}

            {!matured && !paused && (
              <button
                type="button"
                className="btn btn-outline"
                disabled={pending || amount === null || amount === 0n || amount >= d.principal}
                title={
                  amount === null
                    ? t("detail.needAmount")
                    : amount >= d.principal
                      ? t("detail.ltPrincipal")
                      : ""
                }
                onClick={async () => {
                  const targetAmount = amount!;
                  const deltaIntStr = chunkCalc ? fmtTokenFixed(chunkCalc.deltaInterest, 6) : "0";
                  const penaltyStr = chunkCalc ? fmtToken(chunkCalc.penalty, 2) : "0";
                  const receiveStr = chunkCalc ? fmtToken(chunkCalc.receive, 2) : "0";
                  const remPrincStr = chunkCalc ? fmtToken(chunkCalc.remainingPrincipalPartial, 2) : "0";

                  const ok = await confirm({
                    title: t("detail.partialTitle"),
                    message: (
                      <div className="space-y-3 text-sm">
                        <p>{t("detail.partialMsg", { amount: fmtToken(targetAmount), id: depositId })}</p>
                        <div className="p-3 rounded-lg bg-panel border border-line text-xs space-y-1.5 text-left">
                          <div className="flex justify-between text-err font-medium">
                            <span>{t("detail.partialLossNote")}</span>
                            <span className="num font-semibold">−{deltaIntStr} USDC</span>
                          </div>
                          <div className="flex justify-between text-warn">
                            <span>Phạt rút sớm ({formatBps(d!.penaltyBpsAtOpen)}):</span>
                            <span className="num">−{penaltyStr} USDC</span>
                          </div>
                          <div className="flex justify-between border-t border-line/60 pt-1.5 text-ok font-semibold">
                            <span>Thực nhận về ví ngay:</span>
                            <span className="num">+{receiveStr} USDC</span>
                          </div>
                          <div className="flex justify-between text-subtle text-[11px] pt-0.5">
                            <span>Gốc còn lại sau khi rút:</span>
                            <span className="num">{remPrincStr} USDC</span>
                          </div>
                        </div>
                      </div>
                    ),
                    tone: "danger",
                    okLabel: t("detail.partialOk"),
                  });
                  if (ok) {
                    void run(
                      `${t("detail.txPartial")} (−${deltaIntStr} USDC lãi)`,
                      async () => {
                        const tx = (await signerC!.core.partialEarlyWithdraw(depositId!, targetAmount)) as unknown as ContractTransactionResponse;
                        await tx.wait();
                        setInputAmount("");
                        return tx;
                      },
                    );
                  }
                }}
              >
                {t("detail.btnPartial")}
              </button>
            )}

            {!paused && (
              <button
                type="button"
                className="btn btn-outline"
                disabled={pending || amount === null || amount === 0n || matured}
                title={
                  matured
                    ? t("detail.maturedNoTopup")
                    : amount === null || amount === 0n
                      ? t("detail.needAmount")
                      : ""
                }
                onClick={async () => {
                  if (!signerC || amount === null || amount === 0n) return;
                  if (matured) {
                    await confirm({
                      title: t("common.notice"),
                      message: t("detail.maturedNoTopup"),
                      okLabel: t("common.ok"),
                    });
                    return;
                  }
                  const topupAmount = amount;
                  const deltaIntStr = chunkCalc ? fmtTokenFixed(chunkCalc.deltaInterest, 6) : "0";
                  const newPrincStr = chunkCalc ? fmtToken(chunkCalc.newPrincipalTopup, 2) : "0";

                  if (!approved) {
                    const okApprove = await confirm({
                      title: t("detail.topupApproveTitle"),
                      message: (
                        <div className="space-y-3 text-sm">
                          <p>{t("detail.topupApproveMsg", { amount: fmtToken(topupAmount), id: depositId })}</p>
                          <div className="p-3 rounded-lg bg-panel border border-line text-xs space-y-1.5 text-left">
                            <div className="flex justify-between text-ok font-semibold">
                              <span>{t("detail.topupGainNote")}</span>
                              <span className="num">+{deltaIntStr} USDC</span>
                            </div>
                            <div className="flex justify-between border-t border-line/60 pt-1.5 text-txt">
                              <span className="text-subtle">Tổng gốc mới sau khi nạp:</span>
                              <span className="font-semibold num">{newPrincStr} USDC</span>
                            </div>
                          </div>
                        </div>
                      ),
                      okLabel: t("detail.topupApproveOk"),
                    });
                    if (okApprove) {
                      void run(
                        `${t("detail.txTopup")} (+${deltaIntStr} USDC lãi)`,
                        async () => {
                          // Bước 1: Cấp quyền (Approve)
                          const appTx = (await signerC.usdc.approve(signerC.savingCoreAddress, topupAmount)) as unknown as ContractTransactionResponse;
                          await appTx.wait();
                          setApproved(true);
                          // Bước 2: Tự động nạp thêm ngay lập tức
                          const topTx = (await signerC.core.topUpDeposit(depositId!, topupAmount)) as unknown as ContractTransactionResponse;
                          await topTx.wait();
                          setInputAmount(""); // Trả thẻ về trạng thái sạch ban đầu
                          return topTx;
                        },
                      );
                    }
                    return;
                  }
                  const ok = await confirm({
                    title: t("detail.topupTitle"),
                    message: (
                      <div className="space-y-3 text-sm">
                        <p>{t("detail.topupMsg", { amount: fmtToken(topupAmount), id: depositId })}</p>
                        <div className="p-3 rounded-lg bg-panel border border-line text-xs space-y-1.5 text-left">
                          <div className="flex justify-between text-ok font-semibold">
                            <span>{t("detail.topupGainNote")}</span>
                            <span className="num">+{deltaIntStr} USDC</span>
                          </div>
                          <div className="flex justify-between border-t border-line/60 pt-1.5 text-txt">
                            <span className="text-subtle">Tổng gốc mới:</span>
                            <span className="font-semibold num">{newPrincStr} USDC</span>
                          </div>
                        </div>
                      </div>
                    ),
                    okLabel: t("detail.topupOk"),
                  });
                  if (ok) {
                    void run(
                      `${t("detail.txTopup")} (+${deltaIntStr} USDC lãi)`,
                      async () => {
                        const topTx = (await signerC!.core.topUpDeposit(depositId!, topupAmount)) as unknown as ContractTransactionResponse;
                        await topTx.wait();
                        setInputAmount(""); // Trả thẻ về trạng thái sạch ban đầu
                        return topTx;
                      },
                    );
                  }
                }}
              >
                {t("detail.btnTopup", { amount: amount !== null && amount > 0n ? fmtToken(amount, 2) : "" })}
              </button>
            )}

            {!paused && (
              <button
                type="button"
                className={`btn ${matured ? "btn-cta" : "btn-outline"}`}
                disabled={pending || !matured || renewPlan === null}
                title={
                  !matured
                    ? t("detail.notMaturedRenew")
                    : renewPlan === null
                      ? t("detail.renewHint")
                      : ""
                }
                onClick={async () => {
                  if (renewPlan === null) return;
                  const target = plans.find((p) => p.id === renewPlan) ?? null;
                  const keep = renewPlan === Number(d.planId);
                  const ok = await confirm({
                    title: t("detail.renewTitle"),
                    message: (
                      <>
                        {t("detail.renew1")}{" "}
                        <strong>{keep ? t("detail.renewCurrent") : t("detail.renewTarget", { id: renewPlan })}</strong>
                        {target && !keep && (
                          <>
                            {" "}
                            {t("detail.renewSpec", {
                              apr: formatBps(target.aprBps),
                              days: Number(target.tenorDays),
                              penalty: formatBps(target.earlyWithdrawPenaltyBps),
                            })}
                          </>
                        )}
                        {t("detail.renewTail")}
                      </>
                    ),
                    okLabel: t("detail.renewOk"),
                  });
                  if (ok) {
                    contractCall(t("detail.txRenew"), async () =>
                      (await signerC!.core.renewDeposit(depositId!, renewPlan ?? Number(d.planId))) as unknown as ContractTransactionResponse,
                    );
                  }
                }}
              >
                {t("detail.btnRenew")}
              </button>
            )}

            {paused && !emergencyUnlocked && (
              <button type="button" className="btn btn-danger cursor-not-allowed" disabled title={t("detail.emergencyLockTitle")}>
                {t("detail.btnEmergencyLocked")}
              </button>
            )}
            {emergencyUnlocked && (
              <button
                type="button"
                className="btn btn-danger"
                disabled={pending}
                onClick={async () => {
                  const ok = await confirm({
                    title: t("detail.emergencyTitle"),
                    message: t("detail.emergencyMsg"),
                    tone: "danger",
                    okLabel: t("detail.emergencyOk"),
                  });
                  if (ok) {
                    withdrawCall(t("detail.txEmergency"), async () => (await signerC!.core.emergencyWithdraw(depositId!)) as unknown as ContractTransactionResponse);
                  }
                }}
              >
                {t("detail.btnEmergency")}
              </button>
            )}
          </div>

          {pending && (
            <p className="text-xs text-subtle mt-3 inline-flex items-center gap-1" aria-live="polite">
              <Loader2 size={13} className="animate-spin" /> {t("detail.waitingTx")}
            </p>
          )}
          {state.status === "error" && (
            <p className="text-xs text-err mt-3" role="alert" aria-live="polite">
              {state.message}
            </p>
          )}
        </div>
      )}

      {/* Debug footer — các field snapshot hữu ích cho demo */}
      <details className="mt-6 text-xs text-subtle">
        <summary className="cursor-pointer">{t("detail.debugSummary")}</summary>
        <ul className="mt-2 space-y-1 font-mono">
          <li>planId: {Number(d.planId)} · penaltyBps snapshot: {Number(d.penaltyBpsAtOpen)} bps</li>
          <li>startAt → maturityAt: {fmtDate(d.startAt)} → {fmtDate(pv.maturityAt)}</li>
          <li>Status: {Number(d.status)} · isOwner: {String(isOwner)}</li>
        </ul>
      </details>
    </main>
  );
}

function InfoBox({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="card !rounded-xl !p-3.5 h-full min-h-[96px] flex flex-col justify-between">
      <div className="text-xs text-subtle">{label}</div>
      <div className="num text-lg my-1.5 flex items-center min-h-[36px]">{value}</div>
      {sub ? (
        <div className="text-[11px] text-subtle font-normal">{sub}</div>
      ) : (
        <div className="text-[11px] text-transparent select-none" aria-hidden>—</div>
      )}
    </div>
  );
}
