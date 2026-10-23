/**
 * App — cấu trúc provider lồng nhau:
 *   Wallet (đọc địa chỉ/chain) → Contracts (dist từ ABI + addresses)
 *   + ToastProvider (arí live status tx) + Navbar + NetworkGuard
 */
import { HashRouter, Routes, Route } from "react-router-dom";
import { WalletProvider } from "@/providers/WalletProvider";
import { ToastProvider } from "@/providers/ToastProvider";
import { ContractsProvider } from "@/providers/ContractsProvider";
import Navbar from "@/components/Navbar";
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
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/open" element={<OpenDeposit />} />
              <Route path="/deposits" element={<MyDeposits />} />
              <Route path="/deposit/:id" element={<DepositDetail />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
            <footer className="py-8 text-center text-xs text-subtle border-t border-line">
              Bank Deposit DApp · AT190234 · USDC 6 decimals · grace 3 ngày · APR 300 bps · penalty 450 bps
            </footer>
          </HashRouter>
        </ContractsProvider>
      </ToastProvider>
    </WalletProvider>
  );
}

function NotFound() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-16 text-center text-subtle">
      Trang không tồn tại — <a href="/" className="underline text-secondary cursor-pointer">về trang chủ</a>.
    </div>
  );
}
