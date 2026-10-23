/**
 * Navbar — định hướng + wallet connect + Faucet dev (T6.12).
 * Faucet: mint 1.000 MockUSDC, chỉ hiện khi chain là local/testnet.
 */
import { useEffect, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { Landmark, Droplet } from "lucide-react";
import type { ContractTransactionResponse } from "ethers";
import { useWallet } from "@/providers/WalletProvider";
import { useContracts, useSignerContracts } from "@/providers/ContractsProvider";
import { fmtToken, SCALAR } from "@/lib/format";
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
  const [balance, setBalance] = useState<string>("");

  /* Đọc USDC balance user — fetch qua contract read-only khi address/chain đổi */
  useEffect(() => {
    if (!contracts || !address) {
      setBalance("");
      return;
    }
    let cancelled = false;
    contracts.usdc
      .balanceOf(address)
      .then((bal) => {
        if (!cancelled) setBalance(fmtToken(bal as bigint, 2));
      })
      .catch(() => {
        // network tạm lỗi — giữ nguyên
      });
    return () => {
      cancelled = true;
    };
  }, [contracts, address]);

  const isTestChain = chainId === 31337 || chainId === 11155111;

  const faucet = () => {
    void run("Faucet: mint 1.000 USDC", async () => {
      if (!signerC || !address) throw new Error("Chưa kết nối ví");
      const tx = (await signerC.usdc.mint(address, SCALAR * 1000n)) as unknown as ContractTransactionResponse;
      return tx;
    });
  };

  return (
    <header className="border-b border-line bg-panel/80 sticky top-0 z-40 backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link to="/" className="flex items-center gap-2 cursor-pointer">
          <Landmark className="text-primary" size={26} />
          <span className="font-display font-bold tracking-wider text-lg">BANK DEPOSIT</span>
        </Link>

        <nav aria-label="Điều hướng chính" className="flex gap-1 flex-wrap">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-lg text-sm cursor-pointer transition-colors duration-200 ${
                  isActive ? "bg-cta text-white font-semibold" : "text-subtle hover:text-txt hover:bg-line/60"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          {balance && <span className="text-sm text-subtle hidden sm:inline">{balance} USDC</span>}
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
              <span className="text-sm">{address.slice(0, 6)}…{address.slice(-4)}</span>
              <button type="button" onClick={disconnect} className="btn btn-outline !py-1.5 !px-3 text-xs">
                Ngắt
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => void connect()} disabled={connecting} className="btn btn-cta !py-1.5">
              {connecting ? "Đang kết nối..." : "Kết nối ví"}
            </button>
          )}
        </div>
      </div>
      {error && <div className="px-4 pb-2 text-xs text-err">{error}</div>}
    </header>
  );
}

