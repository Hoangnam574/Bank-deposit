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
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, AlertTriangle, Loader2, SearchX, CheckCircle2 } from "lucide-react";
import type { ContractTransactionResponse, EventLog } from "ethers";
import StatusBadge from "@/components/StatusBadge";
import Countdown from "@/components/Countdown";
import MaturityRing from "@/components/MaturityRing";
import InterestTicker from "@/components/InterestTicker";
import NoDeploymentState from "@/components/NoDeploymentState";
import { useConfirm } from "@/components/ConfirmDialog";
import { useContracts, useSignerContracts } from "@/providers/ContractsProvider";
import { useWallet } from "@/providers/WalletProvider";
import { useTx } from "@/hooks/useTx";
import { usePlans } from "@/hooks/usePlans";
import RenewPlanSelect from "@/components/RenewPlanSelect";
import { fmtToken, formatBps, fmtDate } from "@/lib/format";

const SCALAR = 1_000_000n;
const ACTIVE = 0;
const GRACE_SECONDS = 3 * 86_400; // variant AT190234: grace 3 ngày
const EMERGENCY_DELAY_SECONDS = 7 * 86_400; // C5 sau 7 ngày pause

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
  if (!/^[0-9]+(\.[0-9]+)?$/.test(input)) throw new Error("Số tiền không hợp lệ");
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
  const { address, getBrowser, chainId } = useWallet();
  const { state, run } = useTx();
  const confirm = useConfirm();

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

  /* Nút gạt "Tự động renew" — preference lưu localStorage (contract không có chỗ
     lưu ý định, không đụng contracts/tests). Key theo chain + ví + depositId
     để không nhầm lẫn giữa mạng/tài khoản/sổ khác nhau. */
  const [arOn, setArOn] = useState(false);
  const [arPlan, setArPlan] = useState<number | null>(null);
  const arFiredRef = useRef(false);

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
  const overGrace = d !== null && nowSec >= Number(d.maturityAt) + GRACE_SECONDS;
  const isOwner = owner !== null && address !== null && owner.toLowerCase() === address.toLowerCase();
  const emergencyUnlocked = paused && pauseAt !== null && nowSec >= pauseAt + EMERGENCY_DELAY_SECONDS;
  const closed = d !== null && Number(d.status) !== ACTIVE;

  /* ── Nút gạt Tự động renew — nạp/lưu preference theo chain + ví + id ── */
  const arKey =
    address && depositId !== null ? `ar:${chainId ?? 0}:${address.toLowerCase()}:${depositId}` : null;
  useEffect(() => {
    if (!arKey) return;
    try {
      const raw = localStorage.getItem(arKey);
      if (raw) {
        const j = JSON.parse(raw) as { on?: boolean; planId?: number };
        setArOn(Boolean(j.on));
        setArPlan(j.planId ?? null);
      } else {
        setArOn(false);
        setArPlan(null);
      }
    } catch {
      /* JSON hỏng — coi như chưa bật */
    }
    arFiredRef.current = false; // đổi sổ → nạp lại cờ tự động
  }, [arKey]);

  const setAr = (on: boolean, planId: number | null): void => {
    setArOn(on);
    setArPlan(planId);
    if (on && arKey && planId !== null) localStorage.setItem(arKey, JSON.stringify({ on: true, planId }));
    else if (arKey) localStorage.removeItem(arKey);
  };

  /* Auto-fire: gạt BẬT + đã quá grace + vẫn Active + là owner + không pause
     → tự gọi renewDeposit 1 lần (ref chặn gọi lặp khi effect chạy lại theo
     poll/state; tx lỗi thì dừng — user sửa thiết lập rồi thử lại). */
  useEffect(() => {
    if (arFiredRef.current || !arOn || arPlan === null || !isOwner || paused || closed || !overGrace || pending) {
      return;
    }
    arFiredRef.current = true;
    void autoRenewNow(arPlan);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arOn, arPlan, isOwner, paused, closed, overGrace, pending]);

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
        const withdrawn = (await core.queryFilter(core.filters.Withdrawn(depositId, null))) as EventLog[];
        const emergency = (await core.queryFilter(core.filters.EmergencyWithdrawn(depositId, null))) as EventLog[];
        const renewed = (await core.queryFilter(core.filters.Renewed(depositId, null))) as EventLog[];
        const penalties = (await core.queryFilter(core.filters.PenaltyCharged(depositId, null))) as EventLog[];

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
  }, [contracts, hasDeployment, depositId, closed, getBrowser]);

  /* ── Poll block mới: khi deposit Active chưa matured, block được ghi mới →
        refetch pv + cập nhật nowSec — lãi hiển thị chỉ thay đổi theo block ── */
  const interestLive = d !== null && Number(d.status) === ACTIVE && !matured;
  useEffect(() => {
    if (!contracts || !hasDeployment || !interestLive || depositId === null) return;
    let cancelled = false;
    let lastSeen = 0;
    const t = window.setInterval(() => {
      void (async () => {
        try {
          const block = await getBrowser()?.getBlock("latest");
          if (!block || cancelled) return;
          const ts = Number(block.timestamp);
          if (lastSeen !== 0 && ts !== lastSeen) {
            if (!cancelled) setNowSec(ts);
            const px = (await contracts.core.previewExit(depositId)) as unknown[];
            if (!cancelled) setPv((p) => (p ? { ...p, interest: px[1] as bigint } : p));
          }
          lastSeen = ts;
        } catch {
          /* lỗi poll lẻ — tick sau thử lại */
        }
      })();
    }, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [contracts, hasDeployment, depositId, interestLive, getBrowser]);

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

  /* Tự động renew theo nút gạt: khi đến lượt (đã quá grace) tự gọi
     renewDeposit(depositId, planId) — hàm public của contract (chỉ yêu cầu
     now >= maturityAt, cho phép chọn plan). Parse event Renewed → chuyển sang
     trang deposit mới (NFT cũ đã burn). */
  const autoRenewNow = async (planId: number): Promise<void> => {
    if (!signerC || depositId === null) return;
    const iface = signerC.core.interface;
    let newId: number | null = null;
    const hash = await run("Tự động renew", async () => {
      const tx = (await signerC.core.renewDeposit(depositId, planId)) as unknown as ContractTransactionResponse;
      const receipt = await tx.wait();
      for (const log of receipt?.logs ?? []) {
        try {
          const desc = iface.parseLog({ topics: log.topics as string[], data: log.data });
          if (desc?.name === "Renewed") newId = Number((desc.args as unknown[])[1]);
        } catch {
          /* log của contract khác — bỏ qua */
        }
      }
      return tx;
    });
    if (hash && newId !== null && newId > 0) navigate(`/deposit/${newId}`);
  };

  if (notFound) {
    if (withdrawnOk) {
      return (
        <main className="mx-auto w-full max-w-[1680px] px-4 sm:px-6 lg:px-10 pb-20">
          <section className="mt-10 card !rounded-2xl py-16 px-6 text-center">
            <CheckCircle2 size={44} className="text-ok mx-auto" aria-hidden />
            <h1 className="mt-4 text-xl font-semibold font-display text-txt">Rút thành công</h1>
            <p className="mt-2 text-sm text-subtle max-w-md mx-auto">
              Deposit #{depositId} đã tất toán — NFT đã burn, số tiền (principal + lãi / sau penalty)
              đã về ví của bạn.
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <Link to="/deposits" className="btn btn-cta cursor-pointer">
                Về sổ tiết kiệm
              </Link>
              <Link to="/" className="btn btn-outline cursor-pointer">
                Về trang chủ
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
          <ArrowLeft size={14} /> Trở về
        </button>
        <section className="mt-4 card !rounded-2xl py-16 px-6 text-center">
          <SearchX size={40} className="text-subtle mx-auto" aria-hidden />
          <h1 className="mt-4 text-xl font-semibold font-display text-txt">Không tìm thấy deposit #{depositId}</h1>
          <p className="mt-2 text-sm text-subtle max-w-md mx-auto">
            NFT của deposit này có thể đã burn sau khi rút, hoặc URL trỏ đến ID chưa từng tồn tại trên
            mạng đang kết nối. Kiểm tra ID trong sổ tiết kiệm của bạn.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link to="/deposits" className="btn btn-cta cursor-pointer">
              Về sổ tiết kiệm
            </Link>
            <Link to="/" className="btn btn-outline cursor-pointer">
              Về trang chủ
            </Link>
          </div>
        </section>
      </main>
    );
  }
  if (!contracts) {
    return (
      <main className="mx-auto w-full max-w-[1680px] px-4 sm:px-6 lg:px-10 pb-10">
        <NoDeploymentState page="Chi tiết deposit" />
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
        <span className="sr-only">Đang tải deposit #{depositId}</span>
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
        <ArrowLeft size={14} /> Trở về
      </button>

      <section className="mt-4 rounded-2xl border border-line band px-6 py-6">
        <span className="eyebrow">Chi tiết deposit</span>
        <h1 className="mt-3 text-2xl sm:text-3xl font-bold font-display flex items-center gap-3">
          Deposit #{depositId} <StatusBadge status={d.status} />
        </h1>
        <p className="text-sm text-subtle mt-1">
          Lãi tính theo giây · APR snapshot <strong className="num text-primary">{formatBps(d.aprBpsAtOpen)}</strong> ·
          penalty <strong className="num text-warn">{formatBps(d.penaltyBpsAtOpen)}</strong> (khóa tại thời điểm mở — admin đổi plan không ảnh hưởng)
        </p>
      </section>

      {owner && !isOwner && (
        <div className="card border-warn/40 text-warn text-sm mt-4">
          Chỉ chủ NFT ({owner.slice(0, 10)}…) mới thao tác được — bạn đang dùng {address?.slice(0, 10)}…
        </div>
      )}

      {/* ── Thông tin số liệu ─── */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-6">
        <InfoBox label="Principal" value={<>{fmtToken(d.principal)} <span className="text-subtle">USDC</span></>} />
        <InfoBox label="APR khi mở (snapshot)" value={<span className="num text-primary">{formatBps(d.aprBpsAtOpen)}</span>} />
        <InfoBox label="Kỳ hạn" value={<span className="num">{`${Number(d.tenorDays)} ngày`}</span>} />
        <InfoBox
          label="Đáo hạn"
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
                <span className="text-sm">
                  <Countdown targetSec={d.maturityAt} nowSec={nowSec} />
                </span>
              </span>
            ) : (
              <span className="num">{fmtDate(d.maturityAt)}</span>
            )
          }
        />
        <InfoBox
          label={matured ? "Lãi nhận khi rút đúng hạn" : "Lãi dự kiến khi đáo hạn"}
          value={
            Number(d.status) === 0 && !matured ? (
              <InterestTicker
                baseInterest={pv.interest}
                principal={d.principal}
                aprBps={d.aprBpsAtOpen}
                ticking={!closed}
              />
            ) : (
              <span className="num text-ok">{fmtToken(pv.interest, 4)} USDC</span>
            )
          }
        />
        <InfoBox
          label="Phạt nếu rút sớm (rate)"
          value={
            <span className="text-warn">
              <span className="num">−{formatBps(d.penaltyBpsAtOpen)}</span>
              <span className="block text-[11px] text-subtle font-normal mt-0.5">
                ≈ {fmtToken(pv.penalty, 2)} USDC với principal hiện tại
              </span>
            </span>
          }
        />
      </div>

      {/* ── Nút gạt Tự động renew — luôn hiện khi Active + owner, đặt TRÊN card
          progress kỳ hạn (user yêu cầu); set ý định sớm, đến lượt là tự chạy ── */}
      {isOwner && !closed && (
        <div className="card mt-3 !py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h2 className="font-display tracking-wider">Tự động renew</h2>
              <p className="text-xs text-subtle mt-1">
                Bật: khi sổ đáo hạn và hết <span className="num">3 ngày</span> grace, app{" "}
                <strong className="text-txt">tự gọi renew</strong> toàn bộ principal + lãi ghép theo plan bạn chọn
                bên dưới. NFT mới được mint — trang tự chuyển sang sổ mới.
                {!overGrace && d !== null && (
                  <> Hẹn: <span className="num text-primary">{fmtDate(Number(d.maturityAt) + GRACE_SECONDS)}</span>.</>
                )}
              </p>

              {arOn && (
                <div className="mt-3">
                  <span className="eyebrow">Plan sẽ renew vào</span>
                  <div className="mt-1.5 max-w-md">
                    <RenewPlanSelect
                      plans={plans}
                      currentPlanId={Number(d?.planId ?? 0)}
                      value={arPlan}
                      onChange={(planId) => setAr(true, planId)}
                      disabled={pending}
                      plansLoading={plansLoading}
                    />
                  </div>
                  <p className="text-[11px] text-subtle mt-1.5">
                    Hover/chọn plan để xem APR · kỳ hạn · phạt rút sớm (mặc định: plan hiện tại).
                  </p>
                </div>
              )}

              {arOn && overGrace && (
                <p className="text-xs text-ok mt-2" role="status">
                  Đã đủ điều kiện — app sẽ tự renew ngay (chỉ chạy 1 lần).
                </p>
              )}
            </div>

            {/* Switch — nút gạt có cửa sổ xác nhận khi BẬT và khi TẮT */}
            <button
              type="button"
              role="switch"
              aria-checked={arOn}
              aria-label="Tự động renew sau grace"
              disabled={pending}
              className="shrink-0 cursor-pointer disabled:opacity-50"
              onClick={async () => {
                if (!arOn) {
                  const ok = await confirm({
                    title: "Bật tự động renew",
                    message: (
                      <>
                        Khi sổ #{depositId} đáo hạn và hết <span className="num">3 ngày</span> grace, app sẽ{" "}
                        <strong className="text-ok">tự động gọi renew</strong> toàn bộ principal + lãi ghép theo plan
                        bạn chọn. NFT mới được mint — trang tự chuyển sang sổ mới.
                        <br />
                        <span className="text-xs text-subtle">
                          App/tab cần đang mở để chạy (bot off-chain vẫn chạy song song khi node có key).
                        </span>
                      </>
                    ),
                    okLabel: "Bật tự động renew",
                  });
                  if (ok) setAr(true, arPlan ?? renewPlan);
                } else {
                  const ok = await confirm({
                    title: "Tắt tự động renew",
                    message: (
                      <>
                        Không còn tự renew khi hết grace nữa — bạn phải{" "}
                        <strong>renew hoặc rút thủ công</strong>.
                      </>
                    ),
                    tone: "danger",
                    okLabel: "Tắt tự động renew",
                  });
                  if (ok) setAr(false, null);
                }
              }}
            >
              <span
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-200 ${
                  arOn ? "bg-ok" : "bg-subtle/40"
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ${
                    arOn ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Progress kỳ hạn (startAt → maturityAt) — scaleX GPU-safe */}
      {Number(d.status) === ACTIVE && Number(d.maturityAt) > 0 && (
        <div className="card mt-3 !py-3" aria-hidden>
          <div className="flex justify-between text-xs text-subtle mb-1.5">
            <span>{fmtDate(d.startAt)}</span>
            <span>{fmtDate(d.maturityAt)}</span>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ "--p": (tenurePct / 100).toFixed(3) } as CSSProperties} />
          </div>
        </div>
      )}

      {overGrace && Number(d.status) === ACTIVE && (
        <div className="card mt-4 border-primary/60 bg-primary/10 text-sm">
          <strong>Quá grace period</strong> (maturity + 3 ngày) — bot sẽ gọi autoRenewDeposit: renewal
          principal + lãi ghép, APR <strong>giữ nguyên</strong> {formatBps(d.aprBpsAtOpen)} và tenor{" "}
          {Number(d.tenorDays)} ngày (snapshot).
        </div>
      )}

      {pendingInterest !== null && pendingInterest > 0n && isOwner && (
        <div className="card mt-4 border-warn/50 flex flex-wrap items-center gap-3">
          <span className="text-sm flex-1">
            Lãi bị <strong>deferred</strong> (C1 — vault thiếu USDC tại thời điểm rút): đang NỢ bạn{" "}
            <strong className="text-ok">{fmtToken(pendingInterest)} USDC</strong>.
          </span>
          <button
            type="button"
            className="btn btn-cta"
            onClick={() => contractCall("Claim lãi deferred", async () => (await signerC!.core.claimPendingInterest()) as unknown as ContractTransactionResponse)}
            disabled={pending}
          >
            Claim {fmtToken(pendingInterest, 2)}
          </button>
        </div>
      )}

      {/* ── Cảnh báo rút sớm — bắt buộc theo T6.10 ─── */}
      {!matured && !closed && (
        <div className="card mt-4 border-err/50 bg-err/5 text-sm flex items-start gap-2" role="alert">
          <AlertTriangle size={18} className="text-err shrink-0 mt-0.5" />
          <span>
            Rút sớm trước maturity: mất toàn bộ lãi tích luỹ + phạt {formatBps(d.penaltyBpsAtOpen)} (≈{" "}
            {fmtToken(pv.penalty, 2)} USDC) → chỉ nhận{" "}
            <strong>{fmtToken(pv.amountIfEarly, 2)} USDC</strong>.
          </span>
        </div>
      )}

      {closed && (
        <div className="card mt-4 border-subtle/40 text-subtle text-sm">
          Sổ đã đóng — <strong className="text-txt">chế độ chỉ xem</strong> (NFT đã burn, không thao tác được). Số
          liệu trên là snapshot lịch sử.
        </div>
      )}

      {/* Kết quả tất toán — thời gian rút, số nhận, lãi/lỗ (phạt), renew → sổ mới */}
      {closed && closedResult && (
        <div className="card mt-4">
          <span className="eyebrow">Kết quả tất toán</span>
          <dl className="num mt-3 space-y-2 text-sm">
            {closedResult.at !== null && (
              <div className="flex justify-between gap-4">
                <dt className="text-subtle">Thời điểm tất toán</dt>
                <dd>{fmtDate(closedResult.at)}</dd>
              </div>
            )}
            <div className="flex justify-between gap-4">
              <dt className="text-subtle">Số tiền nhận</dt>
              <dd>{fmtToken(closedResult.received, 2)} USDC</dd>
            </div>
            {closedResult.interest > 0n && (
              <div className="flex justify-between gap-4">
                <dt className="text-subtle">Lãi nhận</dt>
                <dd className="text-ok">+{fmtToken(closedResult.interest, 4)} USDC</dd>
              </div>
            )}
            {closedResult.penalty > 0n && (
              <div className="flex justify-between gap-4">
                <dt className="text-subtle">Phạt rút sớm (lỗ)</dt>
                <dd className="text-err">−{fmtToken(closedResult.penalty, 2)} USDC</dd>
              </div>
            )}
            {closedResult.newId !== null && (
              <div className="flex justify-between gap-4">
                <dt className="text-subtle">Tái ký thành sổ mới</dt>
                <dd>
                  <Link to={`/deposit/${closedResult.newId}`} className="text-secondary hover:underline">
                    Sổ #{closedResult.newId} →
                  </Link>
                </dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {paused && !closed && !emergencyUnlocked && pauseAt !== null && (
        <div className="text-xs text-warn mt-3">
          Hệ thống đang pause — write bị chặn. Emergency (C5) unlock sau{" "}
          {Math.max(0, Math.ceil((pauseAt + EMERGENCY_DELAY_SECONDS - nowSec) / 3600))} giờ.
        </div>
      )}

      {/* ── Actions ─── */}
      {isOwner && !closed && (
        <div className="card mt-6">
          <h2 className="font-display tracking-wider mb-3">Thao tác</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="op-amount">Số lượng (cho Rút một phần / Top-up)</label>
              <input
                id="op-amount"
                className="field num"
                inputMode="decimal"
                placeholder="VD: 1000"
                value={inputAmount}
                onChange={(e) => setInputAmount(e.target.value)}
              />
              <p className="text-xs text-subtle mt-1">
                Top-up không bị giới hạn min/max của plan — chỉ cap MAX_PRINCIPAL hợp đồng.
              </p>
            </div>
            <div>
              <label htmlFor="renew-plan">Plan cho Renew</label>
              <RenewPlanSelect
                plans={plans}
                currentPlanId={d !== null ? Number(d.planId) : 0}
                value={renewPlan}
                onChange={setRenewPlan}
                disabled={pending}
                plansLoading={plansLoading}
              />
              <p className="text-xs text-subtle mt-1">Renew chỉ vào plan enabled — ngược lại revert SC_PlanNotEnabled.</p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            {matured && !paused && (
              <button
                type="button"
                className="btn btn-cta"
                disabled={pending}
                onClick={() =>
                  withdrawCall("Rút đủ hạn", async () => (await signerC!.core.withdrawAtMaturity(depositId!)) as unknown as ContractTransactionResponse)
                }
              >
                Rút full (+{fmtToken(pv.interest, 2)} lãi)
              </button>
            )}
            {!matured && (
              <button
                type="button"
                className="btn btn-danger"
                disabled={pending}
                onClick={async () => {
                  const ok = await confirm({
                    title: "Rút sớm",
                    message: (
                      <>
                        Rút <strong className="num">{fmtToken(pv.principal, 2)} USDC</strong> trước maturity
                        (maturing còn <strong>{Number(d.maturityAt) > nowSec ? Math.ceil((Number(d.maturityAt) - nowSec) / 86400) : 0} ngày</strong>):
                        mất toàn bộ lãi tích luỹ (<span className="num text-ok">−{fmtToken(pv.interest, 4)}</span>) +{" "}
                        <strong className="num text-warn">phạt {formatBps(d.penaltyBpsAtOpen)}</strong> (
                        ≈{fmtToken(pv.penalty, 2)} USDC).
                        <br />
                        Nhận ngay: <strong className="num">{fmtToken(pv.amountIfEarly, 2)} USDC</strong>.
                      </>
                    ),
                    tone: "danger",
                    okLabel: "Đồng ý rút sớm",
                  });
                  if (ok) {
                    withdrawCall("Rút sớm", async () => (await signerC!.core.earlyWithdraw(depositId!)) as unknown as ContractTransactionResponse);
                  }
                }}
              >
                Rút sớm (−{formatBps(d.penaltyBpsAtOpen)} penalty)
              </button>
            )}

            {!matured && !paused && (
              <button
                type="button"
                className="btn btn-outline"
                disabled={pending || amount === null || amount === 0n || amount >= d.principal}
                title={amount === null ? "Nhập số lượng ở trên" : amount >= d.principal ? "Phải < principal" : ""}
                onClick={async () => {
                  const ok = await confirm({
                    title: "Rút một phần",
                    message: (
                      <>
                        Rút <strong className="num">{fmtToken(amount!)} USDC</strong> khỏi deposit&nbsp;#{depositId}.
                        Lãi của phần gốc rút được tính weighted (C3); phần còn lại tiếp tục tích lãi đến maturity.
                      </>
                    ),
                    okLabel: "Rút một phần",
                  });
                  if (ok) {
                    contractCall("Rút một phần", async () => (await signerC!.core.partialEarlyWithdraw(depositId!, amount!)) as unknown as ContractTransactionResponse);
                  }
                }}
              >
                Rút một phần
              </button>
            )}

            {!paused &&
              (approved ? (
                <button
                  type="button"
                  className="btn btn-outline"
                  disabled={pending || amount === null || amount === 0n}
                  onClick={async () => {
                    const ok = await confirm({
                      title: "Nạp thêm (top-up) vào deposit",
                      message: (
                        <>
                          Gửi thêm <strong className="num">{fmtToken(amount!)} USDC</strong> vào deposit #{depositId} —
                          hợp nhất vào principal, lãi tiếp tục tính trên số mới đến maturity (APR/tenor snapshot
                          giữ nguyên).
                        </>
                      ),
                      okLabel: "Top-up",
                    });
                    if (ok) {
                      contractCall("Top-up", async () => (await signerC!.core.topUpDeposit(depositId!, amount!)) as unknown as ContractTransactionResponse);
                    }
                  }}
                >
                  Top-up {amount !== null ? fmtToken(amount, 2) : ""}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-outline"
                  disabled={pending || amount === null || amount === 0n}
                  title="Bước 1: Approve — cho phép hợp đồng rút USDC từ ví vào vault khi bạn nạp thêm. ERC-20 bắt buộc bước này trước top-up; chỉ cần làm 1 lần cho số tiền đó."
                  onClick={() => {
                    if (!signerC) return;
                    contractCall("Approve USDC (top-up)", async () =>
                      (await signerC.usdc.approve(signerC.savingCoreAddress, amount!)) as unknown as ContractTransactionResponse,
                    );
                  }}
                >
                  1. Approve ({amount !== null ? fmtToken(amount, 2) : ""} USDC)
                </button>
              ))}

            {!paused && !overGrace && (
              <button
                type="button"
                className="btn btn-outline"
                disabled={pending || renewPlan === null}
                title="Renew: tái ký hết kỳ — toàn bộ principal + lãi ghép thành 1 kỳ hạn mới theo plan đã chọn."
                onClick={async () => {
                  if (renewPlan === null) return;
                  const target = plans.find((p) => p.id === renewPlan) ?? null;
                  const keep = renewPlan === Number(d.planId);
                  const ok = await confirm({
                    title: "Renew (tái gửi tiết kiệm)",
                    message: (
                      <>
                        Principal + lãi ghép chuyển thành kỳ hạn mới theo{" "}
                        <strong>{keep ? "plan hiện tại" : `Plan #${renewPlan}`}</strong>
                        {target && !keep && (
                          <>
                            {" "}
                            — APR <span className="num">{formatBps(target.aprBps)}</span>, kỳ hạn{" "}
                            <span className="num">{Number(target.tenorDays)} ngày</span>, phạt rút sớm{" "}
                            <span className="num text-warn">{formatBps(target.earlyWithdrawPenaltyBps)}</span>
                          </>
                        )}
                        . NFT nhận status AutoRenewed.
                      </>
                    ),
                    okLabel: "Renew ngay",
                  });
                  if (ok) {
                    contractCall("Renew", async () =>
                      (await signerC!.core.renewDeposit(depositId!, renewPlan ?? Number(d.planId))) as unknown as ContractTransactionResponse,
                    );
                  }
                }}
              >
                Renew
              </button>
            )}

            {paused && !emergencyUnlocked && (
              <button type="button" className="btn btn-danger cursor-not-allowed" disabled title="Cần pause ≥ 7 ngày (C5)">
                Emergency (khóa)
              </button>
            )}
            {emergencyUnlocked && (
              <button
                type="button"
                className="btn btn-danger"
                disabled={pending}
                onClick={async () => {
                  const ok = await confirm({
                    title: "Emergency Withdraw (C5)",
                    message: "Rút khi hệ thống pause ≥ 7 ngày: nhận principal, không có lãi và không bị phạt.",
                    tone: "danger",
                    okLabel: "Emergency withdraw",
                  });
                  if (ok) {
                    withdrawCall("Emergency withdraw", async () => (await signerC!.core.emergencyWithdraw(depositId!)) as unknown as ContractTransactionResponse);
                  }
                }}
              >
                Emergency Withdraw (C5)
              </button>
            )}
          </div>

          {pending && (
            <p className="text-xs text-subtle mt-3 inline-flex items-center gap-1" aria-live="polite">
              <Loader2 size={13} className="animate-spin" /> Đợi xác nhận giao dịch… (toast hiển thị tx hash)
            </p>
          )}
          {state.status === "error" && (
            <p className="text-xs text-err mt-3" role="alert" aria-live="polite">
              {state.message}
            </p>
          )}
        </div>
      )}

      {/* Debug footer — các field snapshot helpful cho demo */}
      <details className="mt-6 text-xs text-subtle">
        <summary className="cursor-pointer">Chi tiết kỹ thuật (snapshot từ contract)</summary>
        <ul className="mt-2 space-y-1 font-mono">
          <li>planId: {Number(d.planId)} · penaltyBps snapshot: {Number(d.penaltyBpsAtOpen)} bps</li>
          <li>startAt → maturityAt: {fmtDate(Number(pv.maturityAt) - Number(d.tenorDays) * 86400)} → {fmtDate(Number(pv.maturityAt))}</li>
          <li>Status: {Number(d.status)} · isOwner: {String(isOwner)}</li>
        </ul>
      </details>
    </main>
  );
}

function InfoBox({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="card !rounded-xl !p-3">
      <div className="text-xs text-subtle">{label}</div>
      <div className="num text-lg mt-1">{value}</div>
    </div>
  );
}
