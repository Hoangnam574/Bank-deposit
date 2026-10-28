/**
 * Navbar v5 — App shell: logo · nav (active = tint gold) · chain pill · USDC chip ·
 * vai trò (Vault owner → "Admin") · Faucet · nút ví.
 * Mobile (< 640px) chia 2 vùng để hết tràn ngang:
 *   - Header sticky trên: logo + chain pill compact + faucet + nút ví
 *   - Footer-nav cố định đáy: 3–4 kho điều hướng lớn (tap target ≥ 44px)
 * Desktop (≥ sm): giữ nguyên header một hàng như cũ.
 * Faucet: mint 1.000 MockUSDC, chỉ hiện khi chain là local/testnet (T6.12).
 */
import { useEffect, useState, type ComponentType } from "react";
import { Link, NavLink } from "react-router-dom";
import { Landmark, Droplet, ShieldCheck, Home, PlusCircle, Wallet } from "lucide-react";
import type { ContractTransactionResponse } from "ethers";
import { useWallet } from "@/providers/WalletProvider";
import { useContracts, useSignerContracts } from "@/providers/ContractsProvider";
import { fmtToken, SCALAR } from "@/lib/format";
import { findHardhatAccount } from "@/lib/accounts";
import NetworkMenu from "@/components/NetworkMenu";
import { useTx } from "@/hooks/useTx";
import { useAdminRole } from "@/hooks/useAdminRole";

const NAV: { to: string; label: string; icon: ComponentType<{ size?: number; className?: string }> }[] = [
  { to: "/", label: "Kế hoạch", icon: Home },
  { to: "/open", label: "Mở tiết kiệm", icon: PlusCircle },
  { to: "/deposits", label: "Sổ tiết kiệm", icon: Wallet },
  { to: "/admin", label: "Admin", icon: ShieldCheck },
];

export default function Navbar() {
  const { address, connect, disconnect, connecting, error, chainId } = useWallet();
  const { contracts } = useContracts();
  const signerC = useSignerContracts();
  const { run, state } = useTx();
  const { isAdmin } = useAdminRole();
  const [balance, setBalance] = useState<bigint | null>(null);

  /* USDC balance — refresh khi tx thành công (bank:tx-ok); vai trò admin dùng useAdminRole */
  useEffect(() => {
    if (!contracts || !address) {
      setBalance(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const bal = (await contracts.usdc.balanceOf(address)) as bigint;
        if (!cancelled) setBalance(bal);
      } catch {
        /* giữ nguyên */
      }
    })();
    const onTxOk = () => {
      contracts.usdc
        .balanceOf(address)
        .then((b) => !cancelled && setBalance(b as bigint))
        .catch(() => {});
    };
    window.addEventListener("bank:tx-ok", onTxOk);
    return () => {
      cancelled = true;
      window.removeEventListener("bank:tx-ok", onTxOk);
    };
  }, [contracts, address, chainId]);

  const isTestChain = chainId === 31337 || chainId === 11155111;
  const demo = findHardhatAccount(address);
  const navItems = NAV.filter((item) => item.to !== "/admin" || isAdmin);

  const faucet = () => {
    void run("Faucet: mint 1.000 USDC", async () => {
      if (!signerC || !address) throw new Error("Chưa kết nối ví");
      const tx = (await signerC.usdc.mint(address, SCALAR * 1000n)) as unknown as ContractTransactionResponse;
      return tx;
    });
  };

  return (
    <>
      {/* Nav v5 — flat full-width trên canvas (Binance top-nav): hairline dưới,
          logo block yellow đặc + icon ink. Mobile: header chỉ giữ logo + cụm ví. */}
      <div className="sticky top-0 z-40 border-b border-line bg-bg">
        <header className="mx-auto w-full max-w-[1680px] px-4 sm:px-6 lg:px-10">
          {/* ── DESKTOP ≥sm: một hàng như cũ ── */}
          <div className="hidden sm:flex items-center gap-x-2.5 flex-nowrap py-2.5">
            <Link to="/" className="flex items-center gap-2 cursor-pointer shrink-0">
              <span className="grid place-items-center w-9 h-9 rounded-md bg-primary">
                <Landmark className="text-ink" size={20} />
              </span>
              <span className="font-bold tracking-tight text-lg text-white">
                BANK<span className="text-primary">·</span>DEPOSIT
              </span>
            </Link>

            <nav aria-label="Điều hướng chính" className="flex items-center gap-1 flex-nowrap">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/"}
                  className={({ isActive }) =>
                    `relative px-2.5 xl:px-3 py-1.5 rounded-full text-sm whitespace-nowrap cursor-pointer transition-colors duration-200 ${
                      isActive
                        ? "bg-primary/15 text-primary font-semibold"
                        : "text-subtle hover:text-txt hover:bg-panel"
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {item.label}
                      {isActive && (
                        <span
                          aria-hidden
                          className="absolute left-3 right-3 -bottom-[7px] h-0.5 rounded-full bg-primary"
                        />
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </nav>

            <div className="ml-auto flex items-center gap-2 flex-nowrap justify-end">
              <NetworkMenu />
              {isAdmin && (
                <span className="inline-flex items-center gap-1 rounded-md border border-ok/40 bg-ok/10 px-2 py-0.5 text-[11px] font-semibold text-ok whitespace-nowrap">
                  <ShieldCheck size={12} /> Admin
                </span>
              )}
              {balance !== null && (
                <span className="num text-sm font-display text-secondary hidden xl:inline whitespace-nowrap">{fmtToken(balance, 2)}</span>
              )}
              {isTestChain && address && (
                <button
                  type="button"
                  onClick={faucet}
                  disabled={state.status === "pending"}
                  className="btn btn-outline !py-1.5 !px-2.5 xl:!px-3 text-xs inline-flex items-center gap-1 shrink-0"
                >
                  <Droplet size={14} /> Faucet 1k
                </button>
              )}
              {address ? (
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <span
                    className="num text-sm"
                    title={demo ? `Hardhat account #${demo.index} — ${demo.role}` : "Account ngoài (có thể không có ETH/USDC local)"}
                  >
                    {address.slice(0, 6)}…{address.slice(-4)}
                    {demo && <span className="text-xs text-subtle hidden xl:inline"> (#{demo.index})</span>}
                  </span>
                  <button type="button" onClick={disconnect} className="btn btn-outline !py-1.5 !px-2.5 xl:!px-3 text-xs shrink-0">
                    Ngắt
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => void connect()} disabled={connecting} className="btn btn-cta !py-1.5 shrink-0">
                  {connecting ? "Đang kết nối" : "Kết nối ví"}
                </button>
              )}
            </div>
          </div>

          {/* ── MOBILE <sm: header gọn — logo + chain pill compact + faucet + ví ── */}
          <div className="flex sm:hidden items-center justify-between gap-1.5 py-2">
            <Link to="/" className="flex items-center gap-1.5 cursor-pointer shrink-0">
              <span className="grid place-items-center w-8 h-8 rounded-md bg-primary">
                <Landmark className="text-ink" size={18} />
              </span>
              <span className="font-bold tracking-tight text-base text-white">
                BANK<span className="text-primary">·</span>DEPOSIT
              </span>
            </Link>

            <div className="flex items-center gap-1.5 min-w-0">
              <NetworkMenu compact />
              {isTestChain && address && (
                <button
                  type="button"
                  onClick={faucet}
                  disabled={state.status === "pending"}
                  aria-label="Faucet — mint 1.000 USDC"
                  className="btn btn-outline !px-2 !py-1.5 shrink-0"
                >
                  <Droplet size={14} />
                </button>
              )}
              {address ? (
                <button
                  type="button"
                  onClick={disconnect}
                  title={`${address} — nhấn để ngắt kết nối`}
                  className="btn btn-outline !px-2 !py-1.5 text-xs shrink-0"
                >
                  {address.slice(0, 5)}…{address.slice(-3)}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void connect()}
                  disabled={connecting}
                  className="btn btn-cta !px-2.5 !py-1.5 text-xs shrink-0"
                >
                  {connecting ? "Đang kết nối" : "Kết nối"}
                </button>
              )}
            </div>
          </div>
          {error && <div className="pb-2 text-xs text-err sm:hidden">{error}</div>}
        </header>
      </div>

      {/* ── MOBILE footer-nav: cố định đáy, kho to dễ chạm (≥44px) ── */}
      <nav
        aria-label="Điều hướng chính (mobile)"
        className="sm:hidden fixed bottom-0 inset-x-0 z-40 border-t border-line bg-bg"
      >
        <div
          className={`grid ${isAdmin ? "grid-cols-4" : "grid-cols-3"} px-1`}
          style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        >
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-0.5 py-2 min-h-[52px] cursor-pointer transition-colors duration-200 ${
                  isActive ? "text-primary" : "text-subtle active:text-txt"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon size={18} className={isActive ? "text-primary" : undefined} />
                  <span className={`text-[10px] leading-tight ${isActive ? "font-semibold" : ""}`}>{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </>
  );
}
