/**
 * hooks/usePlans.ts — đọc plan list của SavingCore (read-only).
 * Trả: `PlanRow[]`, loading, error, chain-missing flag. Reload theo chain + address.
 */
import { useEffect, useState } from "react";
import { useContracts } from "@/providers/ContractsProvider";
import { useWallet } from "@/providers/WalletProvider";
import type { PlanRow } from "@/components/PlanCard";

export function usePlans() {
  const { contracts, hasDeployment } = useContracts();
  const { chainId, address } = useWallet();
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!contracts || !hasDeployment) {
      setPlans([]);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const nextId = (await contracts.core.nextPlanId()) as bigint;
        const count = Number(nextId) - 1; // nextPlanId bắt đầu ở 1
        const rows: PlanRow[] = [];
        for (let p = 1; p <= count; p++) {
          const raw = (await contracts.core.getPlan(p)) as unknown[];
          rows.push({
            id: p,
            tenorDays: raw[0] as bigint,
            aprBps: raw[1] as bigint,
            minDeposit: raw[2] as bigint,
            maxDeposit: raw[3] as bigint,
            earlyWithdrawPenaltyBps: raw[4] as bigint,
            enabled: Boolean(raw[5]),
          });
        }
        if (!cancelled) setPlans(rows);
      } catch (e: unknown) {
        if (!cancelled) setError("Không đọc được plans — kiểm tra network & deployment");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contracts, hasDeployment, chainId, address]);

  return { plans, loading, error };
}
