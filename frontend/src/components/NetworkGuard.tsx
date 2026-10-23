/**
 * NetworkGuard (T6.4) — yêu cầu chainId = 31337 (local) hoặc 11155111 (Sepolia).
 * Sai mạng → banner cảnh báo + nút switchNetwork, không chặn giá trị ở các extend page khác.
 */
import { useWallet } from "@/providers/WalletProvider";
export const ALLOWED_CHAINS = [31337, 11155111] as const;

const CHAIN_LABEL: Record<number, string> = {
  31337: "Hardhat Local (31337)",
  11155111: "Sepolia (11155111)",
};

export function isAllowedChain(chainId: number | null): boolean {
  return chainId !== null && (ALLOWED_CHAINS as readonly number[]).includes(chainId);
}

export function NetworkGuard() {
  const { chainId, hasWallet, switchNetwork } = useWallet();
  if (!hasWallet || isAllowedChain(chainId)) return null;

  return (
    <div
      role="alert"
      className="bg-err/10 border-b border-err/40 px-4 py-2 text-sm flex flex-wrap items-center gap-3"
    >
      <span>
        Không đúng mạng (hiện: {chainId === null ? "chưa connect" : chainId}) — cần{" "}
        {Object.values(CHAIN_LABEL).join(" hoặc ")}.
      </span>
      {ALLOWED_CHAINS.map((c) => (
        <button
          key={c}
          type="button"
          className="btn btn-outline !py-1 !px-3 text-xs cursor-pointer"
          onClick={() => void switchNetwork(c)}
        >
          Switch → {CHAIN_LABEL[c]}
        </button>
      ))}
    </div>
  );
}
