/**
 * HardhatKeyImport — hướng dẫn import private key Hardhat (account #0/#1) cho
 * mạng local 31337. Dùng chung bởi:
 *   - NoDeploymentState (empty-state, dạng <details> co giãn)
 *   - NetworkModal     (modal chọn mạng — hiện khi đang ở local, defaultOpen)
 * Key là giá trị mặc định công khai của Hardhat — chỉ dùng demo local.
 */
import { useState } from "react";
import { KeyRound } from "lucide-react";
import { HARDHAT_ACCOUNTS } from "@/lib/accounts";

export default function HardhatKeyImport({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [copied, setCopied] = useState<number | null>(null);

  return (
    <details open={defaultOpen} className="text-sm">
      <summary className="cursor-pointer text-subtle hover:text-txt inline-flex items-center gap-1">
        <KeyRound size={14} /> Account ví không có tiền local? Import key Hardhat
      </summary>
      <ol className="mt-2 space-y-2 list-decimal list-inside text-subtle">
        <li>
          MetaMask → <strong>Import account</strong> (chọn Private key) → dán key của account #0 hoặc
          #1 bên dưới.
        </li>
        <li>Kiểm tra network của MetaMask phải là <strong>Hardhat Local 31337</strong>.</li>
      </ol>
      <div className="mt-3 space-y-2">
        {HARDHAT_ACCOUNTS.map((a) => (
          <div key={a.index} className="rounded-lg bg-bg/60 border border-line p-3 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono">
                #{a.index} {a.address}
              </span>
              <button
                type="button"
                className="btn btn-outline !py-0.5 !px-2 text-[11px] cursor-pointer"
                onClick={() => {
                  void navigator.clipboard.writeText(a.key);
                  setCopied(a.index);
                  window.setTimeout(() => setCopied(null), 1500);
                }}
              >
                {copied === a.index ? "Đã copy ✔" : "Copy private key"}
              </button>
            </div>
            <div className="text-subtle mt-1">{a.role}</div>
          </div>
        ))}
        <p className="text-[11px] text-subtle">Key mặc định của Hardhat — chỉ dùng demo local, không phải tài sản thật.</p>
      </div>
    </details>
  );
}
