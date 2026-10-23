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
  SCALAR,
} from "@/lib/format";
import { useEffect } from "react";

export default function OpenDeposit() {
  const { plans, loading, error } = usePlans();
  const { address, chainId } = useWallet();
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

  void navigate; // (dùng ở tươnglai chuyển detail sau khi mined ok — optional)

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16">
      <h1 className="mt-8 text-3xl font-bold">Mở tiết kiệm</h1>
      {error && <div className="card border-err/40 text-err text-sm mt-4">{error}</div>}
      {loading && <div className="text-subtle text-sm mt-4">Đang tải plans…</div>}

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

      {/* ── Form ─── */}
      <div className="card mt-6 max-w-lg mx-auto">
        <label htmlFor="amount-input" className="!text-sm !text-txt">
          Số tiền muốn gửi (USDC)
        </label>
        <input
          id="amount-input"
          className="field"
          inputMode="decimal"
          placeholder="VD: 5000"
          value={amountStr}
          onChange={(e) => setAmountStr(e.target.value)}
          disabled={!plan || !address}
        />
        {balance !== null && amountStr && gpAmount > 0n && (
          <p className="text-xs text-subtle mt-1">Số dư hiện tại: {fmtToken(balance)} USDC</p>
        )}

        {plan && gpAmount > 0n && (
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm bg-bg/60 rounded-xl p-3 border border-line">
            <span className="text-subtle">Lãi dự kiến đủ hạn</span>
            <span className="text-ok text-right font-semibold">
              + {fmtToken(previewInterestOnAmount(gpAmount, plan.tenorDays, plan.aprBps), 4)} USDC
            </span>
            <span className="text-subtle">Phạt nếu rút sớm</span>
            <span className="text-warn text-right">
              − {fmtToken((gpAmount * plan.earlyWithdrawPenaltyBps) / 10_000n, 2)} USDC
            </span>
            <span className="text-subtle">Kỳ hạn</span>
            <span className="text-right">{Number(plan.tenorDays)} ngày</span>
            {amount !== null && (
              <>
                <span className="text-subtle">Ngày đáo hạn (nếu mở ngay bây giờ)</span>
                <span className="text-right">
                  {fmtDate(Date.now() / 1000 + Number(plan.tenorDays) * 86_400)}
                  <span className="text-subtle text-xs"> (ước lượng)</span>
                </span>
              </>
            )}
          </div>
        )}

        {invalidReason && (
          <p className="text-xs text-warn mt-3" role="alert">
            {invalidReason}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-3 justify-end">
          {allowanceReady ? (
            <span className="inline-flex items-center gap-1 text-xs text-ok">
              <CheckCircle2 size={14} /> Đã approve — có thể mở
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
        <p className="text-xs text-subtle mt-2">
          Kết nối chain {chainId === 31337 ? "Hardhat Local" : chainId === 11155111 ? "Sepolia" : "cần là 31337 hoặc 11155111"}.
        </p>
      </div>
    </div>
  );
}
