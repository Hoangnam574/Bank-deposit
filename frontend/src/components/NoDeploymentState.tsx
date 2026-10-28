/**
 * NoDeploymentState — "empty state có hành động" cho chain allowed nhưng
 * chưa có contract (vd: vào /admin khi MetaMask đang ở Sepolia mà chưa deploy).
 * Thay cho câu text lơ lửng (anti-pattern dead-end): card context + action.
 */
import { AlertTriangle, RefreshCw, LoaderCircle } from "lucide-react";
import { useWallet } from "@/providers/WalletProvider";
import HardhatKeyImport from "@/components/HardhatKeyImport";

const CHAIN_LABEL: Record<number, string> = {
  31337: "Hardhat Local",
  11155111: "Sepolia Testnet",
};

export default function NoDeploymentState({ page }: { page: string }) {
  const { chainId, hasWallet } = useWallet();

  /* NHÁNH 1 — trình duyệt chưa có ví web3 nào: */
  if (!hasWallet) {
    return (
      <div className="card max-w-2xl mx-auto mt-10" role="status">
        <h2 className="font-display text-lg">Chưa phát hiện ví web3</h2>
        <p className="text-sm text-subtle mt-1">
          Cài đặt <strong className="text-txt">MetaMask</strong> (hoặc Rabby/OKX...) rồi bấm
          "Kết nối ví" ở góc phải header.
        </p>
      </div>
    );
  }

  /* NHÁNH 2 — có ví nhưng chainId chưa đọc được: trạng thái tạm thời vài trăm ms
     sau F5. KHÔNG render card "chưa có dữ liệu" ở đây để trang không nhá nháy
     thông báo sai trên mỗi lần F5. */
  if (chainId === null) {
    return (
      <div className="card max-w-2xl mx-auto mt-10" role="status">
        <div className="flex items-center gap-2">
          <LoaderCircle size={16} className="animate-spin text-subtle" />
          <span className="text-sm text-subtle">Đang đọc dữ liệu on-chain...</span>
        </div>
      </div>
    );
  }

  // NHÁNH 3 — chain đã rõ nhưng chain này không có deployment cho các contract.
  return (
    <div className="card max-w-2xl mx-auto mt-10 border-warn/40" role="alert">
      <div className="flex items-start gap-3">
        <AlertTriangle className="text-warn shrink-0 mt-0.5" size={22} />
        <div>
          <h2 className="font-display text-lg">Trang {page} chưa có dữ liệu contract</h2>
          <p className="text-sm text-subtle mt-1">
            Chain đang kết nối:{" "}
            <strong className="num text-txt">{chainId ?? "—"}</strong>
            {chainId !== null && CHAIN_LABEL[chainId] ? ` (${CHAIN_LABEL[chainId]})` : ""} — dapp chỉ có
            deployment trên <strong className="text-primary">31337 (local)</strong> và{" "}
            <strong className="text-primary">11155111 (Sepolia, nếu đã deploy)</strong>.
          </p>
        </div>
      </div>

      <p className="text-sm text-subtle mt-4">
        Đổi mạng: bấm <strong className="text-txt">pill tên mạng ở góc phải header</strong> để mở
        modal "Chọn mạng của bạn".
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn btn-outline" onClick={() => window.location.reload()}>
          <RefreshCw size={14} className="mr-1 inline" /> Reload trang
        </button>
      </div>

      {/* Hướng dẫn account Hardhat — CHỈ hiện khi đang mạng local 31337
          (key Hardhat không tồn tại trên Sepolia): */}
      {chainId === 31337 && (
        <div className="mt-4">
          <HardhatKeyImport defaultOpen={false} />
        </div>
      )}
    </div>
  );
}
