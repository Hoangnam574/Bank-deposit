/**
 * Dashboard "/" (T6.7) — hero + 4 PlanCard (variant nổi bật).
 * Số liệu variant: APR 300 bps · tenor 180 ngày · grace 3 ngày · penalty 450 bps.
 */
import { Link } from "react-router-dom";
import { ShieldCheck, AlertTriangle, ArrowRight } from "lucide-react";
import PlanCard from "@/components/PlanCard";
import { usePlans } from "@/hooks/usePlans";
import { useWallet } from "@/providers/WalletProvider";

export default function Dashboard() {
  const { plans, loading, error } = usePlans();
  const { address } = useWallet();
  const variantPlan = plans.find((p) => Number(p.tenorDays) === 180);

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16">
      {/* ── Hero ─── */}
      <section className="pt-10 pb-8">
        <h1 className="text-4xl font-bold font-display tracking-wide">Tiết kiệm có kỳ hạn</h1>
        <p className="mt-3 text-subtle max-w-2xl">
          Gửi USDC, nhận chứng nhận NFT, lãi tính theo giây (APR cố định tại thời điểm mở).
          Rút đúng hạn nhận full lãi; rút sớm bị phạt. Sau grace period{" "}
          <strong className="text-primary">+3 ngày</strong>, bot sẽ{" "}
          <strong className="text-secondary">tự động renew</strong> giữ nguyên APR.
        </p>
        <div className="mt-4 flex flex-wrap gap-4 text-xs text-subtle">
          <span className="inline-flex items-center gap-1">
            <ShieldCheck size={14} className="text-ok" /> NFT là giấy tờ rút — không thể sync nếu bạn chưa có
          </span>
          <span className="inline-flex items-center gap-1">
            <AlertTriangle size={14} className="text-warn" /> contract demo · code trực检疫 qua MockUSDC 6 decimals
          </span>
        </div>
      </section>

      {!address && (
        <div className="mb-8 card border-secondary/50 text-sm">
          Kết nối ví ở navbar để xem/chèn số liệu và mở deposit.
        </div>
      )}

      {/* ── Plans ─── */}
      <section aria-label="Các kế hoạch tiết kiệm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-xl tracking-wider">Kế hoạch</h2>
          <Link
            to="/open"
            className="btn btn-cta inline-flex items-center gap-1 cursor-pointer"
          >
            Mở tiết kiệm <ArrowRight size={16} />
          </Link>
        </div>
        {error && <div className="card border-err/40 text-err text-sm mb-4">{error}</div>}
        {loading && <div className="text-subtle text-sm">Đang tải plans… (kiểm tra node localhost:8545)</div>}
        {!loading && !error && plans.length === 0 && (
          <div className="card text-sm text-subtle border-dashed border-line">
            Chưa có plan nào — admin cần chạy <code className="text-primary">npm run seed</code>.
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {plans.map((p) => (
            <PlanCard
              key={p.id}
              plan={p}
              variant={variantPlan?.id === p.id}
              onSelect={() => {}}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
