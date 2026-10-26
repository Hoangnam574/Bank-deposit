/**
 * Navbar v2 — App shell: logo · nav (active = tint gold, không dùng CTA tím) ·
 * chain pill · USDC chip · vai trò (Vault owner → "Admin") · Faucet · nút ví.
 * Faucet: mint 1.000 MockUSDC, chỉ hiện khi chain là local/testnet (T6.12).
 */
import { useEffect, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { Landmark, Droplet, ShieldCheck } from "lucide-react";
import type { ContractTransactionResponse } from "ethers";
import { useWallet } from "@/providers/WalletProvider";
import { useContracts, useSignerContracts } from "@/providers/ContractsProvider";
import { fmtToken, SCALAR } from "@/lib/format";
import { findHardhatAccount } from "@/lib/accounts";
import { ChainPill } from "@/components/NetworkGuard";
import { useTx } from "@/hooks/useTx";

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
  const [balance, setBalance] = useState<bigint | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  /* USDC balance + vai trò vault owner — refresh khi tx thành công (bank:tx-ok) */
  useEffect(() => {
    if (!contracts || !address) {
      setBalance(null);
      setIsAdmin(false);
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
      try {
        const owner = String(await contracts.vault.owner()).toLowerCase();
        if (!cancelled) setIsAdmin(owner === address.toLowerCase());
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
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5 lg:flex-nowrap">
          <Link to="/" className="flex items-center gap-2 cursor-pointer">
            <span className="grid place-items-center w-9 h-9 rounded-md bg-primary">
              <Landmark className="text-ink" size={20} />
            </span>
            <span className="font-bold tracking-tight text-lg text-white">
              BANK<span className="text-primary">·</span>DEPOSIT
            </span>
          </Link>

          <nav aria-label="Điều hướng chính" className="flex gap-1 flex-wrap">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  `relative px-3 py-1.5 rounded-full text-sm cursor-pointer transition-colors duration-200 ${
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

          <div className="ml-auto flex items-center gap-2.5 flex-wrap justify-end">
            <ChainPill chainId={chainId} />
            {isAdmin && (
              <span className="inline-flex items-center gap-1 rounded-md border border-ok/40 bg-ok/10 px-2 py-0.5 text-[11px] font-semibold text-ok">
                <ShieldCheck size={12} /> Admin
              </span>
            )}
            {balance !== null && (
              <span className="num text-sm font-display text-secondary">{fmtToken(balance, 2)}</span>
            )}
            {isTestChain && address && (
              <button
                type="button"
                onClick={faucet}
                disabled={state.status === "pending"}
                className="btn btn-outline !py-1.5 !px-3 text-xs inline-flex items-center gap-1"
              >
                <Droplet size={14} /> Faucet 1k
              </button>
            )}
            {address ? (
              <div className="flex items-center gap-2">
                <span className="num text-sm" title={demo ? `Hardhat account #${demo.index} — ${demo.role}` : "Account ngoài (có thể không có ETH/USDC local)"}>
                  {address.slice(0, 6)}…{address.slice(-4)}
                  {demo && <span className="text-xs text-subtle"> (#{demo.index})</span>}
                </span>
                <button type="button" onClick={disconnect} className="btn btn-outline !py-1.5 !px-3 text-xs">
                  Ngắt
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => void connect()} disabled={connecting} className="btn btn-cta !py-1.5">
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
