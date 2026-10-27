/**
 * InterestTicker (Nice-to-have C-B) — lãi tích luỹ nhảy theo giây.
 * Nguồn sự thật là `baseInterest` (pv.interest từ previewExit trên chain tại
 * thời điểm fetch). Ticker cộng dồn display-side theo rate/second:
 *   rate = principal × aprBps / (10_000 × SECONDS_PER_YEAR)
 * — cùng hệ số với previewInterestOnAmount (format.ts, D9 dust) nhưng dùng
 * accumulator float phía display để không bị bigint-truncate về 0 với
 * principal nhỏ (vd: 100 USDC @ 8% APR chỉ tạo ~0.25 units/giây).
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

  /* Rate USDC/giây — float precision an toàn trong range USDC (~≤ 1e13 units) */
  const rateUsdcPerSec = (Number(principal) * Number(aprBps)) / (10_000 * Number(SECONDS_PER_YEAR));
  const rateUnits = BigInt(Math.round(rateUsdcPerSec * 1e6)); // về units bigint để fmtToken

  /* Giá trị hiển thị: base (chain) + rate × số giây trôi từ lúc fetch */
  const accruedUnits =
    baseInterest + (ticking ? rateUnits * BigInt(tick) : 0n);
  const perDayUnits = rateUnits * 86_400n;

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
