/**
 * RenewPlanSelect (T6.11) — dropdown chọn plan cho Renew ở DepositDetail,
 * thay ô nhập plan ID thủ công (nguy hiểm gõ nhầm → SC_PlanNotEnabled/SC_NotFound).
 *  - List tất cả plan; plan của deposit hiện tại gắn tag "(plan hiện tại)".
 *  - Trỏ chuột (hoặc ArrowUp/Down bàn phím) vào 1 plan → panel dưới list hiện
 *    thông số: APR · kỳ hạn · tối thiểu/tối đa · phạt rút sớm · ví dụ lãi 1.000 USDC.
 *  - Plan disabled hiển thị mờ + "Tạm ngưng", không chọn được (renew vào plan
 *    disabled revert SC_PlanNotEnabled).
 *  - A11y: role=listbox/option, Esc/Enter/ArrowDown/ArrowUp, click-outside đóng.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown } from "lucide-react";
import { formatBps, fmtToken, previewInterestOnAmount, SCALAR } from "@/lib/format";
import type { PlanRow } from "@/components/PlanCard";

interface Props {
  plans: PlanRow[];
  /** planId của deposit hiện tại (d.planId). */
  currentPlanId: number;
  value: number | null;
  onChange: (planId: number) => void;
  disabled?: boolean;
  plansLoading?: boolean;
}

export default function RenewPlanSelect({
  plans,
  currentPlanId,
  value,
  onChange,
  disabled = false,
  plansLoading = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [previewId, setPreviewId] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = plans.find((p) => p.id === value) ?? null;
  const spec = plans.find((p) => p.id === (previewId ?? value)) ?? null;

  /* Click-outside đóng dropdown */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const onKey = (e: KeyboardEvent) => {
    if (!open) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (plans.length === 0) return;
      const idx = plans.findIndex((p) => p.id === (previewId ?? value));
      const dir = e.key === "ArrowDown" ? 1 : -1;
      const next = plans[(idx + dir + plans.length) % plans.length];
      setPreviewId(next.id);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const pid = plans.find((p) => p.id === (previewId ?? value));
      if (pid && pid.enabled) {
        onChange(pid.id);
        setOpen(false);
      }
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        id="renew-plan"
        className="field text-left flex items-center justify-between gap-2 cursor-pointer !py-2.5"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKey}
      >
        <span className={`truncate ${selected ? "" : "text-muted"}`}>
          {plansLoading && !selected
            ? "Đang tải plans…"
            : selected
              ? `Plan #${selected.id} — ${formatBps(selected.aprBps)} · ${Number(selected.tenorDays)} ngày`
              : "Chọn plan…"}
        </span>
        <ChevronDown
          size={16}
          aria-hidden
          className={`shrink-0 text-subtle transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute z-40 left-0 right-0 mt-1 rounded-lg border border-line bg-card p-1 shadow-lg">
          <ul role="listbox" aria-label="Plan cho Renew" className="max-h-64 overflow-y-auto">
            {plans.map((p) => {
              const isSel = p.id === value;
              return (
                <li
                  key={p.id}
                  role="option"
                  aria-selected={isSel}
                  aria-disabled={!p.enabled}
                  onMouseEnter={() => setPreviewId(p.id)}
                  onMouseLeave={() => setPreviewId(null)}
                  className={`flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm ${
                    p.enabled ? "cursor-pointer hover:bg-panel/70" : "cursor-not-allowed opacity-40"
                  } ${isSel ? "bg-panel/40" : ""}`}
                  onClick={() => {
                    if (!p.enabled) return;
                    onChange(p.id);
                    setOpen(false);
                  }}
                >
                  <span className="truncate">
                    Plan #{p.id}
                    {p.id === currentPlanId && <span className="text-primary"> (plan hiện tại)</span>}
                    {!p.enabled && <span className="text-warn"> · Tạm ngưng</span>}
                  </span>
                  <span className="num text-xs text-subtle whitespace-nowrap">
                    {formatBps(p.aprBps)} · {Number(p.tenorDays)} ngày
                    {isSel && <Check size={14} className="inline ml-1.5 text-primary" aria-hidden />}
                  </span>
                </li>
              );
            })}
          </ul>

          {/* Panel thông số — hover / phím mũi tên để xem chi tiết plan */}
          <div className="border-t border-line mt-1 px-2 pb-1 pt-2">
            {spec ? (
              <>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[11px] uppercase tracking-wider text-subtle">
                    Plan #{spec.id}
                    {spec.id === currentPlanId && (
                      <span className="text-primary normal-case"> · plan hiện tại</span>
                    )}
                  </span>
                  {spec.id !== currentPlanId && <span className="text-[11px] text-muted">plan mới</span>}
                </div>
                <dl className="num grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <div className="flex justify-between gap-2">
                    <dt className="text-subtle">APR</dt>
                    <dd className="text-primary">{formatBps(spec.aprBps)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-subtle">Kỳ hạn</dt>
                    <dd>{Number(spec.tenorDays)} ngày</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-subtle">Tối thiểu</dt>
                    <dd>{spec.minDeposit === 0n ? "—" : `${fmtToken(spec.minDeposit)} USDC`}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-subtle">Tối đa</dt>
                    <dd>{spec.maxDeposit === 0n ? "Không giới hạn" : `${fmtToken(spec.maxDeposit)} USDC`}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-subtle">Phạt rút sớm</dt>
                    <dd className="text-warn">−{formatBps(spec.earlyWithdrawPenaltyBps)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-subtle">Lãi đủ hạn 1.000</dt>
                    <dd className="text-ok">
                      +{fmtToken(previewInterestOnAmount(1_000n * SCALAR, spec.tenorDays, spec.aprBps), 2)} USDC
                    </dd>
                  </div>
                </dl>
              </>
            ) : (
              <p className="text-xs text-subtle">
                Trỏ chuột vào một plan để xem thông số (APR · kỳ hạn · min/max · phạt rút sớm).
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
