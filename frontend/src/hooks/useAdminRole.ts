/**
 * hooks/useAdminRole — vai trò vault owner của ví hiện tại:
 *   dùng chung cho Navbar (ẩn link Admin) + route guard (/admin).
 * `decided = false` khi mới mount/đang đọc on-chain lần đầu → guard chờ,
 * chỉ khi `decided && !isAdmin` mới redirect (không flash cho chính admin).
 * Refresh theo address/chain đổi (không theo tx-ok — owner hiếm khi đổi).
 */
import { useEffect, useState } from "react";
import { useContracts } from "@/providers/ContractsProvider";
import { useWallet } from "@/providers/WalletProvider";

export interface AdminRole {
  /** true = đã đọc on-chain xong (hoặc rõ ràng không đọc được) */
  decided: boolean;
  /** ví hiện tại là owner của VaultManager */
  isAdmin: boolean;
}

export function useAdminRole(): AdminRole {
  const { contracts, hasDeployment } = useContracts();
  const { address, chainId } = useWallet();
  const [role, setRole] = useState<AdminRole>({ decided: false, isAdmin: false });

  useEffect(() => {
    /* Chưa ví / chưa deployment → chắc chắn không phải admin */
    if (!contracts || !hasDeployment || !address) {
      setRole({ decided: true, isAdmin: false });
      return;
    }
    let cancelled = false;
    setRole((r) => ({ ...r, decided: false }));
    void (async () => {
      try {
        const owner = String(await contracts.vault.owner());
        if (!cancelled) setRole({ decided: true, isAdmin: owner.toLowerCase() === address.toLowerCase() });
      } catch {
        if (!cancelled) setRole({ decided: true, isAdmin: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contracts, hasDeployment, address, chainId]);

  return role;
}
