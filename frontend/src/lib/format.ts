/**
 * lib/format.ts — format tiền (USDC 6 decimals — KHÔNG 1e18, D-1 của đề),
 * thời gian đáo hạn, và mapping custom error → message thân thiện (T6.6/T6.13).
 */

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

/** Lượng → bigint với tối đa 6 decimals — dùng khi user nhập */
export function parseToken(input: string): bigint {
  if (!/^[0-9]+(\.[0-9]+)?$/.test(input)) throw new Error("Số tiền không hợp lệ");
  const [intPart, fracPart = ""] = input.split(".");
  if (fracPart.length > DECIMALS) throw new Error(`Tối đa ${DECIMALS} chữ số thập phân`);
  const fracPadded = fracPart.padEnd(DECIMALS, "0").slice(0, DECIMALS);
  return BigInt(intPart || "0") * SCALAR + BigInt(fracPadded || "0");
}

/** Lãi dự kiến — multiply-before-divide (D9 dust), nguyên bản từ doanh nghiệp */
export function previewInterestOnAmount(principal: bigint, tenorDays: bigint, aprBps: bigint): bigint {
  const seconds = tenorDays * 86_400n;
  return (principal * seconds * aprBps) / (10_000n * SECONDS_PER_YEAR);
}

/** Với deposit có sẵn — kiểu lãi đã tính chính xác muốn headers theo previewExit từ SC */
export function formatBps(bps: number | bigint): string {
  const v = Number(bps);
  return v % 100 === 0 ? `${v / 100}%` : `${(v / 100).toFixed(2)}%`;
}

/* ───────────────────── Thời gian + đếm ngược ─────────────── */
export function fmtDate(unixSeconds: number | bigint): string {
  const ts = Number(unixSeconds) * 1000;
  return new Date(ts).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Đếm ngược dạng "3g 7p 12s"; nếu passed thì "Hết hạn" hoặc "Quá hạn" */
export function fmtCountdown(targetSec: number | bigint, nowSec: number): string {
  const delta = Number(targetSec) - nowSec;
  if (delta <= 0) return "Hết hạn";
  const d = Math.floor(delta / 86_400);
  const h = Math.floor((delta % 86_400) / 3600);
  const m = Math.floor((delta % 3600) / 60);
  const s = delta % 60;
  if (d > 0) return `${d} ngày ${h} giờ`;
  if (h > 0) return `${h} giờ ${m} phút`;
  return `${m} phút ${s} giây`;
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

/* ───────────────── Custom error → thứ user hiểu (T6.6) ─────────────── */
const ERRORS: Record<string, string> = {
  VM_ZeroAmount: "Số lượng phải > 0",
  VM_ZeroAddress: "Địa chỉ không hợp lệ (0x0)",
  VM_InsufficientBalance: "Vault không đủ USDC để trả lãi — thử lại sau",
  VM_Insolvent: "Rút sẽ làm vault thiếu tiền cam kết cho deposit đang Active",
  VM_NotSavingCore: "Chỉ SavingCore được gọi hàm này",
  SC_UnknownPlan: "Plan không tồn tại",
  SC_PlanNotEnabled: "Plan này tạm ngưng — không thể mở/renew vào plan",
  SC_InvalidPlan: "Tham số plan không hợp lệ",
  SC_AmountOutOfRange: "Số tiền ngoài khoảng min/max của plan",
  SC_DepositUnknown: "Deposit không tồn tại",
  SC_DepositNotOwner: "Bạn không phải chủ deposit này",
  SC_DepositNotActive: "Deposit đã đóng (rút/renew rồi)",
  SC_TooEarly: "Chưa tới hạn rút — chờ tới maturity, bot sẽ tự động renew nếu bạn bỏ qua",
  SC_TooLate: "Deposit đã quá grace period — bot cần time để auto-renew, rút sẽ tự động",
  SC_InvalidTopUpAmount: "Số top-up không hợp lệ",
  SC_InvalidPartialAmount: "Số rút một phần không hợp lệ — phải thấp hơn tổng principal",
  SC_MaxPrincipalExceeded: "Tổng principal vượt MAX_PRINCIPAL của hợp đồng",
  SC_EmergencyLocked: "Pause mới < 7 ngày — chưa được rút khẩn cấp",
  SC_NothingPending: "Không có lãi nào pending để claim",
  ERC20: "Token transfer bị lỗi — check allowance",
};

/** Trích message thân thiện từ revert / reject MetaMask */
export function mapContractError(err: unknown): string | null {
  if (typeof err !== "object" || err === null) return null;
  const any = err as { info?: { error?: { message?: string } }; message?: string; reason?: string; shortMessage?: string };
  const text = any.info?.error?.message ?? any.shortMessage ?? any.message ?? "";
  const customName = text.match(/\b((?:SC|VM|ERC20)_[A-Za-z]+)\b/);
  if (customName && customName[1]) return ERRORS[customName[1]] ?? customName[1];
  if (/user rejected/i.test(text)) return "Bạn đã từ chối giao dịch trong ví";
  if (any.reason) return ERRORS[any.reason] ?? any.reason;
  return null;
}
