/**
 * InterestTicker (Nice-to-have C-B) — lãi tích luỹ nhảy theo giây.
 * Nguồn sự thật là `baseInterest` (pv.interest từ previewExit trên chain tại
 * thời điểm fetch). Ticker cộng dồn display-side theo rate/second, cùng hệ số
 * với previewInterestOnAmount (format.ts, D9 dust multiply-before-divide):
 *   rate = principal × aprBps / (10_000 × SECONDS_PER_YEAR)   [units/giây]
 * Rate tính bằng bigint quanta (×1e6 cổ phần) để không bị truncate về 0 với
 * principal nhỏ (vd: 100 USDC @ 250bps chỉ tạo ~0.079 units/giây), rồi floor
 * về nguyên units khi hiển thị — khớp semantics chia-đứng-trước của on-chain,
 * không dùng float accumulator (tránh sai lệch đơn vị USDC ×1e6).
 */

import { useEffect, useState } from "react";
import { fmtToken, SECONDS_PER_YEAR } from "@/lib/format";

interface Props {
  /** Lãi đã tích luỹ tính tới thời điểm fetch (pv.interest — bigint units) */
  baseInterest: bigint;
  /** Principal hiện tại của deposit (bigint units) */
  principal: bigint;
  /** APR snapshot tại thời điểm mở (bps) */
  aprBps: bigint;
  /** true = deposit Active và chưa matured → tick; false = hiển thị tĩnh */
  ticking: boolean;
}

export default function InterestTicker({ baseInterest, principal, aprBps, ticking }: Props) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!ticking) return;
    const t = window.setInterval(() => setTick((x) => x + 1), 1000);
    return () => window.clearInterval(t);
  }, [ticking]);

  /* Rate units/giây ở dải quanta ×1e6 — nguyên bigint, cùng công thức on-chain */
  const QUANTA = 1_000_000n; // 10^6 phần quang cho mỗi nguyên unit
  const rateQuantaPerSec =
    (principal * aprBps * QUANTA) / (10_000n * SECONDS_PER_YEAR);

  /* Giá trị hiển thị: base (chain) + rate × số giây trôi từ lúc fetch — floor
     giống multiply-before-divide của previewInterestOnAmount (không làm tròn lên) */
  const accruedUnits =
    baseInterest + (ticking ? (rateQuantaPerSec * BigInt(tick)) / QUANTA : 0n);
  const perDayUnits = (rateQuantaPerSec * 86_400n) / QUANTA;

  return (
    <span className="inline-flex flex-col">
      <span className="num text-lg text-ok" aria-live="off">
        {ticking ? "+" : ""}
        {fmtToken(accruedUnits, 6)}
      </span>
      {ticking && (
        <span className="text-[11px] text-subtle font-normal mt-0.5">
          ≈ {fmtToken(perDayUnits, 4)} USDC/ngày · nhảy theo giây (display)
        </span>
      )}
    </span>
  );
}
