// ═══════════════════════════════════════════════════════════════════
// scripts/timeTravel.ts — Băng thời gian chỉ dành cho local (T5.5)
// ═══════════════════════════════════════════════════════════════════
// Dùng evm_increaseTime + evm_mine để demo maturity trong 1 phút.
// KHÔNG chạy trên sepolia/mainnet (guard theo networkName).
//
//   TT_DAYS=181 npm run timetravel      # qua 181 ngày
//   TT_SECONDS=3600 npm run timetravel  # qua 1 giờ
//   TT_TO=1820000000 npm run timetravel # nhảy tới timestamp (unix)
// ═══════════════════════════════════════════════════════════════════

import { network } from "hardhat";

// `hardhat run` không nhận CLI flag ngoài → cấu hình qua env var.
const days = process.env.TT_DAYS ? Number(process.env.TT_DAYS) : undefined;
const seconds = process.env.TT_SECONDS ? Number(process.env.TT_SECONDS) : undefined;
const to = process.env.TT_TO ? Number(process.env.TT_TO) : undefined;

if (days === undefined && seconds === undefined && to === undefined) {
  console.error("❌ Thiếu tham số. Dùng env: TT_DAYS=<ngày> | TT_SECONDS=<giây> | TT_TO=<unix ts>");
  process.exit(1);
}

const { ethers, networkName, provider } = await network.create();
if (networkName !== "localhost" && networkName !== "hardhatNetwork" && networkName !== "hardhat") {
  console.error(`❌ timeTravel CHỈ dùng local (network ${networkName} không cho phép).`);
  console.error("   → Chạy lại với: --network localhost");
  process.exit(1);
}

const before = Number((await ethers.provider.getBlock("latest"))?.timestamp ?? 0);

// evm_increaseTime nhận số giây tăng thêm (bigint-safe vì < 2^53).
const deltaSec =
  days !== undefined ? days * 24 * 3600 : seconds !== undefined ? seconds : undefined;

if (deltaSec !== undefined) {
  if (deltaSec <= 0) {
    console.error("❌ Khoảng thời gian phải > 0");
    process.exit(1);
  }
  await provider.request({ method: "evm_increaseTime", params: [deltaSec] });
  await provider.request({ method: "evm_mine", params: [] });
  console.log(`⏩ Băng thời gian +${deltaSec}s (${days !== undefined ? `${days} ngày` : `${seconds}s`})`);
} else if (to !== undefined) {
  await provider.request({ method: "evm_setNextBlockTimestamp", params: [to] });
  await provider.request({ method: "evm_mine", params: [] });
  console.log(`⏩ Nhảy tới unix timestamp ${to}`);
}

const after = Number((await ethers.provider.getBlock("latest"))?.timestamp ?? 0);
console.log(`   block.timestamp: ${before} → ${after} (Δ ${after - before}s)`);
console.log(`   ≈ ${(Number(after) / 86_400).toFixed(1)} ngày kể từ epoch`);
