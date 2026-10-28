/**
 * hooks/useTx.ts (T6.6) — state machine cho write tx:
 *   idle → pending → success | error
 * Kèm toast + map custom error → message thân thiện (không hiện raw revert).
 */
import { useCallback, useState } from "react";
import type { ContractTransactionResponse } from "ethers";
import { mapContractError } from "@/lib/format";
import { EXPLORERS, useToast } from "@/providers/ToastProvider";
import { useWallet } from "@/providers/WalletProvider";

export type TxState =
  | { status: "idle" }
  | { status: "pending"; message: string }
  /** tx mined OK — đã miner confirm 1 block mới coi thành công (tx.wait()) */
  | { status: "success"; message: string; hash?: string }
  | { status: "error"; message: string };

export function useTx() {
  const toast = useToast();
  const { chainId } = useWallet();
  const [state, setState] = useState<TxState>({ status: "idle" });

  /**
   * `fn` trả về là "call gửi tx" — dùng contract đã connect signer.
   * Hook tự lo: set pending, đợi `.wait()`, toast kết quả, map lỗi.
   */
  const run = useCallback(
    async (
      message: string,
      fn: () => Promise<ContractTransactionResponse>,
    ): Promise<string | null> => {
      setState({ status: "pending", message });
      const t = toast.push({ kind: "pending", message: `${message} — đang gửi...` });
      try {
        const tx = await fn();
        const hash = typeof tx.hash === "string" ? tx.hash : undefined;
        if (t) toast.dismiss(t.id); // drop spinner toast
        setState({ status: "pending", message: "Chờ miner xác nhận..." });
        const receipt = await tx.wait();
        if (receipt?.status === 0) {
          // tx mined nhưng reverted — hiếm, vẫn coi như lỗi
          setState({ status: "error", message: `${message} — reverted (status 0)` });
          toast.push({
            kind: "error",
            message: `${message} — giao dịch reverted`,
          });
          return null;
        }
        setState({
          status: "success",
          message: `${message} — thành công`,
          hash,
        });
        // Báo cho các widget stats (StatStrip/pages) refresh dữ liệu on-chain
        window.dispatchEvent(new Event("bank:tx-ok"));
        toast.push({
          kind: "success",
          message: `${message} — thành công`,
          hash,
          explorer: chainId !== null ? EXPLORERS[chainId] : "",
        });
        return hash ?? `${message} — OK (block ${receipt?.blockNumber})`;
      } catch (err: unknown) {
        if (t) toast.dismiss(t.id); // lỗi ngay lúc gửi — xoá spinner "đang gửi..." (kết quả có rồi thì quá trình phải đi)
        const friendly = mapContractError(err);
        let msg = friendly ?? `${message} không thể hoàn tất`.trim();
        setState({ status: "error", message: msg });
        toast.push({ kind: "error", message: msg });
        return null;
      }
    },
    [toast, chainId],
  );

  const reset = useCallback(() => setState({ status: "idle" }), []);
  return { state, run, reset };
}
