/**
 * lib/format.ts — format tiền (USDC 6 decimals — KHÔNG 1e18),
 * thời gian đáo hạn, và mapping custom error → message thân thiện.
 * Chuỗi UI lấy từ i18n (rawT) — logic số/thời gian giữ nguyên.
 */
import { rawT, getLang, type TKey } from "@/lib/i18n";

/* ───────────────────────── Rough xc token config ───────────── */
export const DECIMALS = 6;
export const SCALAR = 1_000_000n; // 10^6 — USDC thật cũng 6 decimals
export const SECONDS_PER_YEAR = 31_536_000n; // 365 * 86400

/* ─────────────── Bigint → chuỗi dễ đọc (dù dùng USDC 6d) ─────── */
export function fmtToken(units: bigint, maxDp = 6): string {
  if (units < 0n) return "-" + fmtToken(-units, maxDp);
  const int = units / SCALAR;
  const frac = units % SCALAR;
  const fracStr = frac
    .toString()
    .padStart(DECIMALS, "0")
    .slice(0, Math.max(0, maxDp))
    .replace(/0+$/, "");
  const intStr = int.toLocaleString("en-US");
  return fracStr ? `${intStr}.${fracStr}` : intStr;
}

/** Format số tiền hiển thị đúng số chữ số thập phân (không cắt bỏ số 0 ở cuối), mặc định 6 số lẻ */
export function fmtTokenFixed(units: bigint, dp = 6): string {
  if (units < 0n) return "-" + fmtTokenFixed(-units, dp);
  const int = units / SCALAR;
  const frac = units % SCALAR;
  const fracStr = frac
    .toString()
    .padStart(DECIMALS, "0")
    .slice(0, dp);
  const intStr = int.toLocaleString("en-US");
  return `${intStr}.${fracStr}`;
}

/** Lượng → bigint với tối đa 6 decimals — dùng khi user nhập */
export function parseToken(input: string): bigint {
  if (!/^[0-9]+(\.[0-9]+)?$/.test(input)) throw new Error(rawT("err.amountInvalid"));
  const [intPart, fracPart = ""] = input.split(".");
  if (fracPart.length > DECIMALS) throw new Error(rawT("err.decimals", { n: DECIMALS }));
  const fracPadded = fracPart.padEnd(DECIMALS, "0").slice(0, DECIMALS);
  return BigInt(intPart || "0") * SCALAR + BigInt(fracPadded || "0");
}

/** Lãi dự kiến — multiply-before-divide (D9 dust), nguyên bản từ doanh nghiệp */
export function previewInterestOnAmount(
  principal: bigint,
  tenorDays: bigint,
  aprBps: bigint,
  daySeconds: bigint = 86_400n,
  yearSeconds: bigint = SECONDS_PER_YEAR,
): bigint {
  const seconds = tenorDays * daySeconds;
  return (principal * seconds * aprBps) / (10_000n * yearSeconds);
}

/** Tính chênh lệch lãi tăng/giảm cho phần nạp thêm hoặc rút một phần (weighted time accrual) */
export function computeChunkDeltaInterest(
  amount: bigint,
  remainingSeconds: bigint | number,
  aprBps: bigint | number,
  yearSeconds: bigint | number = SECONDS_PER_YEAR,
): bigint {
  const rem = BigInt(remainingSeconds);
  if (rem <= 0n || amount <= 0n) return 0n;
  const apr = BigInt(aprBps);
  const ys = BigInt(yearSeconds);
  return (amount * rem * apr) / (10_000n * ys);
}

/** Với deposit có sẵn — kiểu lãi đã tính chính xác muốn headers theo previewExit từ SC */
export function formatBps(bps: number | bigint): string {
  const v = Number(bps);
  return v % 100 === 0 ? `${v / 100}%` : `${(v / 100).toFixed(2)}%`;
}

/* ───────────────────── Thời gian + đếm ngược ─────────────── */
export function fmtDate(unixSeconds: number | bigint): string {
  const ts = Number(unixSeconds) * 1000;
  return new Date(ts).toLocaleString(getLang() === "en" ? "en-US" : "vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Đếm ngược dạng "3 ngày 7 giờ"; nếu passed thì "Hết hạn" (theo ngôn ngữ hiện tại) */
export function fmtCountdown(targetSec: number | bigint, nowSec: number, daySeconds = 86_400): string {
  const delta = Number(targetSec) - nowSec;
  if (delta <= 0) return rawT("countdown.expired");
  if (delta < 60) return rawT("countdown.sec", { s: delta });
  const d = Math.floor(delta / daySeconds);
  const h = Math.floor((delta % daySeconds) / 3600);
  const m = Math.floor((delta % 3600) / 60);
  const s = delta % 60;
  if (d > 0) return rawT("countdown.dh", { d, h });
  if (h > 0) return rawT("countdown.hm", { h, m });
  return rawT("countdown.ms", { m, s });
}

/** Địa chỉ rút gọn 0x12ab…cdef */
export function shortAddress(addr: string): string {
  return addr.length <= 12 ? addr : `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/** chainId từ chuỗi hex mà MetaMask trả về — "0xaa36a7" → 11155111 */
export function hexToChainId(hexLike: string | null | undefined): number | null {
  if (!hexLike) return null;
  try {
    return Number(BigInt(hexLike).toString(10));
  } catch {
    return Number(hexLike);
  }
}

/* ───────────────── Custom error → thứ user hiểu ─────────────── */
const ERROR_KEYS: Record<string, TKey> = {
  VM_ZeroAmount: "err.VM_ZeroAmount",
  VM_ZeroAddress: "err.VM_ZeroAddress",
  VM_InsufficientBalance: "err.VM_InsufficientBalance",
  VM_Insolvent: "err.VM_Insolvent",
  VM_NotSavingCore: "err.VM_NotSavingCore",
  SC_UnknownPlan: "err.SC_UnknownPlan",
  SC_PlanNotEnabled: "err.SC_PlanNotEnabled",
  SC_InvalidPlan: "err.SC_InvalidPlan",
  SC_AmountOutOfRange: "err.SC_AmountOutOfRange",
  SC_DepositUnknown: "err.SC_DepositUnknown",
  SC_DepositNotOwner: "err.SC_DepositNotOwner",
  SC_DepositNotActive: "err.SC_DepositNotActive",
  SC_TooEarly: "err.SC_TooEarly",
  SC_TooLate: "err.SC_TooLate",
  SC_InvalidTopUpAmount: "err.SC_InvalidTopUpAmount",
  SC_InvalidPartialAmount: "err.SC_InvalidPartialAmount",
  SC_MaxPrincipalExceeded: "err.SC_MaxPrincipalExceeded",
  SC_EmergencyLocked: "err.SC_EmergencyLocked",
  SC_NothingPending: "err.SC_NothingPending",
  ERC20: "err.ERC20",
};

/** Trích message thân thiện từ revert / reject MetaMask */
export function mapContractError(err: unknown): string | null {
  if (typeof err !== "object" || err === null) return null;
  const any = err as { info?: { error?: { message?: string } }; message?: string; reason?: string; shortMessage?: string };
  const text = any.info?.error?.message ?? any.shortMessage ?? any.message ?? "";
  const customName = text.match(/\b((?:SC|VM|ERC20)_[A-Za-z]+)\b/);
  if (customName && customName[1]) {
    const key = ERROR_KEYS[customName[1]];
    return key ? rawT(key) : customName[1];
  }
  if (/user rejected/i.test(text)) return rawT("err.userRejected");
  if (any.reason) {
    const key = ERROR_KEYS[any.reason];
    return key ? rawT(key) : any.reason;
  }
  return null;
}
