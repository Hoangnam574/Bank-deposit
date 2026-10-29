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

export interface ContractTimeParams {
  daySeconds: number;
  gracePeriod: number;
  emergencyDelay: number;
  yearSeconds: number;
}

export const DEFAULT_TIME_PARAMS: ContractTimeParams = {
  daySeconds: 86400,
  gracePeriod: 3 * 86400,
  emergencyDelay: 7 * 86400,
  yearSeconds: 31536000,
};

export type SepoliaMode = "day1" | "day86400";

export interface SepoliaModeInfo {
  id: SepoliaMode;
  label: string;
  desc: string;
}

export const SEPOLIA_MODES: Record<SepoliaMode, SepoliaModeInfo> = {
  day1: {
    id: "day1",
    label: "Demo (1s = 1 ngày)",
    desc: "1 ngày = 1s, Grace 3s (dành cho chấm thi, test nhanh)",
  },
  day86400: {
    id: "day86400",
    label: "Chuẩn (86400s = 1 ngày)",
    desc: "1 ngày = 86400s, Grace 3 ngày (chuẩn nghiệp vụ thực tế)",
  },
};

function getInitialSepoliaMode(): SepoliaMode {
  if (typeof window !== "undefined") {
    const sp = new URLSearchParams(window.location.search);
    const m = sp.get("mode");
    if (m === "day1" || m === "day86400") return m;

    const hash = window.location.hash;
    const qIdx = hash.indexOf("?");
    if (qIdx !== -1) {
      const hp = new URLSearchParams(hash.substring(qIdx));
      const hm = hp.get("mode");
      if (hm === "day1" || hm === "day86400") return hm;
    }

    const saved = localStorage.getItem("sepolia_mode");
    if (saved === "day1" || saved === "day86400") return saved;
  }

  const envMode = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_SEPOLIA_MODE;
  if (envMode === "day1" || envMode === "day86400") return envMode;

  return "day1";
}

interface ContractsCtx {
  contracts: Contracts | null;
  signer: Signer | null;
  /** chain hiện tại có deployment trong addresses.json? */
  hasDeployment: boolean;
  timeParams: ContractTimeParams;
  sepoliaMode: SepoliaMode;
  setSepoliaMode: (mode: SepoliaMode) => void;
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
  const [timeParams, setTimeParams] = useState<ContractTimeParams>(DEFAULT_TIME_PARAMS);
  const [sepoliaMode, setSepoliaModeState] = useState<SepoliaMode>(getInitialSepoliaMode);

  const setSepoliaMode = (mode: SepoliaMode) => {
    setSepoliaModeState(mode);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("sepolia_mode", mode);
        const url = new URL(window.location.href);
        url.searchParams.set("mode", mode);
        window.history.replaceState({}, "", url.toString());
      } catch {
        /* noop */
      }
      window.dispatchEvent(new CustomEvent("bank:tx-ok"));
    }
  };

  /* Rebuild contracts khi chain đổi hoặc mode đổi — nếu không có deployment cho chain này → null */
  useEffect(() => {
    let cfg: ChainContracts | undefined;
    if (chainId !== null) {
      const modes = (addressesConfig as Record<string, unknown>).sepoliaModes as
        | Record<string, ChainContracts>
        | undefined;
      if (chainId === 11155111 && modes && modes[sepoliaMode]) {
        cfg = modes[sepoliaMode];
      } else {
        cfg = CHAINS[String(chainId)];
      }
    }
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
  }, [chainId, address, getBrowser, sepoliaMode]);

  /* Đọc tham số thời gian từ hợp đồng SavingCore */
  useEffect(() => {
    if (!contracts) {
      setTimeParams(DEFAULT_TIME_PARAMS);
      return;
    }
    let cancelled = false;
    Promise.all([
      contracts.core.DAY_SECONDS().catch(() => 86400n),
      contracts.core.GRACE_PERIOD().catch(() => 259200n),
      contracts.core.EMERGENCY_DELAY().catch(() => 604800n),
      contracts.core.YEAR_SECONDS().catch(() => 31536000n),
    ]).then(([ds, gp, ed, ys]) => {
      if (!cancelled) {
        setTimeParams({
          daySeconds: Number(ds),
          gracePeriod: Number(gp),
          emergencyDelay: Number(ed),
          yearSeconds: Number(ys),
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [contracts]);

  const value = useMemo<ContractsCtx>(
    () => ({
      contracts,
      signer,
      hasDeployment: chainId !== null && CHAINS[String(chainId)] !== undefined,
      timeParams,
      sepoliaMode,
      setSepoliaMode,
    }),
    [contracts, signer, chainId, timeParams, sepoliaMode],
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

export function useContractTime(): ContractTimeParams {
  const { timeParams } = useContracts();
  return timeParams;
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
