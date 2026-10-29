/**
 * Countdown (T6.9/T6.13) — đếm ngược tới maturityAt, dùng block.timestamp
 * của node (không treo theo giờ máy — tránh clock lệch). Nhận +1s tick nội bộ.
 */
import { useEffect, useState } from "react";
import { fmtCountdown, fmtDate } from "@/lib/format";
import { useLang } from "@/lib/i18n";
import { useContractTime } from "@/providers/ContractsProvider";

interface Props {
  targetSec: number | bigint;
  nowSec: number; // block.timestamp của node — cập nhật từ fetch dữ liệu
  /** band hiển thị cũng ngày đáo hạn — tất cả chỉ hiển thị prefix ngày/giờ */
  showExact?: boolean;
}

export default function Countdown({ targetSec, nowSec, showExact = true }: Props) {
  const [tick, setTick] = useState(0);
  const { t } = useLang();
  const { daySeconds } = useContractTime();

  useEffect(() => {
    const t2 = window.setInterval(() => setTick((x) => x + 1), 1000);
    return () => window.clearInterval(t2);
  }, []);
  void tick; // chỉ cần render lại theo interval

  const passed = Number(targetSec) <= (nowSec > 0 ? nowSec + tick : nowSec);
  return (
    <span className={passed ? "text-warn" : "text-subtle"}>
      {passed
        ? t("countdown.done")
        : `${fmtCountdown(targetSec, nowSec + tick, daySeconds)}${showExact ? ` · ${fmtDate(targetSec)}` : ""}`}
    </span>
  );
}
