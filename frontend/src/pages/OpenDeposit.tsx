/**
 * OpenDeposit "/open" (T6.8) — chọn plan → nhập amount (parseUnits _,6)
 * → preview lãi + ngày đáo hạn → approve (bước 1) → openDeposit (bước 2).
 * Disable nếu amount ngoài [min, max], plan disabled, hoặc chưa connect.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, Loader2 } from "lucide-react";
import type { ContractTransactionResponse } from "ethers";
import PlanCard, { type PlanRow } from "@/components/PlanCard";
import { usePlans } from "@/hooks/usePlans";
import { useWallet } from "@/providers/WalletProvider";
import { useSignerContracts } from "@/providers/ContractsProvider";
import { useTx } from "@/hooks/useTx";
import {
  fmtToken,
  parseToken,
  previewInterestOnAmount,
  fmtDate,
  formatBps,
  SCALAR,
} from "@/lib/format";
import { useEffect } from "react";

export default function OpenDeposit() {
  const { plans, loading, error } = usePlans();
  const { address } = useWallet();
  const signerC = useSignerContracts();
  const { run, state } = useTx();
  const [selected, setSelected] = useState<number | null>(null);
  const [amountStr, setAmountStr] = useState("");
  const [allowanceReady, setAllowanceReady] = useState(false);
  const [balance, setBalance] = useState<bigint | null>(null);
  const navigate = useNavigate();

  const plan = plans.find((p) => p.id === selected) ?? null;
  const amount = useMemo(() => {
    try {
      return amountStr.trim() ? parseToken(amountStr) : null;
    } catch {
      return null;
    }
  }, [amountStr]);

  /* Đọc allowance + balance mỗi khi plan/amount/address đổi */
  useEffect(() => {
    if (!signerC || !address) return;
    let cancelled = false;
    void (async () => {
      try {
        const bal = (await signerC.usdc.balanceOf(address)) as bigint;
        if (!cancelled) setBalance(bal);
      } catch {
        /* giữ null */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [signerC, address, amountStr]);

  /* Acceptance của approve: chỉ refill đúng amount → step 2 mở */
  useEffect(() => {
    if (!signerC || !amount || amount === 0n) {
      setAllowanceReady(false);
      return;
    }
    let cancelled = false;
    void signerC.usdc
      .allowance(address, signerC.savingCoreAddress)
      .then((a) => {
        if (!cancelled) setAllowanceReady((a as bigint) >= amount);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [signerC, address, amount, state.status]);

  /* ── Validation ── */
  const gpAmount = amount ?? 0n;
  const valid =
    plan !== null &&
    gpAmount >= (plan.minDeposit || SCALAR) && // min 0视为 bất kỳ
    (plan.maxDeposit === 0n || gpAmount <= plan.maxDeposit) &&
    plan.enabled &&
    balance !== null &&
    balance >= gpAmount;
  const invalidReason = !plan
    ? "Chọn một plan"
    : !plan.enabled
      ? "Plan tạm ngưng"
      : amount === null || gpAmount === 0n
        ? "Nhập số tiền"
        : plan.maxDeposit !== 0n && gpAmount > plan.maxDeposit
          ? `Tối đa ${fmtToken(plan.maxDeposit)} USDC`
          : gpAmount < (plan.minDeposit || SCALAR)
            ? `Tối thiểu ${fmtToken(plan.minDeposit)} USDC`
            : balance !== null && balance < gpAmount
              ? `Số dư chỉ ${fmtToken(balance)} USDC`
              : "";

  const approve = () => {
    void run("Approve USDC", async () => {
      if (!signerC || !amount) throw new Error("Thiếu plan/amount");
      const coreAddr = signerC.savingCoreAddress;
      const tx = (await signerC.usdc.approve(coreAddr, amount)) as unknown as ContractTransactionResponse;
      return tx;
    });
  };

  const openDeposit = () => {
    void run("Mở tiết kiệm", async () => {
      if (!signerC || !plan || !amount) throw new Error("Thiếu plan/amount");
      const tx = (await signerC.core.openDeposit(plan.id, amount)) as unknown as ContractTransactionResponse;
      return tx;
    });
  };

  void navigate; // (dùng ở "tương lai" chuyển detail sau khi mined ok — optional)

  return (
    <main className="mx-auto max-w-5xl px-4 pb-16">
      <div className="mt-8">
        <span className="eyebrow">Mở deposit mới</span>
        <h1 className="mt-3 text-4xl font-bold font-display tracking-tight">Mở tiết kiệm</h1>
      </div>
      {error && <div className="card border-err/40 text-err text-sm mt-4">{error}</div>}
      {loading && (
        <div className="mt-6" role="status" aria-label="Đang tải plans">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="card" aria-hidden>
                <div className="skeleton h-3 w-16" />
                <div className="skeleton mt-3 h-9 w-20" />
                <div className="skeleton mt-2 h-4 w-24" />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mt-6" aria-label="Danh sách plan">
        {plans.map((p) => (
          <PlanCard
            key={p.id}
            plan={p}
            variant={Number(p.tenorDays) === 180}
            onSelect={(sel: PlanRow) => setSelected(sel.id)}
            selected={selected === p.id}
            compact
          />
        ))}
      </div>

      {/* ── Form + sticky summary (2 cột từ lg) ─── */}
      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_340px] items-start">
        <section className="card order-2 lg:order-1" aria-label="Form mở tiết kiệm">
          <label htmlFor="amount-input" className="!text-sm !font-semibold !text-txt">
            Số tiền muốn gửi (USDC)
          </label>
          <input
            id="amount-input"
            className="field num text-lg"
            inputMode="decimal"
            placeholder="VD: 1000"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            disabled={!plan || !address}
          />
          {balance !== null && amountStr && gpAmount > 0n && (
            <p className="num text-xs text-subtle mt-1.5">Số dư hiện tại: {fmtToken(balance)} USDC</p>
          )}

          {invalidReason && (
            <p className="text-xs text-warn mt-3" role="alert">
              ⚠ {invalidReason}
            </p>
          )}

          {/* Step indicator: 1 Approve → 2 Mở */}
          <ol className="mt-5 flex items-center gap-2 text-xs" aria-label="Các bước">
            {["1 · Approve USDC", "2 · Mở tiết kiệm"].map((label, i) => {
              const done = i === 0 ? allowanceReady : false;
              const current = allowanceReady ? i === 1 : i === 0;
              return (
                <li
                  key={label}
                  className={`rounded-full border px-3 py-1.5 cursor-default flex items-center gap-1.5 transition-colors duration-200 ${
                    done
                      ? "border-ok/50 bg-ok/10 text-ok"
                      : current
                        ? "border-cta/60 bg-cta/10 text-cta"
                        : "border-white/10 text-subtle"
                  }`}
                >
                  {done && <CheckCircle2 size={12} />}
                  {label}
                </li>
              );
            })}
          </ol>

          <div className="mt-5 flex flex-wrap gap-3 justify-end">
            {allowanceReady ? (
              <span className="inline-flex items-center gap-1 text-xs text-ok self-center">
                <CheckCircle2 size={14} /> Đã approve (allowance đủ)
              </span>
            ) : (
              <button
                type="button"
                className="btn btn-outline"
                onClick={approve}
                disabled={!valid || amount === null || state.status === "pending"}
              >
                {state.status === "pending" ? <Loader2 className="animate-spin" size={16} /> : null} Approve
              </button>
            )}
            <button
              type="button"
              className="btn btn-cta"
              onClick={openDeposit}
              disabled={!valid || !allowanceReady || state.status === "pending"}
            >
              {state.status === "pending" ? <Loader2 className="animate-spin" size={16} /> : null} Mở tiết kiệm
            </button>
          </div>
        </section>

        {/* Sticky summary */}
        <aside className="card order-1 lg:order-2 lg:sticky lg:top-24 !border-primary/40" aria-label="Tóm tắt kỳ hạn">
          <span className="eyebrow !border-primary/30 !text-primary">Tóm tắt kỳ hạn</span>
          {plan && gpAmount > 0n ? (
            <dl className="num mt-4 space-y-2.5 text-sm">
              <div className="flex justify-between items-baseline">
                <dt className="text-subtle">Lãi dự kiến đủ hạn</dt>
                <dd className="text-ok font-display glow-num text-base">
                  +{fmtToken(previewInterestOnAmount(gpAmount, plan.tenorDays, plan.aprBps), 4)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-subtle">Phạt nếu rút sớm</dt>
                <dd className="text-warn">−{fmtToken((gpAmount * plan.earlyWithdrawPenaltyBps) / 10_000n, 2)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-subtle">APR · Kỳ hạn</dt>
                <dd>
                  {formatBps(plan.aprBps)} · {Number(plan.tenorDays)} ngày
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-subtle">Đáo hạn (ước lượng)</dt>
                <dd className="text-right">
                  {amount !== null ? fmtDate(Date.now() / 1000 + Number(plan.tenorDays) * 86_400) : "—"}
                </dd>
              </div>
              <div className="pt-3 border-t border-white/5 text-xs text-subtle leading-relaxed">
                Lãi tính theo giây — số hiển thị khớp logic contract (floor, D9).
              </div>
            </dl>
          ) : (
            <p className="mt-3 text-sm text-subtle leading-relaxed">
              Chọn plan ở trên + nhập số tiền để xem preview lãi / phạt / ngày đáo hạn ở đây.
            </p>
          )}
        </aside>
      </div>
    </main>
  );
}
