/**
 * App — cấu trúc provider lồng nhau:
 *   Wallet (đọc địa chỉ/chain) → Contracts (dist từ ABI + addresses)
 *   + ToastProvider (arí live status tx) + Navbar + NetworkGuard
 */
import { HashRouter, Routes, Route, Link, Navigate } from "react-router-dom";
import { LangProvider, useLang } from "@/lib/i18n";
import { WalletProvider } from "@/providers/WalletProvider";
import { ToastProvider } from "@/providers/ToastProvider";
import { ConfirmProvider } from "@/components/ConfirmDialog";
import { ContractsProvider } from "@/providers/ContractsProvider";
import Navbar from "@/components/Navbar";
import StatStrip from "@/components/StatStrip";
import { NetworkGuard } from "@/components/NetworkGuard";
import Dashboard from "@/pages/Dashboard";
import OpenDeposit from "@/pages/OpenDeposit";
import MyDeposits from "@/pages/MyDeposits";
import DepositDetail from "@/pages/DepositDetail";
import Admin from "@/pages/Admin";
import type { ReactNode } from "react";
import { useWallet } from "@/providers/WalletProvider";
import { useAdminRole } from "@/hooks/useAdminRole";
import WalletPicker from "@/components/WalletPicker";

/** Route guard /admin — ẩn C�Ả вклад link (Navbar) lẫn trực tiếp gõ URL:
 *  chỉ vault owner của VaultManager vào được; chưa kết nối / không phải
 *  admin → redirect về "/" (sau khi hook "decided" tránh flash). */
function AdminGuard({ children }: { children: ReactNode }) {
  const { address } = useWallet();
  const { decided, isAdmin } = useAdminRole();
  const { t } = useLang();
  if (!decided) {
    return (
      <main
        role="status"
        className="mx-auto w-full max-w-[1680px] px-4 py-24 text-center text-subtle"
      >
        {t("app.adminChecking")}
      </main>
    );
  }
  if (!address || !isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <LangProvider>
      <WalletProvider>
      <ToastProvider>
        <ConfirmProvider>
        <ContractsProvider>
          <HashRouter>
            {/* Shell flex column: footer luôn ghim đáy viewport kể cả khi nội dung ngắn */}
            <div className="flex min-h-dvh flex-col">
              <Navbar />
              <NetworkGuard />
              <StatStrip />
              <div className="flex-1">
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/open" element={<OpenDeposit />} />
                  <Route path="/deposits" element={<MyDeposits />} />
                  <Route path="/deposit/:id" element={<DepositDetail />} />
                  <Route path="/admin" element={<AdminGuard><Admin /></AdminGuard>} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </div>
              {/* Picker chọn ví (≥2 wallet EIP-6963) — mount 1 lần, tự ẩn */}
              <WalletPicker />
              {/* Footer tối — hòa canvas (#0b0e11) + hairline #2B3139, chữ muted
                  (user override: footer trùng màu nền, bỏ footer-light #FAFAFA) */}
              <footer
                className="mt-10 border-t border-line bg-bg py-10 text-center text-xs text-muted pb-[calc(3.75rem+env(safe-area-inset-bottom,0px))] sm:pb-[calc(2.5rem+env(safe-area-inset-bottom,2rem))]"
              >
              <p className="text-txt font-semibold">Bank Deposit DApp</p>
              <p className="mt-1"><FooterTagline /></p>
                </footer>
              </div>
            </HashRouter>
        </ContractsProvider>
        </ConfirmProvider>
      </ToastProvider>
    </WalletProvider>
    </LangProvider>
  );
}

function FooterTagline() {
  const { t } = useLang();
  return <>{t("footer.tagline")}</>;
}

function NotFound() {
  const { t } = useLang();
  return (
    <main className="mx-auto w-full max-w-[1680px] px-4 sm:px-6 lg:px-10 py-16 text-center text-subtle">
      {t("app.notFound")}{" "}
      <Link to="/" className="underline underline-offset-4 text-secondary cursor-pointer hover:text-primary transition-colors duration-200">
        {t("app.notFoundLink")}
      </Link>
      .
    </main>
  );
}
