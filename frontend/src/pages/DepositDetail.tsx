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
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, AlertTriangle, Loader2, SearchX } from "lucide-react";
import type { ContractTransactionResponse } from "ethers";
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
  const { address, getBrowser } = useWallet();
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
  const [approved, setApproved] = useState(false);

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
        const own = String(await contracts.core.ownerOf(depositId)).toLowerCase();
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

  const contractCall = (
    label: string,
    call: () => Promise<ContractTransactionResponse>,
  ): void => {
    void run(label, async () => call());
  };

  if (notFound) {
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
          label={matured ? "Lãi tại maturity" : "Lãi tích luỹ tới hiện tại"}
          value={
            Number(d.status) === 0 && !matured ? (
              <InterestTicker
                baseInterest={pv.interest}
                principal={d.principal}
                aprBps={d.aprBpsAtOpen}
                ticking={!closed}
              />
            ) : (
              <span className="num text-ok">+{fmtToken(pv.interest, 4)}</span>
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
          Deposit đã đóng — NFT đã burn. Số liệu trên là lịch sử (Withdrawn / EarlyWithdrawn / AutoRenewed).
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
                  contractCall("Rút đủ hạn", async () => (await signerC!.core.withdrawAtMaturity(depositId!)) as unknown as ContractTransactionResponse)
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
                    contractCall("Rút sớm", async () => (await signerC!.core.earlyWithdraw(depositId!)) as unknown as ContractTransactionResponse);
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
                    contractCall("Emergency withdraw", async () => (await signerC!.core.emergencyWithdraw(depositId!)) as unknown as ContractTransactionResponse);
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
