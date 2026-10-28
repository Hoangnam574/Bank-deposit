/**
 * Dashboard "/" (v3) — hero với eyebrow tag + macro-whitespace, plans dạng
 * bento bất đối xứng (variant chiếm 2 cột + filler CTA lấp hole — high-end §3B),
 * skeleton loaders khi fetch. Variant AT190234: APR 300 bps · tenor 180 ngày ·
 * grace 3 ngày · penalty 450 bps.
 */
import { Link } from "react-router-dom";
import { ShieldCheck, AlertTriangle, ArrowRight } from "lucide-react";
import PlanCard from "@/components/PlanCard";
import NoDeploymentState from "@/components/NoDeploymentState";
import { SkeletonGrid } from "@/components/Skeleton";
import { usePlans } from "@/hooks/usePlans";
import { useWallet } from "@/providers/WalletProvider";
import { useContracts } from "@/providers/ContractsProvider";
import { formatBps } from "@/lib/format";
import { useLang } from "@/lib/i18n";

/** APR bps → % nhãn ngắn */
const fmtBpsLocal = (bps: bigint) => formatBps(bps);

export default function Dashboard() {
  const { plans, loading, error } = usePlans();
  const { contracts } = useContracts();
  const { address } = useWallet();
  const { t } = useLang();
  const variantPlan = plans.find((p) => Number(p.tenorDays) === 180);

  if (!contracts) {
    /* chain chưa deploy — hướng dẫn action thay vì "plan rỗng" gây hiểu nhầm */
    return (
      <main className="mx-auto w-full max-w-[1680px] px-4 sm:px-6 lg:px-10 pb-16">
        <NoDeploymentState page={t("dash.title")} />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[1680px] px-4 sm:px-6 lg:px-10 pb-16">
      {/* ── Hero: eyebrow + macro-whitespace ─── */}
      <section className="mt-4 rounded-xl border border-line band px-6 py-12 sm:px-10 sm:py-14">
        <span className="eyebrow">{t("dash.eyebrow")}</span>
        <h1 className="mt-4 text-4xl sm:text-5xl font-bold font-display tracking-tight">
          {t("dash.title")}
          <span className="text-primary"> USDC</span>
        </h1>
        <p className="balance-text mt-4 text-subtle max-w-2xl leading-relaxed">
          {t("dash.body1")} <strong className="text-txt">{t("dash.bodyStrong")}</strong>
          {t("dash.body2")} <strong className="text-primary">{t("dash.bodyGrace")}</strong>
          {t("dash.body3")} <strong className="text-secondary">{t("dash.body4")}</strong> {t("dash.body5")}
        </p>
        <div className="mt-5 flex flex-wrap gap-4 text-xs text-subtle">
          <span className="inline-flex items-center gap-1">
            <ShieldCheck size={14} className="text-ok" /> {t("dash.chip1")}
          </span>
          <span className="inline-flex items-center gap-1">
            <AlertTriangle size={14} className="text-warn" /> {t("dash.chip2")}
          </span>
        </div>
        {/* CTA chính — button-in-button trailing icon */}
        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            to="/open"
            className="group btn btn-cta inline-flex items-center gap-2 cursor-pointer px-6"
          >
            {t("dash.cta")}
            <span className="grid place-items-center w-6 h-6 rounded-full bg-black/25 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:scale-105">
              <ArrowRight size={13} />
            </span>
          </Link>
          <Link to="/deposits" className="btn btn-outline cursor-pointer">
            {t("dash.ctaView")}
          </Link>
        </div>
      </section>

      {!address && (
        <div className="mt-6 card text-sm">
          {t("dash.connectHint")} <code className="text-primary">{t("dash.connectHintCode")}</code>{" "}
          {t("dash.connectHint2")}
        </div>
      )}

      {/* ── Plans: bento bất đối xứng ─── */}
      <section aria-label={t("dash.plansAria")} className="mt-10">
        <div className="flex items-end justify-between mb-5">
          <div>
            <span className="eyebrow">{t("dash.plansEyebrow")}</span>
            <h2 className="mt-2 font-display text-2xl tracking-tight">{t("dash.plansTitle")}</h2>
          </div>
          {variantPlan && (
            <span className="num hidden sm:block text-xs text-subtle">
              {t("dash.recommendedNote", {
                d: Number(variantPlan.tenorDays),
                apr: fmtBpsLocal(variantPlan.aprBps),
              })}
            </span>
          )}
        </div>
        {error && <div className="card border-err/40 text-err text-sm mb-4">{error}</div>}
        {loading && <SkeletonGrid count={4} />}
        {!loading && !error && plans.length === 0 && (
          <div className="card text-sm text-subtle border-dashed !border-line">
            {t("dash.plansEmpty")} <code className="text-primary">npm run seed</code>.
          </div>
        )}
        {!loading && plans.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {plans
              .filter((p) => p.enabled)
              .map((p) => (
                <div key={p.id} className={variantPlan?.id === p.id ? "sm:col-span-2" : undefined}>
                  <PlanCard plan={p} variant={variantPlan?.id === p.id} />
                </div>
              ))}
            {/* Filler CTA — lấp hole của bento */}
            <div className="sm:col-span-2 lg:col-span-3">
              <div className="card card-int h-full flex flex-wrap items-center justify-between gap-3 border-dashed !border-line">
                <p className="text-sm text-subtle">{t("dash.filler")}</p>
                <Link
                  to="/open"
                  className="group btn btn-outline inline-flex items-center gap-2 shrink-0"
                >
                  {t("dash.fillerCta")}
                  <span className="grid place-items-center w-6 h-6 rounded-full bg-panel transition-transform duration-200 group-hover:translate-x-0.5">
                    <ArrowRight size={13} />
                  </span>
                </Link>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
