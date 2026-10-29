/**
 * InterestTicker (Nice-to-have C-B) — "Lãi dự kiến khi đáo hạn".
 *
 * Nguồn sự thật: `baseInterest` = pv.interest (previewExit) — lãi contract
 * sẽ trả khi rút ĐÚNG hạn (D9: principal × tenorSeconds × aprBps / (YEAR × 1e4)).
 * Giá trị này là HẰNG SỐ tính từ lúc mở (không tăng theo block/giây): rút sớm
 * nhận 0 lãi (chỉ principal − penalty), nên "lãi tích luỹ theo thời gian"
 * KHÔNG TỒN TẠI trên chain — UI không tự mô phỏng con số đó.
 * Giá trị chỉ thay đổi khi top-up (D4 subtract remaining) / renew đổi
 * principalSeconds — tức sau một tx → block mới; DepositDetail poll
 * blockNumber mỗi ~4s để refetch, nhờ đó số cập nhật theo block mà không
 * phụ thuộc đồng hồ client.
 *
 * Cả hai dòng đều hiển thị ở đơn vị USDC:
 *   dòng chính  = lãi dự kiến đáo hạn (USDC)
 *   dòng phụ    = tốc độ ≈ X USDC/ngày (rate = principal×apr / (1e4×YEAR) / 86400)
 * Rate dùng bigint quanta (×1e6) cùng hệ số previewInterestOnAmount
 * (format.ts) — floor như multiply-before-divide, không float accumulator.
 */

import { fmtToken } from "@/lib/format";
import { useLang } from "@/lib/i18n";
import { useContractTime } from "@/providers/ContractsProvider";

interface Props {
  /** Lãi dự kiến khi đáo hạn (pv.interest — bigint units, ×1e6 USDC) */
  baseInterest: bigint;
  /** Principal hiện tại của deposit (bigint units) */
  principal: bigint;
  /** APR snapshot tại thời điểm mở (bps) */
  aprBps: bigint;
  /** true = deposit Active và chưa matured → hiển thị dòng tốc độ/ngày */
  ticking: boolean;
}

export default function InterestTicker({ baseInterest, principal, aprBps, ticking }: Props) {
  const { t } = useLang();
  const { daySeconds, yearSeconds } = useContractTime();

  /* Rate units/giây ở dải quanta ×1e6 — nguyên bigint, cùng công thức on-chain */
  const QUANTA = 1_000_000n; // 10^6 phần quanta cho mỗi nguyên unit
  const rateQuantaPerSec =
    (principal * aprBps * QUANTA) / (10_000n * BigInt(yearSeconds));
  const perDayUnits = (rateQuantaPerSec * BigInt(daySeconds)) / QUANTA;

  return (
    <span className="inline-flex flex-col">
      <span className="num text-lg text-ok" aria-live="polite">
        {fmtToken(baseInterest, 6)} USDC
      </span>
      {ticking && (
        <span className="text-[11px] text-subtle font-normal mt-0.5">
          ≈ {fmtToken(perDayUnits, 4)} {t("ticker.perDay")}
        </span>
      )}
    </span>
  );
}
