// ═══════════════════════════════════════════════════════════════════
// scripts/seed.ts — Seed dữ liệu demo sau khi deploy (T5.2)
// ═══════════════════════════════════════════════════════════════════
// Chạy MỘT lần sau `deploy:local` (idempotent — chạy lại không tạo
// bản sao): tạo 4 plan, fund vault, mint USDC cho user demo.
//   npm run seed        (từ thư mục gốc)
//
// 4 plan (variant cá nhân AT190234 đứng đầu):
//   #1 180d / 300 bps / penalty 450 bps   ← variant: grace 3 ngày
//   #2  30d / 250 bps / penalty 500 bps
//   #3  90d / 350 bps / penalty 400 bps
//   #4 365d / 500 bps / penalty 600 bps
// ═══════════════════════════════════════════════════════════════════

import { network } from "hardhat";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const MODULE_ID = "BankDepositModule";
const DECIMALS = 6;
const USDC = (n: number | bigint): bigint => BigInt(n) * 1_000_000n;
const fmt = (units: bigint): string =>
  (Number(units) / 10 ** DECIMALS).toLocaleString("en-US", { maximumFractionDigits: 2 });

type PlanSeed = {
  tenorDays: number;
  aprBps: number;
  minDeposit: number; // đơn vị: USDC thường
  maxDeposit: number; // 0 = không giới hạn
  penaltyBps: number;
};

const PLANS: PlanSeed[] = [
  { tenorDays: 180, aprBps: 300, minDeposit: 100, maxDeposit: 50_000, penaltyBps: 450 },
  { tenorDays: 30, aprBps: 250, minDeposit: 50, maxDeposit: 10_000, penaltyBps: 500 },
  { tenorDays: 90, aprBps: 350, minDeposit: 200, maxDeposit: 25_000, penaltyBps: 400 },
  { tenorDays: 365, aprBps: 500, minDeposit: 500, maxDeposit: 100_000, penaltyBps: 600 },
];

const VAULT_TARGET = USDC(500_000);
const USER_TARGETS: { name: string; idx: number; target: bigint }[] = [
  { name: "deployer", idx: 0, target: USDC(100_000) },
  { name: "alice (demo)", idx: 1, target: USDC(10_000) },
  { name: "bob (demo)", idx: 2, target: USDC(10_000) },
];

// ────────────────────────────── main ──────────────────────────────

const { ethers, networkName } = await network.create();
const chainId = (await ethers.provider.getNetwork()).chainId;

// 1) Đọc addresses từ Ignition deployment
const addressesFile = join(
  process.cwd(),
  "ignition",
  "deployments",
  `chain-${chainId}`,
  "deployed_addresses.json",
);
let deployed: Record<string, string>;
try {
  deployed = JSON.parse(await readFile(addressesFile, "utf8"));
} catch {
  console.error(`❌ Không tìm thấy deployment cho chain ${chainId}:`);
  console.error(`   ${addressesFile}`);
  console.error("   → Chạy trước: npm run deploy:local");
  process.exit(1);
}

const usdc = await ethers.getContractAt("MockUSDC", deployed[`${MODULE_ID}#MockUSDC`]);
const vault = await ethers.getContractAt("VaultManager", deployed[`${MODULE_ID}#VaultManager`]);
const core = await ethers.getContractAt("SavingCore", deployed[`${MODULE_ID}#SavingCore`]);
const owner = await vault.owner();
console.log(`🌐 Network: ${networkName} (chainId ${chainId})`);
console.log(`MockUSDC   : ${deployed[`${MODULE_ID}#MockUSDC`]}`);
console.log(`Vault      : ${deployed[`${MODULE_ID}#VaultManager`]}`);
console.log(`SavingCore : ${deployed[`${MODULE_ID}#SavingCore`]}`);

const signers = await ethers.getSigners();
const deployer = signers[0];
console.log(`Deployer   : ${deployer.address}`);

// 2) 4 plan — idempotent: SKIP if plan cùng (tenor, apr, penalty) đã tồn tại
const planCount = Number(await core.nextPlanId()) - 1; // nextPlanId bắt đầu ở 1
const existing: PlanSeed[] = [];
for (let i = 1; i <= planCount; i++) {
  const p = await core.getPlan(i);
  existing.push({ tenorDays: Number(p.tenorDays), aprBps: Number(p.aprBps), minDeposit: 0, maxDeposit: 0, penaltyBps: Number(p.earlyWithdrawPenaltyBps) });
}

let created = 0;
for (const seed of PLANS) {
  const dup = existing.some(
    (p) => p.tenorDays === seed.tenorDays && p.aprBps === seed.aprBps && p.penaltyBps === seed.penaltyBps,
  );
  if (dup) {
    console.log(`⏭️  Plan ${seed.tenorDays}d / ${seed.aprBps} bps đã tồn tại — skip`);
    continue;
  }
  const tx = await core
    .connect(deployer)
    .createPlan(
      seed.tenorDays,
      seed.aprBps,
      USDC(seed.minDeposit),
      USDC(seed.maxDeposit),
      seed.penaltyBps,
    );
  await tx.wait();
  created++;
  console.log(`✅ Created plan ${seed.tenorDays}d / APR ${seed.aprBps} bps / penalty ${seed.penaltyBps} bps`);
}
if (created === 0 && planCount <= 0) console.log("⚠️  Không có plan nào — kiểm tra lại seed");

console.log("---");
console.log(`📦 Tổng plan hiện có: ${planCount} (muốn ${PLANS.length})`);

// 3) Mint USDC cho deployer + 2 user demo (top-up lên target, idempotent)
for (const { name, idx, target } of USER_TARGETS) {
  const s = signers[idx];
  const bal = await usdc.balanceOf(s.address);
  if (bal >= target) {
    console.log(`⏭️  ${name} đã có ${fmt(bal)} USDC (≥ target) — skip`);
    continue;
  }
  const need = target - bal;
  await (await usdc.connect(deployer).mint(s.address, need)).wait();
  console.log(`✅ Mint ${fmt(need)} USDC cho ${name} (${s.address}) → tổng ${fmt(target)}`);
}

// 4) Fund vault lên 500k USDC (lãi để trả user) — idempotent
const vaultBal = await usdc.balanceOf(vault.target);
const coreObservation = await vault.getVaultBalance(); // phần "vật chất" trong vault
console.log(`🏦 Vault trước khi fund: ${fmt(vaultBal)} USDC (getVaultBalance = ${fmt(coreObservation)} USDC)`);
if (vaultBal < VAULT_TARGET) {
  const need = VAULT_TARGET - vaultBal;
  await (await usdc.connect(deployer).mint(deployer.address, need)).wait();
  await (await usdc.connect(deployer).approve(vault.target, need)).wait();
  await (await vault.connect(deployer).fundVault(need)).wait();
  console.log(`✅ Fund vault +${fmt(need)} USDC → ${fmt(VAULT_TARGET)}`);
} else {
  console.log("⏭️  Vault đã đủ 500.000 USDC — skip");
}

// 5) Bảng tóm tắt
const finalVault = await usdc.balanceOf(vault.target);
const totalOwed = await vault.totalOwedInterest();
const finalPlans = Number(await core.nextPlanId()) - 1;
const table = [
  ["Token decimals", "6 (giống USDC thật)"],
  ["Plans", `${finalPlans}`],
  ["Vault balance", `${fmt(finalVault)} USDC`],
  ["Vault totalOwedInterest", `${fmt(totalOwed)} USDC`],
  ["Vault available", `${fmt(finalVault - totalOwed)} USDC`],
];
console.log("\n📋 TÓM TẮT");
for (const [k, v] of table) console.log(`  ${k.padEnd(26)} ${v}`);
console.log(`\n🎉 Seed xong. Bước tiếp: npm run interact hoặc npm run bot`);
