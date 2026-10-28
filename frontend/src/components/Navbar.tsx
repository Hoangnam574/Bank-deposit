/**
 * Navbar v2 — App shell: logo · nav (active = tint gold, không dùng CTA tím) ·
 * chain pill · USDC chip · vai trò (Vault owner → "Admin") · Faucet · nút ví.
 * Faucet: mint 1.000 MockUSDC, chỉ hiện khi chain là local/testnet (T6.12).
 */
import { useEffect, useState } from "react";
import { Link, NavLink } from "react-router-dom";import { Landmark, Droplet, ShieldCheck } from "lucide-react";
import type { ContractTransactionResponse } from "ethers";
import { useWallet } from "@/providers/WalletProvider";
import { useContracts, useSignerContracts } from "@/providers/ContractsProvider";
import { fmtToken, SCALAR } from "@/lib/format";
import { findHardhatAccount } from "@/lib/accounts";
import NetworkMenu from "@/components/NetworkMenu";
import { useTx } from "@/hooks/useTx";
import { useAdminRole } from "@/hooks/useAdminRole";

const NAV = [
  { to: "/", label: "Kế hoạch" },
  { to: "/open", label: "Mở tiết kiệm" },
  { to: "/deposits", label: "Sổ tiết kiệm" },
  { to: "/admin", label: "Admin" },
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

  const faucet = () => {
    void run("Faucet: mint 1.000 USDC", async () => {
      if (!signerC || !address) throw new Error("Chưa kết nối ví");
      const tx = (await signerC.usdc.mint(address, SCALAR * 1000n)) as unknown as ContractTransactionResponse;
      return tx;
    });
  };

  return (
    /* Nav v4 — flat full-width trên canvas (Binance top-nav): hairline dưới,
       không glass/blur, logo block yellow đặc + icon ink. */
    <div className="sticky top-0 z-40 border-b border-line bg-bg">
      {/* Full-bleed Binance-style header: logo sát mép trái, cụm ví sát mép phải */}
      <header className="mx-auto w-full max-w-[1680px] px-4 sm:px-6 lg:px-10">
        <div className="flex items-center gap-x-2.5 flex-nowrap py-2.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Link to="/" className="flex items-center gap-2 cursor-pointer shrink-0">
            <span className="grid place-items-center w-9 h-9 rounded-md bg-primary">
              <Landmark className="text-ink" size={20} />
            </span>
            <span className="font-bold tracking-tight text-lg text-white">
              BANK<span className="text-primary">·</span>DEPOSIT
            </span>
          </Link>

          <nav aria-label="Điều hướng chính" className="flex items-center gap-1 flex-nowrap shrink-0">
            {NAV.filter((item) => item.to !== "/admin" || isAdmin).map((item) => (
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

          <div className="ml-auto flex items-center gap-2 flex-nowrap shrink-0 justify-end">
            <NetworkMenu />
            {isAdmin && (
              <span className="inline-flex items-center gap-1 rounded-md border border-ok/40 bg-ok/10 px-2 py-0.5 text-[11px] font-semibold text-ok whitespace-nowrap">
                <ShieldCheck size={12} /> Admin
              </span>
            )}
            {balance !== null && (
              <span className="num text-sm font-display text-secondary hidden sm:inline whitespace-nowrap">{fmtToken(balance, 2)}</span>
            )}
            {isTestChain && address && (
              <button
                type="button"
                onClick={faucet}
                disabled={state.status === "pending"}
                className="btn btn-outline !py-1.5 !px-2.5 xl:!px-3 text-xs inline-flex items-center gap-1 shrink-0"
              >
                <Droplet size={14} /> <span className="hidden sm:inline">Faucet 1k</span>
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
        {error && <div className="px-4 pb-2 text-xs text-err">{error}</div>}
      </header>
    </div>
  );
}
