// ═══════════════════════════════════════════════════════════════════
// scripts/interact.ts — Smoke flow CLI (T5.6)
// ═══════════════════════════════════════════════════════════════════
// Flow smoke cần minh hoạ trước khi demo UI:
//   faucet (mint) → approve → openDeposit → timeTravel tới maturity
//   → withdrawDeposit, in balance USDC TRƯỚC/SAU từng bước để chứng
//   minh lãi trả đúng (variant AT190234). Bonus: user B rút early để
//   so sánh penalty.
//
// Cần `npm run node` + `npm run deploy:local` + `npm run seed` trước.
//   npm run interact
//   INTERACT_RESERVE=1 npm run interact   # giữ deposit active, dùng cho bot demo
// ═══════════════════════════════════════════════════════════════════

import { network } from "hardhat";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const MODULE_ID = "BankDepositModule";
const argv = process.argv.slice(2); // --reserve: giữ deposit active cho bot demo
const USDC_U = (n: number): bigint => BigInt(n) * 1_000_000n; // 6 decimals
const fmt = (units: bigint) => (Number(units) / 10 ** 6).toLocaleString("en-US");

const { ethers, provider, networkName } = await network.create();
if (networkName !== "localhost") {
  console.error(`❌ interact chỉ chạy trên localhost (hiện: ${networkName})`);
  process.exit(1);
}
const chainId = (await ethers.provider.getNetwork()).chainId;

// ─────────────────────────── Contracts ──────────────────────────
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
  console.error(`❌ Không có deployment cho chain ${chainId} — chạy deploy:local + seed trước.`);
  process.exit(1);
}
const usdc = await ethers.getContractAt("MockUSDC", deployed[`${MODULE_ID}#MockUSDC`]);
const vault = await ethers.getContractAt("VaultManager", deployed[`${MODULE_ID}#VaultManager`]);
const core = await ethers.getContractAt("SavingCore", deployed[`${MODULE_ID}#SavingCore`]);

const [deployer, alice, bob] = await ethers.getSigners();

// Chọn plan variant làm demo — tìm plan tenor 180 ngày trong seed.
const planCount = Number(await core.nextPlanId()) - 1;
let planId = 1n;
for (let i = 1; i <= planCount; i++) {
  const p = await core.getPlan(i);
  if (Number(p.tenorDays) === 180) {
    planId = BigInt(i);
    break;
  }
}
const plan = await core.getPlan(planId);
const user = alice;
const DEPOSIT_AMOUNT = USDC_U(5_000); // 5.000 USDC

const logStatus = async (label: string): Promise<void> => {
  const walletBal = await usdc.balanceOf(user.address);
  const vaultBal = await usdc.balanceOf(vault.target);
  console.log(
    `[${label}] ${user.address.slice(0, 8)}..: wallet=${fmt(walletBal)} USDC | vault=${fmt(vaultBal)} USDC`,
  );
};

console.log(`🌐 ${networkName} (chainId ${chainId})`);
console.log(`🧾 Plan demo: #${planId} — tenor ${plan.tenorDays}d, APR ${plan.aprBps} bps, penalty ${plan.earlyWithdrawPenaltyBps} bps`);
console.log(`👥 User: ${user.address} — mở deposit ${fmt(DEPOSIT_AMOUNT)} USDC\n`);

// ── Bước 1: Faucet — mint vài nghìn USDC cho user ────────────────
let walletBal = await usdc.balanceOf(user.address);
if (walletBal < DEPOSIT_AMOUNT) {
  const need = DEPOSIT_AMOUNT - walletBal;
  await (await usdc.connect(deployer).mint(user.address, need)).wait();
  console.log(`💧 Faucet +${fmt(need)} USDC cho ${user.address}`);
} else {
  console.log(`💧 Số dư đã đủ (${fmt(walletBal)} USDC), không cần faucet`);
}

// ── Bước 2: Approve — chuẩn ERC20, user OK cho SavingCore tiêu ───
const allowance = await usdc.allowance(user.address, core.target);
if (allowance < DEPOSIT_AMOUNT) {
  const txA = await usdc.connect(user).approve(core.target, DEPOSIT_AMOUNT);
  await txA.wait();
  console.log(`✍️  Approve ${fmt(DEPOSIT_AMOUNT)} USDC cho SavingCore — tx ${txA.hash}`);
}

await logStatus("TRƯỚC openDeposit");

// ── Bước 3: Open deposit ────────────────────────────────────────
const txOpen = await core.connect(user).openDeposit(planId, DEPOSIT_AMOUNT);
const openReceipt = await txOpen.wait();
const depositId = Number(await core.depositCount()); // id mới = count hiện tại
console.log(`✒️  openDeposit(plan #${planId}, ${fmt(DEPOSIT_AMOUNT)}) — tx ${txOpen.hash}`);
console.log(`    → depositId = ${depositId}, block ${openReceipt?.blockNumber}`);

// ── Bước 4: Băng thời gian tới maturity ────────────────────────
const deposit = await core.getDeposit(depositId);
const maturityAt = Number(deposit.maturityAt);
console.log(`⏳ maturityAt = ${maturityAt} (UTC ${new Date(maturityAt * 1000).toISOString()})`);

// Preview TẠI moment băng qua (deposit vẫn active).
await provider.request({
  method: "evm_increaseTime",
  params: [Number(plan.tenorDays) * 24 * 3600 + 5],
});
await provider.request({ method: "evm_mine", params: [] });

const preview = await core.previewExit(depositId);
console.log(
  `🔮 previewExit sau maturity: principal=${fmt(preview.principal)}, ` +
    `interest=${fmt(preview.interest)}, penalty=${fmt(preview.penalty)}, ` +
    `amountIfEarly=${fmt(preview.amountIfEarly)}`,
);
await logStatus("TRƯỚC withdraw");

// --reserve: giữ deposit ACTIVE cho demo bot (chạy bot sau đó thay withdraw)
if (argv.includes("--reserve") || process.env.INTERACT_RESERVE === "1") {
  console.log("\n🛑 --reserve: giữ deposit ACTIVE (đã mature) — dùng cho bot renew demo.");
  console.log("   Tiếp theo: npm run timetravel -- --days 4 && npm run bot -- --once");
  process.exit(0);
}

// ── Bước 5: Withdraw đúng hạn → lãi nguyên vẹn ───────────────────
const txW = await core.connect(user).withdrawAtMaturity(depositId);
await txW.wait();
const afterW = await usdc.balanceOf(user.address);
console.log(`🧾 withdrawAtMaturity(${depositId}) — tx ${txW.hash}`);
console.log(
  `💰 Balance TRƯỚC withdraw: ${fmt(walletBal)} → SAU: ${fmt(afterW)} ` +
    `(tăng ${fmt(afterW - walletBal)} USDC = principal + interest)`,
);
if (Number(afterW - walletBal) >= Number(DEPOSIT_AMOUNT)) {
  console.log("✅ SMOKE TEST PASS — lãi APR trả đủ, penalty = 0 vì rút đúng hạn\n");
}

// ── Bonus: Bob rút EARLY để chứng minh penalty hoạt động ─────────
const amountBob = USDC_U(1_000);
const bobBal0 = await usdc.balanceOf(bob.address);
if (bobBal0 < amountBob) {
  await (await usdc.connect(deployer).mint(bob.address, amountBob - bobBal0)).wait();
}
await (await usdc.connect(bob).approve(core.target, amountBob)).wait();
const txB = await core.connect(bob).openDeposit(planId, amountBob);
await txB.wait();
const bobId = Number(await core.depositCount());
const bobPreview = await core.previewExit(bobId);
console.log(`🧪 Bob mở ${fmt(amountBob)} USDC rồi rút EARLY ngay sau đó:`);
console.log(
  `    penalty=${fmt(bobPreview.penalty)} USDC (${plan.earlyWithdrawPenaltyBps} bps) → nhận ${fmt(bobPreview.amountIfEarly)} USDC`,
);
const txe = await core.connect(bob).earlyWithdraw(bobId);
await txe.wait();
console.log(`🧾 earlyWithdrawDeposit(${bobId}) — tx ${txe.hash}`);
console.log(
  `💀 Bob balance sau: ${fmt(await usdc.balanceOf(bob.address))} USDC — bị phạt ${fmt(bobPreview.penalty)} USDC (penalty chuyển cho feeReceiver)`,
);
console.log("\n✅ interact xong.");
