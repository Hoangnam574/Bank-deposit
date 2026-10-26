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

/** APR bps → % nhãn ngắn */
const fmtBpsLocal = (bps: bigint) => formatBps(bps);

export default function Dashboard() {
  const { plans, loading, error } = usePlans();
  const { contracts } = useContracts();
  const { address } = useWallet();
  const variantPlan = plans.find((p) => Number(p.tenorDays) === 180);

  if (!contracts) {
    /* chain chưa deploy — hướng dẫn action thay vì "plan rỗng" gây hiểu nhầm */
    return (
      <main className="mx-auto w-full max-w-[1680px] px-4 sm:px-6 lg:px-10 pb-16">
        <NoDeploymentState page="Dashboard" />
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[1680px] px-4 sm:px-6 lg:px-10 pb-16">
      {/* ── Hero: eyebrow + macro-whitespace (high-end §4C) ─── */}
      <section className="mt-4 rounded-xl border border-line band px-6 py-12 sm:px-10 sm:py-14">
        <span className="eyebrow">Vault NFT receipt · compound lãi/second</span>
        <h1 className="mt-4 text-4xl sm:text-5xl font-bold font-display tracking-tight">
          Tiết kiệm có kỳ hạn
          <span className="text-primary"> USDC</span>
        </h1>
        <p className="balance-text mt-4 text-subtle max-w-2xl leading-relaxed">
          Gửi USDC, nhận <strong className="text-txt">chứng nhận NFT</strong>, lãi tính theo giây (APR khóa tại
          thời điểm mở). Rút đúng hạn nhận full lãi; rút sớm bị phạt. Sau grace period{" "}
          <strong className="text-primary">+3 ngày</strong>, bot sẽ{" "}
          <strong className="text-secondary">tự động renew</strong> giữ nguyên APR.
        </p>
        <div className="mt-5 flex flex-wrap gap-4 text-xs text-subtle">
          <span className="inline-flex items-center gap-1">
            <ShieldCheck size={14} className="text-ok" /> NFT là "sổ tiết kiệm" — rút/renew theo chủ NFT
          </span>
          <span className="inline-flex items-center gap-1">
            <AlertTriangle size={14} className="text-warn" /> Contract demo · MockUSDC 6 decimals như USDC thật
          </span>
        </div>
        {/* CTA chính — button-in-button trailing icon (high-end §4B) */}
        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            to="/open"
            className="group btn btn-cta inline-flex items-center gap-2 cursor-pointer px-6"
          >
            Mở tiết kiệm
            <span className="grid place-items-center w-6 h-6 rounded-full bg-black/25 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:scale-105">
              <ArrowRight size={13} />
            </span>
          </Link>
          <Link to="/deposits" className="btn btn-outline cursor-pointer">
            Xem sổ tiết kiệm
          </Link>
        </div>
      </section>

      {!address && (
        <div className="mt-6 card text-sm">
          Kết nối ví ở navbar để xem số dư và mở deposit — hoặc nhấn{" "}
          <code className="text-primary">Faucet 1k</code> sau khi connect.
        </div>
      )}

      {/* ── Plans: bento bất đối xứng ─── */}
      <section aria-label="Các kế hoạch tiết kiệm" className="mt-10">
        <div className="flex items-end justify-between mb-5">
          <div>
            <span className="eyebrow">Plans on-chain</span>
            <h2 className="mt-2 font-display text-2xl tracking-tight">Kế hoạch gửi</h2>
          </div>
          {variantPlan && (
            <span className="num hidden sm:block text-xs text-subtle">
              Đề xuất: tenor {Number(variantPlan.tenorDays)} ngày · APR {fmtBpsLocal(variantPlan.aprBps)}
            </span>
          )}
        </div>
        {error && <div className="card border-err/40 text-err text-sm mb-4">{error}</div>}
        {loading && <SkeletonGrid count={4} />}
        {!loading && !error && plans.length === 0 && (
          <div className="card text-sm text-subtle border-dashed !border-line">
            Chưa có plan nào — admin cần chạy <code className="text-primary">npm run seed</code>.
          </div>
        )}
        {!loading && plans.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {plans.map((p) => (
              <div key={p.id} className={variantPlan?.id === p.id ? "sm:col-span-2" : undefined}>
                <PlanCard plan={p} variant={variantPlan?.id === p.id} />
              </div>
            ))}
            {/* Filler CTA — lấp hole của bento (high-end §3B) */}
            <div className="sm:col-span-2 lg:col-span-3">
              <div className="card card-int h-full flex flex-wrap items-center justify-between gap-3 border-dashed !border-line">
                <p className="text-sm text-subtle">
                  Chọn plan phía trên hoặc vào trực tiếp form mở tiết kiệm — approve rồi mở trong 2 bước.
                </p>
                <Link
                  to="/open"
                  className="group btn btn-outline inline-flex items-center gap-2 shrink-0"
                >
                  Đến form mở
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
