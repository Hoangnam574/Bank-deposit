/**
 * PlanCard — thẻ ~thông tin plan (APR, tenor, min/max, penalty) dùng ở Dashboard
 * và OpenDeposit. Variant cá nhân (180d/300bps/450bps) nhấn nổi border vàng.
 */
import { Sparkles } from "lucide-react";
import { formatBps, fmtToken, previewInterestOnAmount, SCALAR } from "@/lib/format";

export interface PlanRow {
  id: number;
  tenorDays: bigint;
  aprBps: bigint;
  minDeposit: bigint;
  maxDeposit: bigint;
  earlyWithdrawPenaltyBps: bigint;
  enabled: boolean;
}

interface Props {
  plan: PlanRow;
  variant?: boolean;
  onSelect?: (plan: PlanRow) => void;
  selected?: boolean;
  compact?: boolean;
}

export default function PlanCard({ plan, variant = false, onSelect, selected = false, compact = false }: Props) {
  const sample = 1_000n * SCALAR; // 1.000 USDC để minh hoạ lãi
  const interest = previewInterestOnAmount(sample, plan.tenorDays, plan.aprBps);

  return (
    <div
      className={`card relative cursor-pointer transition-transform duration-200 hover:-translate-y-0.5 ${
        selected ? "border-primary ring-2 ring-primary/60" : variant ? "border-primary/70" : ""
      }`}
      onClick={() => onSelect?.(plan)}
      onKeyDown={(e) => e.key === "Enter" && onSelect?.(plan)}
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      aria-selected={onSelect ? selected : undefined}
    >
      {variant && (
        <span className="absolute -top-3 left-4 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-bg">
          <Sparkles size={11} /> VARIANT
        </span>
      )}
      <div className="flex items-baseline justify-between">
        <h3 className="text-2xl font-display text-primary">{formatBps(plan.aprBps)}</h3>
        <span className="text-lg">{Number(plan.tenorDays)} ngày</span>
      </div>
      <div className="mt-1 text-xs text-subtle">APR · kỳ hạn</div>

      {!compact && (
        <>
          <dl className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-subtle">Tối thiểu</dt>
              <dd>{plan.maxDeposit === 0n ? "—" : `${fmtToken(plan.minDeposit)} USDC`}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-subtle">Tối đa</dt>
              <dd>{plan.maxDeposit === 0n ? "Không giới hạn" : `${fmtToken(plan.maxDeposit)} USDC`}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-subtle">Phạt rút sớm</dt>
              <dd className="text-warn">{formatBps(plan.earlyWithdrawPenaltyBps)}</dd>
            </div>
          </dl>
          <div className="mt-3 pt-3 border-t border-line text-xs text-subtle">
            Minh hoạ: nạp 1.000 USDC đủ hạn → nhận lãi ~{" "}
            <strong className="text-txt">{fmtToken(interest, 4)} USDC</strong>
          </div>
        </>
      )}

      {!plan.enabled && (
        <div className="mt-3 rounded-lg bg-err/15 border border-err/40 px-2 py-1 text-xs text-err text-center">
          Plan tạm ngưng
        </div>
      )}
    </div>
  );
}
