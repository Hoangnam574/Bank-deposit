// ═══════════════════════════════════════════════════════════════════
// scripts/verifyTimeParams.ts
// ═══════════════════════════════════════════════════════════════════
// Đọc DAY_SECONDS(), GRACE_PERIOD(), EMERGENCY_DELAY(), YEAR_SECONDS()
// từ địa chỉ contract SavingCore cấu hình trong env.
// Ném lỗi (throw) nếu giá trị trên chain không khớp với giá trị mong đợi.
//
// Cách chạy:
//   SAVING_CORE_ADDRESS=0x... EXPECTED_DAY_SECONDS=1 npx hardhat run scripts/verifyTimeParams.ts --network sepolia
// ═══════════════════════════════════════════════════════════════════

import { network } from "hardhat";
import * as dotenv from "dotenv";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

dotenv.config();

async function main() {
  const { ethers } = await network.create();
  const chainId = (await ethers.provider.getNetwork()).chainId;

  let savingCoreAddress = process.env.SAVING_CORE_ADDRESS || process.env.SAVING_CORE;

  // Nếu không truyền biến môi trường, tự tìm từ ignition deployments
  if (!savingCoreAddress) {
    try {
      const addressesPath = join(process.cwd(), "ignition", "deployments", `chain-${chainId}`, "deployed_addresses.json");
      const deployed = JSON.parse(await readFile(addressesPath, "utf8"));
      savingCoreAddress = deployed["BankDepositModule#SavingCore"];
    } catch {
      // fallback
    }
  }

  if (!savingCoreAddress) {
    throw new Error("❌ Không tìm thấy địa chỉ SavingCore. Hãy đặt biến SAVING_CORE_ADDRESS=0x...");
  }

  const core = await ethers.getContractAt("SavingCore", savingCoreAddress);

  console.log(`\n🔍 Kiểm tra SavingCore trên mạng chainId=${chainId} tại địa chỉ: ${savingCoreAddress}`);

  const [daySeconds, gracePeriod, emergencyDelay, yearSeconds] = await Promise.all([
    core.DAY_SECONDS(),
    core.GRACE_PERIOD(),
    core.EMERGENCY_DELAY(),
    core.YEAR_SECONDS(),
  ]);

  console.log(`- DAY_SECONDS:     ${daySeconds} giây`);
  console.log(`- GRACE_PERIOD:    ${gracePeriod} giây (${Number(gracePeriod) / Number(daySeconds)} "ngày")`);
  console.log(`- EMERGENCY_DELAY: ${emergencyDelay} giây (${Number(emergencyDelay) / Number(daySeconds)} "ngày")`);
  console.log(`- YEAR_SECONDS:    ${yearSeconds} giây\n`);

  if (daySeconds === 1n) {
    console.log("👉 ĐANG DÙNG BẢN: TEST (day1 — 1 ngày = 1 giây, grace = 3 giây)");
  } else if (daySeconds === 86400n) {
    console.log("👉 ĐANG DÙNG BẢN: CHUẨN (day86400 — 1 ngày = 86400 giây / 24h, grace = 3 ngày)");
  } else {
    console.log(`👉 ĐANG DÙNG BẢN TÙY BIẾN: 1 ngày = ${daySeconds} giây`);
  }

  // Nếu có truyền giá trị kỳ vọng thì mới kiểm tra chặt chẽ
  const expectedEnv = process.env.EXPECTED_DAY_SECONDS ?? process.env.DAY_SECONDS;
  if (expectedEnv !== undefined) {
    const expectedDaySeconds = BigInt(expectedEnv);
    const expectedGracePeriod = process.env.EXPECTED_GRACE_PERIOD
      ? BigInt(process.env.EXPECTED_GRACE_PERIOD)
      : 3n * expectedDaySeconds;
    const expectedEmergencyDelay = process.env.EXPECTED_EMERGENCY_DELAY
      ? BigInt(process.env.EXPECTED_EMERGENCY_DELAY)
      : 7n * expectedDaySeconds;
    const expectedYearSeconds = process.env.EXPECTED_YEAR_SECONDS
      ? BigInt(process.env.EXPECTED_YEAR_SECONDS)
      : 365n * expectedDaySeconds;

    if (daySeconds !== expectedDaySeconds) {
      throw new Error(`❌ DAY_SECONDS mismatch! Expected: ${expectedDaySeconds}, got: ${daySeconds}`);
    }
    if (gracePeriod !== expectedGracePeriod) {
      throw new Error(`❌ GRACE_PERIOD mismatch! Expected: ${expectedGracePeriod}, got: ${gracePeriod}`);
    }
    if (emergencyDelay !== expectedEmergencyDelay) {
      throw new Error(`❌ EMERGENCY_DELAY mismatch! Expected: ${expectedEmergencyDelay}, got: ${emergencyDelay}`);
    }
    if (yearSeconds !== expectedYearSeconds) {
      throw new Error(`❌ YEAR_SECONDS mismatch! Expected: ${expectedYearSeconds}, got: ${yearSeconds}`);
    }
    console.log("✅ Khớp 100% với giá trị kỳ vọng!");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

