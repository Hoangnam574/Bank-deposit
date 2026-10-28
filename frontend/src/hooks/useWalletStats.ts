/**
 * hooks/useWalletStats.ts — dữ liệu cho StatStrip (đọc read-only, 1 hook dùng chung):
 *   - usdcBalance: USDC balance ví
 *   - activeCount / totalPrincipal: deposits Active đang gửi
 *   - vaultAvailable: vault.balance − totalOwedInterest (chỉ hiện nếu là vault owner)
 * Refresh tự động khi: đổi address/chain, tx thành công (event "bank:tx-ok"),
 * hoặc gọi `refresh()` thủ công.
 */
import { useCallback, useEffect, useState } from "react";
import { useContracts } from "@/providers/ContractsProvider";
import { useWallet } from "@/providers/WalletProvider";

export interface WalletStats {
  usdcBalance: bigint | null;
  activeCount: number | null;
  totalPrincipal: bigint | null;
  vaultAvailable: bigint | null;
  isAdmin: boolean;
  loading: boolean;
  refresh: () => void;
}

const EMPTY: WalletStats = {
  usdcBalance: null,
  activeCount: null,
  totalPrincipal: null,
  vaultAvailable: null,
  isAdmin: false,
  loading: false,
  refresh: () => {},
};

export function useWalletStats(): WalletStats {
  const { contracts, hasDeployment } = useContracts();
  const { address, chainId, getBrowser } = useWallet();
  const [stats, setStats] = useState<WalletStats>(EMPTY);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    const onTxOk = () => setTick((t) => t + 1);
    window.addEventListener("bank:tx-ok", onTxOk);
    return () => window.removeEventListener("bank:tx-ok", onTxOk);
  }, []);

  useEffect(() => {
    if (!contracts || !hasDeployment || !address) {
      setStats(EMPTY);
      return;
    }
    let cancelled = false;
    const c = contracts;
    void (async () => {
      setStats((s) => ({ ...EMPTY, usdcBalance: s.usdcBalance, loading: true }));
      try {
        const bal = (await c.usdc.balanceOf(address)) as bigint;

        // Deposits qua ERC721Enumerable: balanceOf + tokenOfOwnerByIndex
        const nftBal = Number((await c.core.balanceOf(address)) as bigint);
        let activeCount = 0;
        let totalPrincipal = 0n;
        for (let i = 0; i < nftBal; i++) {
          const id = (await c.core.tokenOfOwnerByIndex(address, i)) as bigint;
          const d = (await c.core.getDeposit(id)) as unknown[];
          const status = Number(d[8] as bigint);
          if (status === 0) {
            activeCount += 1;
            totalPrincipal += d[1] as bigint;
          }
        }

        // Vault stats — chỉ owner mới thấy available (admin tile)
        const vaultOwner = String(await c.vault.owner()).toLowerCase();
        const isAdmin = vaultOwner === address.toLowerCase();
        let vaultAvailable: bigint | null = null;
        if (isAdmin) {
          const vb = (await c.vault.getVaultBalance()) as bigint;
          const owed = (await c.vault.totalOwedInterest()) as bigint;
          vaultAvailable = vb - owed;
        }

        if (!cancelled) {
          setStats({
            usdcBalance: bal,
            activeCount,
            totalPrincipal,
            vaultAvailable,
            isAdmin,
            loading: false,
            refresh,
          });
        }
      } catch {
        if (!cancelled) setStats({ ...EMPTY, loading: false, refresh });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contracts, hasDeployment, address, chainId, tick, refresh, getBrowser]);

  return stats;
}
