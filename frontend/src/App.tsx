/**
 * App — cấu trúc provider lồng nhau:
 *   Wallet (đọc địa chỉ/chain) → Contracts (dist từ ABI + addresses)
 *   + ToastProvider (arí live status tx) + Navbar + NetworkGuard
 */
import { HashRouter, Routes, Route, Link } from "react-router-dom";
import { WalletProvider } from "@/providers/WalletProvider";
import { ToastProvider } from "@/providers/ToastProvider";
import { ContractsProvider } from "@/providers/ContractsProvider";
import Navbar from "@/components/Navbar";
import StatStrip from "@/components/StatStrip";
import { NetworkGuard } from "@/components/NetworkGuard";
import Dashboard from "@/pages/Dashboard";
import OpenDeposit from "@/pages/OpenDeposit";
import MyDeposits from "@/pages/MyDeposits";
import DepositDetail from "@/pages/DepositDetail";
import Admin from "@/pages/Admin";

export default function App() {
  return (
    <WalletProvider>
      <ToastProvider>
        <ContractsProvider>
          <HashRouter>
            <Navbar />
            <NetworkGuard />
            <StatStrip />
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/open" element={<OpenDeposit />} />
              <Route path="/deposits" element={<MyDeposits />} />
              <Route path="/deposit/:id" element={<DepositDetail />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
            {/* Footer-light (Binance signature: transactional surface flip)
                — cùng yellow language nhưng canvas trắng #FAFAFA/ink */}
            <footer
              className="py-10 text-center text-xs text-ink/70"
              style={{
                backgroundColor: "#fafafa",
                paddingBottom: "max(2rem, env(safe-area-inset-bottom, 2rem))",
              }}
            >
              <p className="text-ink font-semibold">Bank Deposit DApp</p>
              <p className="mt-1">
                AT190234 · USDC 6 decimals · grace 3 ngày · APR 300 bps · penalty 450 bps
              </p>
            </footer>
          </HashRouter>
        </ContractsProvider>
      </ToastProvider>
    </WalletProvider>
  );
}

function NotFound() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-16 text-center text-subtle">
      Trang không tồn tại —{" "}
      <Link to="/" className="underline underline-offset-4 text-secondary cursor-pointer hover:text-primary transition-colors duration-200">
        về trang chủ
      </Link>
      .
    </main>
  );
}
