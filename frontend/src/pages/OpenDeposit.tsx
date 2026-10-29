/**
 * OpenDeposit "/open" (T6.8) — chọn plan → nhập amount (parseUnits 6)
 * → preview lãi + ngày đáo hạn → 1 nút "Mở tiết kiệm":
 *   - chưa đủ allowance → dialog "Cần Approve USDC" (mô tả ERC-20) → approve
 *     mined → TỰ ĐỘNG gọi openDeposit ngay sau đó (1 lần bấm, 2 popup MM);
 *   - đã đủ allowance → mở luôn.
 * Mined ok → dialog thành công 2 lựa chọn: "Xem sổ" (/deposit/:id) hoặc
 * "Về trang chủ" (/). Parse event DepositOpened để lấy depositId mới.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import type { ContractTransactionResponse } from "ethers";
import PlanCard, { type PlanRow } from "@/components/PlanCard";
import { usePlans } from "@/hooks/usePlans";
import { useWallet } from "@/providers/WalletProvider";
import { useSignerContracts, useContractTime } from "@/providers/ContractsProvider";
import { useTx } from "@/hooks/useTx";
import { useConfirm } from "@/components/ConfirmDialog";
import {
  fmtToken,
  parseToken,
  previewInterestOnAmount,
  fmtDate,
  formatBps,
  SCALAR,
} from "@/lib/format";
import { useLang } from "@/lib/i18n";

export default function OpenDeposit() {
  const { plans, loading, error } = usePlans();
  const { address } = useWallet();
  const signerC = useSignerContracts();
  const { daySeconds, yearSeconds } = useContractTime();
  const { run, state } = useTx();
  const confirm = useConfirm();
  const { t } = useLang();
  const [selected, setSelected] = useState<number | null>(null);
  const [amountStr, setAmountStr] = useState("");
  const [balance, setBalance] = useState<bigint | null>(null);
  const navigate = useNavigate();

  const plan = plans.find((p) => p.id === selected) ?? null;
  const amount = useMemo(() => {
    try {
      return amountStr.trim() ? parseToken(amountStr) : null;
    } catch {
      return null;
    }
  }, [amountStr]);

  /* Auto-select plan đề xuất (tenor 180 ngày) ngay khi vào /open —
     form/số tiền bật sẵn, không bắt user bấm chọn plan trước */
  useEffect(() => {
    if (selected !== null || plans.length === 0) return;
    const rec =
      plans.find((p) => Number(p.tenorDays) === 180 && p.enabled) ??
      plans.find((p) => p.enabled);
    if (rec) setSelected(rec.id);
  }, [plans, selected]);

  /* Đọc balance mỗi khi amount/address đổi (refresh sau tx qua state.status) */
  useEffect(() => {
    if (!signerC || !address) return;
    let cancelled = false;
    void (async () => {
      try {
        const bal = (await signerC.usdc.balanceOf(address)) as bigint;
        if (!cancelled) setBalance(bal);
      } catch {
        /* giữ null */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [signerC, address, amountStr, state.status]);

  /* ── Validation ── */
  const gpAmount = amount ?? 0n;
  const valid =
    plan !== null &&
    gpAmount >= (plan.minDeposit || SCALAR) && // min 0视为 bất kỳ
    (plan.maxDeposit === 0n || gpAmount <= plan.maxDeposit) &&
    plan.enabled &&
    balance !== null &&
    balance >= gpAmount;
  const invalidReason = !plan
    ? t("open.reasonNoPlan")
    : !plan.enabled
      ? t("open.reasonPaused")
      : amount === null || gpAmount === 0n
        ? t("open.reasonNoAmount")
        : plan.maxDeposit !== 0n && gpAmount > plan.maxDeposit
          ? t("open.reasonMax", { max: fmtToken(plan.maxDeposit) })
          : gpAmount < (plan.minDeposit || SCALAR)
            ? t("open.reasonMin", { min: fmtToken(plan.minDeposit) })
            : balance !== null && balance < gpAmount
              ? t("open.reasonBalance", { bal: fmtToken(balance) })
              : "";

  /* ── MỞ SỔ — 1 lần bấm: approve (nếu cần) → openDeposit → dialog thành công ── */
  const openDeposit = async (): Promise<void> => {
    if (!signerC || !plan || !amount || !address) return;
    const coreAddr = signerC.savingCoreAddress;

    /* Đọc allowance MỚI ngay lúc bấm (state cũ có thể stale) */
    let allow = 0n;
    try {
      allow = (await signerC.usdc.allowance(address, coreAddr)) as bigint;
    } catch {
      /* đọc lỗi → coi như chưa đủ, hiện dialog approve */
    }

    if (allow < amount) {
      const ok = await confirm({
        title: t("open.approveTitle"),
        message: (
          <>
            {t("open.approve1")} <strong>approve</strong> {t("open.approve2")}{" "}
            <strong className="num">{fmtToken(amount, 2)} USDC</strong> {t("open.approve3")}
            <br />
            {t("open.approve4")} <strong>{t("open.approve5")}</strong>
            {t("open.approve6")}
          </>
        ),
        okLabel: t("open.approveOk"),
      });
      if (!ok) return;
    }

    const iface = signerC.core.interface;
    let newId: number | null = null;
    const hash = await run(t("open.cta"), async () => {
      /* Bước 1 (khi cần): approve — mined xong mới sang bước 2 */
      if (allow < amount) {
        const atx = (await signerC.usdc.approve(coreAddr, amount)) as unknown as ContractTransactionResponse;
        await atx.wait();
      }
      /* Bước 2: mở sổ + parse event DepositOpened để lấy id mới */
      const tx = (await signerC.core.openDeposit(plan.id, amount)) as unknown as ContractTransactionResponse;
      const receipt = await tx.wait();
      for (const log of receipt?.logs ?? []) {
        try {
          const desc = iface.parseLog({ topics: log.topics as string[], data: log.data });
          if (desc?.name === "DepositOpened") newId = Number((desc.args as unknown[])[0]);
        } catch {
          /* log của contract khác — bỏ qua */
        }
      }
      return tx;
    });

    if (!hash || newId === null || newId <= 0) return;

    /* ── Dialog thành công — 2 lựa chọn (Esc/click nền = về trang chủ) ── */
    const goDetail = await confirm({
      title: t("open.successTitle"),
      message: (
        <>
          {t("open.success1")} <strong className="num">#{newId}</strong> {t("open.success2")}{" "}
          <strong className="num">{fmtToken(amount, 2)} USDC</strong> ·{" "}
          <span className="num">{t("detail.days", { d: Number(plan.tenorDays) })}</span> · {t("open.success3")}{" "}
          <span className="num text-primary">{formatBps(plan.aprBps)}</span> {t("open.success4")}{" "}
          <span className="num">{fmtDate(Date.now() / 1000 + Number(plan.tenorDays) * daySeconds)}</span>.
        </>
      ),
      okLabel: t("open.successOk"),
      cancelLabel: t("open.successCancel"),
    });
    if (goDetail) navigate(`/deposit/${newId}`);
    else navigate("/");
  };

  return (
    <main className="mx-auto w-full max-w-[1680px] px-4 sm:px-6 lg:px-10 pb-16">
      <div className="mt-8">
        <span className="eyebrow">{t("open.eyebrow")}</span>
        <h1 className="mt-3 text-4xl font-bold font-display tracking-tight">{t("open.title")}</h1>
      </div>
      {error && <div className="card border-err/40 text-err text-sm mt-4">{error}</div>}
      {loading && (
        <div className="mt-6" role="status" aria-label={t("open.loadingAria")}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="card" aria-hidden>
                <div className="skeleton h-3 w-16" />
                <div className="skeleton mt-3 h-9 w-20" />
                <div className="skeleton mt-2 h-4 w-24" />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mt-6" aria-label={t("open.plansAria")}>
        {/* Chỉ hiện plan đang bật — plan disable không còn là offer (user: "disable thì không hiện plan nữa") */}
        {plans
          .filter((p) => p.enabled)
          .map((p) => (
            <PlanCard
              key={p.id}
              plan={p}
              variant={Number(p.tenorDays) === 180}
              onSelect={(sel: PlanRow) => setSelected(sel.id)}
              selected={selected === p.id}
              compact
            />
          ))}
      </div>

      {/* ── Form + sticky summary (2 cột từ lg) ─── */}
      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_340px] items-start">
        <section className="card order-2 lg:order-1" aria-label={t("open.formAria")}>
          <label htmlFor="amount-input" className="!text-sm !font-semibold !text-txt">
            {t("open.amountLabel")}
          </label>
          <input
            id="amount-input"
            className="field num text-lg"
            inputMode="decimal"
            placeholder={t("open.amountPh")}
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            disabled={!plan || !address}
          />
          {balance !== null && amountStr && gpAmount > 0n && (
            <p className="num text-xs text-subtle mt-1.5">{t("open.balanceNow", { bal: fmtToken(balance) })}</p>
          )}

          {invalidReason && (
            <p className="text-xs text-warn mt-3" role="alert">
              ⚠ {invalidReason}
            </p>
          )}

          {/* Một nút duy nhất — approve (nếu cần) tự chạy trong cùng lần bấm */}
          <div className="mt-5 flex flex-wrap gap-3 justify-end">
            <button
              type="button"
              className="btn btn-cta inline-flex items-center justify-center gap-2"
              onClick={() => void openDeposit()}
              disabled={!valid || state.status === "pending"}
            >
              {state.status === "pending" && <Loader2 className="animate-spin shrink-0" size={16} />}
              <span>{t("open.cta")}</span>
            </button>
          </div>
          <p className="text-[11px] text-subtle mt-2 text-right">
            {state.status === "pending" ? t("open.hintPending") : t("open.hintIdle")}
          </p>
        </section>

        {/* Sticky summary */}
        <aside className="card order-1 lg:order-2 lg:sticky lg:top-24 !border-primary/40" aria-label={t("open.summaryEyebrow")}>
          <span className="eyebrow !border-primary/30 !text-primary">{t("open.summaryEyebrow")}</span>
          {plan && gpAmount > 0n ? (
            <dl className="num mt-4 space-y-2.5 text-sm">
              <div className="flex justify-between items-baseline">
                <dt className="text-subtle">{t("open.sumInterest")}</dt>
                <dd className="num text-ok text-base">
                  +{fmtToken(previewInterestOnAmount(gpAmount, plan.tenorDays, plan.aprBps, BigInt(daySeconds), BigInt(yearSeconds)), 4)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-subtle">{t("open.sumPenalty")}</dt>
                <dd className="text-warn">−{fmtToken((gpAmount * plan.earlyWithdrawPenaltyBps) / 10_000n, 2)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-subtle">{t("open.sumAprTenor")}</dt>
                <dd>
                  {formatBps(plan.aprBps)} · {t("detail.days", { d: Number(plan.tenorDays) })}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-subtle">{t("open.sumMaturity")}</dt>
                <dd className="text-right">
                  {amount !== null ? fmtDate(Date.now() / 1000 + Number(plan.tenorDays) * daySeconds) : "—"}
                </dd>
              </div>
              <div className="pt-3 border-t border-line text-xs text-subtle leading-relaxed">
                {t("open.sumNote")}
              </div>
            </dl>
          ) : (
            <p className="mt-3 text-sm text-subtle leading-relaxed">
              {t("open.sumEmpty")}
            </p>
          )}
        </aside>
      </div>
    </main>
  );
}
