/**
 * WalletProvider (T6.3, v2 multi-wallet) — kết nối qua EIP-6963:
 *   - phát hiện MỌI ví cài sẵn (MetaMask, Rabby, OKX…) qua event
 *     `eip6963:announceProvider`; khi có >1 ví: mở picker cho user bấm chọn.
                    * fallback khi trang chỉ có `window.ethereum` (1 ví) → connect trực tiếp.
 *   - BrowserProvider + getSigner của ethers v6 trên provider user đã chọn
 *   - listen accountsChanged / chainChanged trên ĐÚNG provider đó
 *   - persist địa chỉ + rdns của ví đã chọn (localStorage) — reconnect mượt
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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

/** EIP-6963 providerInfo */
export interface WalletInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}
/** Một ví phát hiện được qua EIP-6963 */
export interface WalletEntry {
  info: WalletInfo;
  provider: Eip1193;
}

const STORAGE_KEY = "bank:connectedAddress";
const STORAGE_RDNS = "bank:connectedRdns";

interface WalletCtx {
  /** chưa connect tới ví nào — `connect(entry?)` không arg để mở picker */
  address: string | null;
  chainId: number | null;
  connecting: boolean;
  error: string | null;
  /** trang có ví web3 nào không (injected hoặc EIP-6963)? */
  hasWallet: boolean;
  /** gọi connect() → 0/1 ví: nối ngay; >1 ví: mở picker trả về null */
  connect: (entry?: WalletEntry) => Promise<string | null>;
  /** ví user chọn (null = fallback window.ethereum chưa connect) */
  activeChain: Eip1193 | null;
  disconnect: () => void;
  /** Request đổi chain qua wallet; trả true nếu thành công */
  switchNetwork: (targetChainId: number) => Promise<boolean>;
  /** BrowserProvider bọc provider đã chọn; chỉ lấy khi đã kết nối */
  getBrowser: () => BrowserProvider | null;
  /* multi-wallet picker state */
  wallets: WalletEntry[];
  pickOpen: boolean;
  closePicker: () => void;
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
  const [entries, setEntries] = useState<WalletEntry[]>([]);
  const [pickOpen, setPickOpen] = useState(false);
  /** provider user đã chọn trong picker (null = fallback injected) */
  const [activeChain, setActiveChain] = useState<Eip1193 | null>(null);
  const entriesRef = useRef<WalletEntry[]>([]);
  entriesRef.current = entries;

  const injected = typeof window !== "undefined" ? getInjected() : null;
  /** mọi tương tác signing/broadcast đi qua provider user chọn, fallback injected */
  const eth = activeChain ?? injected;

  /* ── EIP-6963: xin danh sách ví ngay khi mount ── */
  useEffect(() => {
    const onAnnounce = (e: Event) => {
      const { info, provider } = (e as CustomEvent<{ info: WalletInfo; provider: Eip1193 }>).detail;
      if (!info?.uuid || !provider) return;
      setEntries((prev) =>
        prev.some((w) => w.info.uuid === info.uuid) ? prev : [...prev, { info, provider }],
      );
    };
    window.addEventListener("eip6963:announceProvider", onAnnounce);
    /* xin các ví announce (MetaMask/Rabby/OKX nghe sự kiện này) */
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    return () => window.removeEventListener("eip6963:announceProvider", onAnnounce);
  }, []);

  /* ── Đọc chainId hiện tại và address persisted mỗi khi mount / đổi ví ── */
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

    /* Reconnect mượt: có address đã lưu → hỏi provider đã chọn trước đó (rdns),
       fallback injected. eth_accounts KHÔNG bật prompt. */
    const savedAddress = localStorage.getItem(STORAGE_KEY);
    if (savedAddress) {
      const savedRdns = localStorage.getItem(STORAGE_RDNS);
      const match = savedRdns
        ? entriesRef.current.find((w) => w.info.rdns === savedRdns) ?? null
        : null;
      const reconnect = match?.provider ?? eth;
      void reconnect
        .request({ method: "eth_accounts" })
        .then((acc) => {
          const accounts = acc as string[];
          if (!alive || !accounts?.[0]) return;
          if (match?.provider) setActiveChain(match.provider);
          setAddress(accounts[0]);
        })
        .catch(() => {
          /* localStorage cũ nhưng ví đã revocation — bỏ */
        });
    }

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

  const connect = useCallback(async (entry?: WalletEntry): Promise<string | null> => {
    setError(null);
    let provider = entry?.provider ?? null;
    if (!provider) {
      const list = entriesRef.current;
      if (list.length > 1) {
        setPickOpen(true); // nhiều ví cài song song → bấm chọn trong picker
        return null;
      }
      provider = list[0]?.provider ?? getInjected();
      if (!provider) {
        setError("Chưa cài ví (MetaMask/Rabby…) — cài rồi thử lại");
        return null;
      }
    }
    setConnecting(true);
    try {
      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
      if (accounts?.[0]) {
        setActiveChain(provider);
        setAddress(accounts[0]);
        localStorage.setItem(STORAGE_KEY, accounts[0]);
        localStorage.setItem(STORAGE_RDNS, entry?.info.rdns ?? "injected");
        return accounts[0];
      }
      return null;
    } catch {
      setError("Connect bị từ chối — mở ví và thử lại");
      return null;
    } finally {
      setConnecting(false);
    }
  }, []);

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
    () => ({
      address,
      chainId,
      connecting,
      error,
      hasWallet: Boolean(eth),
      connect,
      activeChain,
      disconnect,
      switchNetwork,
      getBrowser,
      wallets: entries,
      pickOpen,
      closePicker: () => setPickOpen(false),
    }),
    [address, chainId, connecting, error, eth, activeChain, connect, disconnect, switchNetwork, getBrowser, entries, pickOpen],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet(): WalletCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWallet: phải nằm trong <WalletProvider>");
  return ctx;
}
