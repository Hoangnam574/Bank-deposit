/**
 * Skeleton (v3) — loader khớp shape layout thay text "Đang tải…"/spinner
 * (audit redesign-existing-projects: "spinner → skeleton loaders").
 * CSS-only shimmer qua .skeleton; prefers-reduced-motion tự tắt.
 */
import { useLang } from "@/lib/i18n";

/** Khối nội suyány áp — dùng cho mọi kích thước */
export function Sk({ className = "h-4 w-full" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}

export function SkeletonCard() {
  return (
    <div className="card" aria-hidden>
      <div className="flex items-baseline justify-between">
        <Sk className="h-9 w-20" />
        <Sk className="h-5 w-16" />
      </div>
      <Sk className="mt-3 h-3 w-24" />
      <dl className="mt-4 space-y-2">
        <Sk className="h-3.5 w-full" />
        <Sk className="h-3.5 w-4/5" />
        <Sk className="h-3.5 w-3/5" />
      </dl>
      <Sk className="mt-4 h-3 w-full" />
    </div>
  );
}

export function SkeletonGrid({ count = 4 }: { count?: number }) {
  const { t } = useLang();
  return (
    <div role="status" aria-label={t("skeleton.loading")} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => <SkeletonCard key={i} />)}
    </div>
  );
}

export function SkeletonDeposit() {
  return (
    <div className="card" aria-hidden>
      <div className="flex items-center justify-between">
        <div>
          <Sk className="h-3 w-20" />
          <Sk className="mt-1.5 h-7 w-32" />
        </div>
        <Sk className="h-5 w-16 rounded-full" />
      </div>
      <Sk className="mt-4 h-1.5 w-full rounded-full" />
      <Sk className="mt-3 h-3 w-2/3" />
    </div>
  );
}

export function SkeletonRows({ count = 2 }: { count?: number }) {
  const { t } = useLang();
  return (
    <div role="status" aria-label={t("skeleton.loading")} className="grid gap-4 sm:grid-cols-2">
      {Array.from({ length: count }, (_, i) => <SkeletonDeposit key={i} />)}
    </div>
  );
}
