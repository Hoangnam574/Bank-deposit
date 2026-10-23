// ═══════════════════════════════════════════════════════════════════
// Bank Deposit DApp — Ignition module variant AT190234 (T5.1)
// ═══════════════════════════════════════════════════════════════════
// Deploy chọn lọc 3 contract theo thứ tự phụ thuộc:
//   MockUSDC (token, 6 decimals)  →  VaultManager (giữ/token + owed
//   interest)  →  SavingCore (nghiệp vụ tiết kiệm)  →  vault.setSavingCore
//
// Trả về addresses để Ignition ghi vào
//   ignition/deployments/chain-<chainId>/deployed_addresses.json
// — các script (seed/bot/exportFrontend) đọc từ file này.
//
// Chạy:
//   npx hardhat ignition deploy ignition/modules/BankDeposit.ts --network localhost
// Đổi feeReceiver (optional):
//   npx hardhat ignition deploy ... --parameters '{"BankDepositModule":{"feeReceiverAddress":"0x..."}}'
// ═══════════════════════════════════════════════════════════════════

import { buildModule } from "@nomicfoundation/ignition-core";

export default buildModule("BankDepositModule", (m) => {
  const deployer = m.getAccount(0);

  // Mặc định: feeReceiver = deployer (penalty key đơn giản cho demo).
  const feeReceiver = m.getParameter("feeReceiverAddress", deployer);

  // 1) Token — decimals() = 6 (giống USDC thật).
  const usdc = m.contract("MockUSDC");

  // 2) Vault — constructor(token, feeReceiver).
  const vault = m.contract("VaultManager", [usdc, feeReceiver]);

  // 3) Core — constructor(token, vault). SavingCore đọc isPaused qua
  //    interface IVaultManager nên VÀO đây luôn sau khi Vault available.
  const savingCore = m.contract("SavingCore", [usdc, vault]);

  // 4) Wire: Vault lắng nghe SavingCore cho setPaused / owed accounting.
  m.call(vault, "setSavingCore", [savingCore]);

  return { usdc, vault, savingCore };
});
