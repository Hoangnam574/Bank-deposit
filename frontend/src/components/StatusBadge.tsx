/**
 * StatusBadge — trạng thái deposit (`DepositInfo.status` — enum 4 giá trị:
 * Active / Withdrawn / ManualRenewed / AutoRenewed; rút sớm vẫn là Withdrawn):
 *   0 Active → xanh lá; 1 Đã rút; 2 Đã Renew (thủ công); 3 Tự động Renew.
 */
const META: Record<number, { label: string; cls: string }> = {
  0: { label: "Active", cls: "bg-ok/15 text-ok border-ok/40" },
  1: { label: "Đã rút", cls: "bg-subtle/15 text-subtle border-subtle/40" },
  2: { label: "Đã Renew", cls: "bg-secondary/15 text-secondary border-secondary/40" },
  3: { label: "Tự động Renew", cls: "bg-secondary/15 text-secondary border-secondary/40" },
};

export default function StatusBadge({ status }: { status: number | bigint }) {
  const meta = META[Number(status)] ?? { label: "Unknown", cls: "bg-err/15 text-err border-err/40" };
  return (
    <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${meta.cls}`}>
      {meta.label}
    </span>
  );
}
