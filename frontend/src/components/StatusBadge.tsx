/**
 * StatusBadge — trạng thái deposit (`DepositInfo.status` — enum 4 giá trị:
 * Active / Withdrawn / ManualRenewed / AutoRenewed; rút sớm vẫn là Withdrawn):
 *   0 Active → xanh lá; 1 Đã rút; 2 Đã Renew (thủ công); 3 Tự động Renew.
 */
import { useLang, type TKey } from "@/lib/i18n";

const META: Record<number, { key: TKey; cls: string }> = {
  0: { key: "status.active", cls: "bg-ok/15 text-ok border-ok/40" },
  1: { key: "status.withdrawn", cls: "bg-subtle/15 text-subtle border-subtle/40" },
  2: { key: "status.renewed", cls: "bg-secondary/15 text-secondary border-secondary/40" },
  3: { key: "status.autoRenewed", cls: "bg-secondary/15 text-secondary border-secondary/40" },
};

export default function StatusBadge({ status }: { status: number | bigint }) {
  const { t } = useLang();
  const meta = META[Number(status)] ?? { key: "status.unknown" as TKey, cls: "bg-err/15 text-err border-err/40" };
  return (
    <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${meta.cls}`}>
      {t(meta.key)}
    </span>
  );
}
