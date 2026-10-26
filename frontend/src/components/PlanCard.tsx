/**
 * PlanCard v3 — thẻ plan dùng ở Dashboard (bento) và OpenDeposit (compact).
 * Hairline viền; hover = tint viền gold + bóng (không translate-y — GPU-safe);
 * press physics scale(0.985); hỗ trợ Enter + Space; số dùng .num (tabular).
 */
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
  /** compact: thu gọn form OpenDeposit (Dashboard dùng bản đầy đủ) */
  compact?: boolean;
}

export default function PlanCard({ plan, variant = false, onSelect, selected = false, compact = false }: Props) {
  const sample = 1_000n * SCALAR; // ví dụ 1.000 USDC để minh hoạ lãi
  const interest = previewInterestOnAmount(sample, plan.tenorDays, plan.aprBps);

  return (
    <div
      className={`card card-int relative ${
        selected ? "!border-primary ring-2 ring-primary/60" : variant ? "!border-primary/50" : ""
      }`}
      onClick={() => onSelect?.(plan)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect?.(plan);
        }
      }}
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      aria-selected={onSelect ? selected : undefined}
    >
      {/* Eyebrow tag — micro badge thay pill "New" generic (redesign audit) */}
      <div className="flex items-center justify-between">
        <span className="eyebrow">Plan {variant ? "variant" : `#${plan.id}`}</span>
        {variant && <span className="text-xs text-secondary font-semibold">Đề xuất</span>}
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="num text-4xl font-display font-bold text-primary glow-num">{formatBps(plan.aprBps)}</span>
        <span className="text-sm text-subtle">APR</span>
      </div>
      <div className="num mt-1 text-lg">{Number(plan.tenorDays)} ngày kỳ hạn</div>

      {!compact && (
        <>
          <dl className="num mt-4 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-subtle">Tối thiểu</dt>
              <dd>{plan.minDeposit === 0n ? "—" : `${fmtToken(plan.minDeposit)} USDC`}</dd>
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
          <div className="mt-4 pt-3 border-t border-white/5 text-xs text-subtle">
            Ví dụ: gửi {fmtToken(sample)} USDC đủ hạn → nhận lãi ~{" "}
            <strong className="num text-txt">{fmtToken(interest, 4)} USDC</strong>
          </div>
        </>
      )}

      {!plan.enabled && (
        <div className="mt-3 rounded-md bg-err/15 border border-err/40 px-2 py-1 text-xs text-err text-center">
          Plan tạm ngưng
        </div>
      )}
    </div>
  );
}
