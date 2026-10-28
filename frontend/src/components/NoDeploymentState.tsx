/**
 * NoDeploymentState — "empty state có hành động" cho chain allowed nhưng
 * chưa có contract (vd: vào /admin khi MetaMask đang ở Sepolia mà chưa deploy).
 * Thay cho câu text lơ lửng (anti-pattern dead-end): card context + action.
 */
import { AlertTriangle, RefreshCw, LoaderCircle } from "lucide-react";
import { useWallet } from "@/providers/WalletProvider";
import HardhatKeyImport from "@/components/HardhatKeyImport";
import { useLang } from "@/lib/i18n";

const CHAIN_LABEL: Record<number, string> = {
  31337: "Hardhat Local",
  11155111: "Sepolia Testnet",
};

export default function NoDeploymentState({ page }: { page: string }) {
  const { chainId, hasWallet } = useWallet();
  const { t } = useLang();

  /* NHÁNH 1 — trình duyệt chưa có ví web3 nào: */
  if (!hasWallet) {
    return (
      <div className="card max-w-2xl mx-auto mt-10" role="status">
        <h2 className="font-display text-lg">{t("wallet.noDetected")}</h2>
        <p className="text-sm text-subtle mt-1">
          {t("wallet.installHint1")} <strong className="text-txt">MetaMask</strong> {t("wallet.installHint2")}{" "}
          “{t("wallet.connectBtn")}” {t("wallet.installHint3")}
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
          <span className="text-sm text-subtle">{t("wallet.reading")}</span>
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
          <h2 className="font-display text-lg">{t("nodeploy.title", { page })}</h2>
          <p className="text-sm text-subtle mt-1">
            {t("nodeploy.chainLine")}{" "}
            <strong className="num text-txt">{chainId ?? "—"}</strong>
            {chainId !== null && CHAIN_LABEL[chainId] ? ` (${CHAIN_LABEL[chainId]})` : ""}{" "}
            {t("nodeploy.deployments")}{" "}
            <strong className="text-primary">31337 (local)</strong> và{" "}
            <strong className="text-primary">{t("nodeploy.sepoliaNote")}</strong>.
          </p>
        </div>
      </div>

      <p className="text-sm text-subtle mt-4">
        {t("nodeploy.switchHint")} <strong className="text-txt">{t("nodeploy.switchHintPill")}</strong>{" "}
        {t("nodeploy.switchHintModal")}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn btn-outline" onClick={() => window.location.reload()}>
          <RefreshCw size={14} className="mr-1 inline" /> {t("common.reload")}
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
