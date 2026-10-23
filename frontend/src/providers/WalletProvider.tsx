/**
 * WalletProvider (T6.3) — kết nối MetaMask qua `window.ethereum`:
 *   - BrowserProvider + getSigner của ethers v6
 *   - listen accountsChanged / chainChanged
 *   - persist địa chỉ đã connect (localStorage) — reconnect mượt ở lần sau
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { BrowserProvider, type Eip1193Provider } from "ethers";
import { hexToChainId } from "@/lib/format";

/** ABI chuẩn của `window.ethereum` dùng phần nhỏ thui */
interface Eip1193 extends Eip1193Provider {
  on(event: "accountsChanged" | "chainChanged", cb: (...args: unknown[]) => void): void;
  removeListener(event: "accountsChanged" | "chainChanged", cb: (...args: unknown[]) => void): void;
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

const STORAGE_KEY = "bank:connectedAddress";

interface WalletCtx {
  /** chưa connect tới MetaMask cài app — `connect(false)` để chỉ connect nhưng không request */
  address: string | null;
  chainId: number | null;
  connecting: boolean;
  error: string | null;
  /** MetaMask (hoặc trình ví tương tự) có trong trang? */
  hasWallet: boolean;
  connect: () => Promise<string | null>;
  disconnect: () => void;
  /** Request đổi chain qua wallet; trả true nếu thành công */
  switchNetwork: (targetChainId: number) => Promise<boolean>;
  /** BrowserProvider bọc ethereum; chỉ lấy khi đã có window.ethereum */
  getBrowser: () => BrowserProvider | null;
}

const Ctx = createContext<WalletCtx | null>(null);

export function getInjected(): Eip1193 | null {
  const eth = (window as unknown as { ethereum?: Eip1193 }).ethereum;
  return eth ?? null;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eth = typeof window !== "undefined" ? getInjected() : null;

  /* ── Đọc chainId hiện tại và address persisted mỗi khi mount / thay đổi ví ── */
  useEffect(() => {
    if (!eth) return;
    let alive = true;
    const id = window.setInterval(async () => {
      try {
        const hex = (await eth.request({ method: "eth_chainId" })) as string | null;
        const got = hexToChainId(hex ?? null);
        if (alive && got !== null) setChainId(got);
      } catch {
        // rất hiếm — bỏ qua
      }
    }, 1500);
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) eth.request({ method: "eth_accounts" }).then((acc) => {
      const accounts = acc as string[];
      if (alive && accounts?.[0]) setAddress(accounts[0]);
    });

    const onAccounts = (...args: unknown[]) => {
      const accounts = args[0] as string[];
      if (!accounts || accounts.length === 0) {
        setAddress(null);
        localStorage.removeItem(STORAGE_KEY);
      } else {
        setAddress(accounts[0]);
        localStorage.setItem(STORAGE_KEY, accounts[0]);
      }
    };
    const onChain = (...args: unknown[]) => {
      const hex = String(args[0]);
      const got = hexToChainId(hex);
      if (got !== null) setChainId(got);
    };
    eth.on("accountsChanged", onAccounts);
    eth.on("chainChanged", onChain);
    return () => {
      alive = false;
      window.clearInterval(id);
      eth.removeListener("accountsChanged", onAccounts);
      eth.removeListener("chainChanged", onChain);
    };
  }, [eth]);

  const connect = useCallback(async () => {
    if (!eth) {
      setError("Chưa cài MetaMask — cài ở metamask.io");
      return null;
    }
    setConnecting(true);
    setError(null);
    try {
      const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
      if (accounts?.[0]) {
        setAddress(accounts[0]);
        localStorage.setItem(STORAGE_KEY, accounts[0]);
        return accounts[0];
      }
      return null;
    } catch (e: unknown) {
      setError("Connect từ chối — mở MetaMask và thử lại");
      return null;
    } finally {
      setConnecting(false);
    }
  }, [eth]);

  const disconnect = useCallback(() => {
    setAddress(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const switchNetwork = useCallback(async (target: number) => {
    if (!eth) return false;
    const hex = "0x" + target.toString(16);
    try {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
      return true;
    } catch (e: unknown) {
      // 4902 = chưa add chain trong ví → add (chỉ local 31337; Sepolia MetaMask có sẵn)
      const code = (e as { code?: number }).code;
      if (code === 4902 || /unrecognized chain/i.test((e as Error)?.message ?? "")) {
        if (target !== 31337) return false;
        try {
          await eth.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: hex,
                chainName: "Hardhat Local",
                nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
                rpcUrls: ["http://127.0.0.1:8545"],
                blockExplorerUrls: [],
              },
            ],
          });
          return true;
        } catch {
          return false;
        }
      }
      return false;
    }
  }, [eth]);

  const getBrowser = useCallback((): BrowserProvider | null => {
    return eth ? new BrowserProvider(eth) : null;
  }, [eth]);

  const value = useMemo(
    () => ({ address, chainId, connecting, error, hasWallet: Boolean(eth), connect, disconnect, switchNetwork, getBrowser }),
    [address, chainId, connecting, error, eth, connect, disconnect, switchNetwork, getBrowser],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet(): WalletCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWallet: phải nằm trong <WalletProvider>");
  return ctx;
}
