/**
 * MaturityRing (Nice-to-have C-C) — vòng progress quanh số đáo hạn:
 *   pct = (now − startAt) / (maturityAt − startAt) × 100
 * Cùng nguồn dữ liệu với thanh `progress-track` vốn có trên DepositDetail —
 * ring chỉ là phiên bản tròn nhỏ đặt trong InfoBox (không thêm state mới).
 * Màu: yellow (--color-primary) theo tiến độ → green (--color-ok) khi matured.
 */
import type { ReactNode } from "react";

const OK = "#0ecb81";
const PRIMARY = "#fcd535";
const TRACK = "#2b3139";

/** Chu vi vòng tròn với r = 24: 2π × 24 */
const CIRC = 150.796;

interface Props {
  /** 0..100 — % kỳ hạn đã trôi */
  pct: number;
  /** true = đã tới maturityAt */
  matured: boolean;
  /** Nội dung trung tâm (thường là % hoặc số ngày còn lại) */
  center: ReactNode;
}

export default function MaturityRing({ pct, matured, center }: Props) {
  const clamped = Math.max(0, Math.min(100, pct));
  const color = matured ? OK : PRIMARY;
  const offset = CIRC * (1 - clamped / 100);

  return (
    <span className="relative inline-flex shrink-0" aria-hidden>
      <svg width="46" height="46" viewBox="0 0 56 56">
        {/* Track — xoay -90° để cung chạy từ đỉnh (12 giờ) */}
        <circle
          cx="28"
          cy="28"
          r="24"
          fill="none"
          stroke={TRACK}
          strokeWidth="5"
        />
        {clamped > 0 && (
          <circle
            cx="28"
            cy="28"
            r="24"
            fill="none"
            stroke={color}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={offset}
            transform="rotate(-90 28 28)"
            style={{ transition: "stroke-dashoffset 500ms cubic-bezier(0.32, 0.72, 0, 1)" }}
          />
        )}
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center text-[10px] font-medium num"
        style={{ color }}
      >
        {center}
      </span>
    </span>
  );
}
