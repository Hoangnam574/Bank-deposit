/**
 * VaultHealthGauge (Nice-to-have C-A) — đồng hồ "độ trả được nợ" của vault:
 *   health = (vault.balance − totalOwedInterest) / vault.balance
 * Khớp trực tiếp logic C2 `VM_Insolvent`: available ≤ 0 → mọi rút/top-up trả
 * lãi trên chain sẽ revert `VM_Insolvent`. Gauge chỉ LÀ HIỂN THỊ cùng nguồn
 * dữ liệu contract (getVaultBalance + totalOwedInterest) — không tự suy đoán.
 */
import { fmtToken } from "@/lib/format";
import { useLang, type TKey } from "@/lib/i18n";

/* Palette theo token DESIGN.md — giữ đúng phẳng (flat), không glow/gradient */
const OK = "#0ecb81";
const WARN = "#f0b90b";
const ERR = "#f6465d";
const TRACK = "#2b3139"; /* --color-line / panel hairline */

/** Độ dài cung bán nguyệt với r = 80: π × 80 */
const ARC_LEN = 251.327;

interface Props {
  balance: bigint | null;
  owed: bigint | null;
}

interface GaugeState {
  pct: number; // 0..100
  color: string;
  label: string;
  sub: string;
}

function stateOf(
  balance: bigint | null,
  owed: bigint | null,
  t: (k: TKey) => string,
): GaugeState {
  if (balance === null || owed === null) {
    return { pct: 0, color: TRACK, label: "…", sub: t("gauge.reading") };
  }
  if (balance === 0n) {
    return {
      pct: 0,
      color: ERR,
      label: "0%",
      sub: t("gauge.empty"),
    };
  }
  const available = balance - owed;
  const pct = available <= 0n ? 0 : Number((available * 100n) / balance);
  if (available <= 0n) {
    return {
      pct: 0,
      color: ERR,
      label: "0%",
      sub: t("gauge.insolvent"),
    };
  }
  if (pct >= 60) {
    return { pct, color: OK, label: `${pct}%`, sub: t("gauge.healthy") };
  }
  if (pct >= 30) {
    return {
      pct,
      color: WARN,
      label: `${pct}%`,
      sub: t("gauge.tight"),
    };
  }
  return {
    pct,
    color: ERR,
    label: `${pct}%`,
    sub: t("gauge.thin"),
  };
}

export default function VaultHealthGauge({ balance, owed }: Props) {
  const { t } = useLang();
  const s = stateOf(balance, owed, t);
  const available = balance !== null && owed !== null ? balance - owed : null;
  /* strokeDashoffset theo chiều dương — pct cao = cung phủ gần hết */
  const offset = ARC_LEN * (1 - s.pct / 100);

  return (
    <div className="flex flex-wrap items-center gap-6">
      {/* Gauge nửa vòng — SVG phẳng, không animation phức tạp */}
      <svg
        width="180"
        height="100"
        viewBox="0 0 200 104"
        role="img"
        aria-label={t("gauge.aria", { label: s.label })}
      >
        <path
          d="M 20 96 A 80 80 0 0 1 180 96"
          fill="none"
          stroke={TRACK}
          strokeWidth="14"
          strokeLinecap="round"
        />
        {s.pct > 0 && (
          <path
            d="M 20 96 A 80 80 0 0 1 180 96"
            fill="none"
            stroke={s.color}
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray={ARC_LEN}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 500ms cubic-bezier(0.32, 0.72, 0, 1)" }}
          />
        )}
        <text
          x="100"
          y="88"
          textAnchor="middle"
          fill={s.color}
          fontSize="26"
          fontWeight="700"
          fontFamily="var(--font-mono)"
        >
          {s.label}
        </text>
      </svg>

      <div className="min-w-52 flex-1">
        <div className="text-sm font-medium" style={{ color: s.color }}>
          {s.sub}
        </div>
        {/* 3 số liệu gốc — đúng nguồn contract, không phóng đại */}
        <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
          <div>
            <dt className="text-xs text-subtle">{t("gauge.balance")}</dt>
            <dd className="num mt-0.5">{balance !== null ? fmtToken(balance, 2) : "…"}</dd>
          </div>
          <div>
            <dt className="text-xs text-subtle">{t("gauge.owed")}</dt>
            <dd className="num mt-0.5 text-warn">{owed !== null ? fmtToken(owed, 2) : "…"}</dd>
          </div>
          <div>
            <dt className="text-xs text-subtle">{t("gauge.available")}</dt>
            <dd
              className={`num mt-0.5 ${
                available !== null && available < 0n ? "text-err" : "text-ok"
              }`}
            >
              {available !== null ? fmtToken(available, 2) : "…"}
            </dd>
          </div>
        </dl>
        <p className="text-xs text-subtle mt-3">
          {t("gauge.note")} <strong className="num">{t("gauge.noteStrong")}</strong>.{" "}
          {t("gauge.note2")}
        </p>
      </div>
    </div>
  );
}
