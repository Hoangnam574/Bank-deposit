/**
 * ContractsProvider (T6.5) — tạo ethers Contract từ ABI + addresses
 * đã được export từ P5 (`exportFrontend.ts` → src/abis + src/config).
 *   - `contracts`: contract với read-only provider (khi có ví, chưa cần signer)
 *   - `signer`: ethers Signer — chỉ có khi đã connect; dùng cho write
 *     (`contracts.connect(signer)`)
 * Không crash khi chưa connect / chain lạ — trả null, UI tự guard.
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Contract, type Contract as EthersContract, type BrowserProvider, type Signer } from "ethers";
import { useWallet } from "./WalletProvider";
import MockUSDCAbi from "@/abis/MockUSDC.json";
import VaultManagerAbi from "@/abis/VaultManager.json";
import SavingCoreAbi from "@/abis/SavingCore.json";
import addressesConfig from "@/config/addresses.json";

/**
 * Linh hoạt: methods được ethers v6 resolve runtime từ ABI (khó gõ tĩnh).
 * `AnyContract` mới giúp gọi `c.getPlan(1)` không bị TS chặn.
 */
export type AnyContract = EthersContract & {
  [method: string]: (...args: unknown[]) => Promise<unknown>;
};

interface ChainContracts {
  MockUSDC: string;
  VaultManager: string;
  SavingCore: string;
}
const CHAINS = addressesConfig as unknown as Record<string, ChainContracts>;

export interface Contracts {
  usdc: AnyContract;
  vault: AnyContract;
  core: AnyContract;
  usdcAddress: string;
  vaultAddress: string;
  savingCoreAddress: string;
}

interface ContractsCtx {
  contracts: Contracts | null;
  signer: Signer | null;
  /** chain hiện tại có deployment trong addresses.json? */
  hasDeployment: boolean;
}

const Ctx = createContext<ContractsCtx | null>(null);

function buildContracts(cfg: ChainContracts, provider: BrowserProvider): Contracts {
  return {
    usdc: new Contract(cfg.MockUSDC, MockUSDCAbi as unknown as string, provider) as AnyContract,
    vault: new Contract(cfg.VaultManager, VaultManagerAbi as unknown as string, provider) as AnyContract,
    core: new Contract(cfg.SavingCore, SavingCoreAbi as unknown as string, provider) as AnyContract,
    usdcAddress: cfg.MockUSDC,
    vaultAddress: cfg.VaultManager,
    savingCoreAddress: cfg.SavingCore,
  };
}

export function ContractsProvider({ children }: { children: ReactNode }) {
  const { chainId, address, getBrowser } = useWallet();
  const [contracts, setContracts] = useState<Contracts | null>(null);
  const [signer, setSigner] = useState<Signer | null>(null);

  /* Rebuild contracts khi chain đổi — nếu không có deployment cho chain này → null */
  useEffect(() => {
    const cfg: ChainContracts | undefined = chainId !== null ? CHAINS[String(chainId)] : undefined;
    const provider = getBrowser();
    if (cfg && provider) {
      const built = buildContracts(cfg, provider);
      setContracts(built);
      if (address) {
        provider
          .getSigner()
          .then((s) => setSigner(s))
          .catch(() => setSigner(null));
      } else {
        setSigner(null);
      }
    } else {
      setContracts(null);
      setSigner(null);
    }
  }, [chainId, address, getBrowser]);

  const value = useMemo<ContractsCtx>(
    () => ({
      contracts,
      signer,
      hasDeployment: chainId !== null && CHAINS[String(chainId)] !== undefined,
    }),
    [contracts, signer, chainId],
  );

  return (
    <Ctx.Provider value={value}>{children}</Ctx.Provider>
  );
}

export function useContracts(): ContractsCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useContracts: phải nằm trong <ContractsProvider>");
  return ctx;
}

/** Contract NGHIỆP VỤ đã nối signer (write tx). Null nếu chưa connect. */
export function useSignerContracts(): Contracts | null {
  const { contracts, signer } = useContracts();
  return useMemo(() => {
    if (!contracts || !signer) return null;
    return {
      ...contracts,
      usdc: contracts.usdc.connect(signer) as AnyContract,
      vault: contracts.vault.connect(signer) as AnyContract,
      core: contracts.core.connect(signer) as AnyContract,
    };
  }, [contracts, signer]);
}
