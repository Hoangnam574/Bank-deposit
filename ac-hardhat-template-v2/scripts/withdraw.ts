// ═══════════════════════════════════════════════════════════════════
// scripts/withdraw.ts — Rút deposit qua CLI (trợ giúp gate P5)
// ═══════════════════════════════════════════════════════════════════
// Flow gate: ... → bot renew (#1 closed → #2) → băng tới maturity #2
// → rút #2 bằng script này, chứng minh chain "không thao tác tay".
//
// Env vars (`hardhat run` không nhận CLI flag ngoài):
//   WITHDRAW_ID=2   npm run withdraw    # rút 1 deposit cụ thể
//   WITHDRAW_ALL=1  npm run withdraw    # rút mọi deposit ACTIVE &
//                                       #  đã mature của signer #1
//   WITHDRAW_OWNER=2 WITHDRAW_ALL=1 ... # signer khác (2 = bob)
// ═══════════════════════════════════════════════════════════════════

import { network } from "hardhat";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const MODULE_ID = "BankDepositModule";
const STATUS_ACTIVE = 0; // uint enum DepositStatus{Active, Withdrawn, EarlyWithdrawn, AutoRenewed}
const fmt = (units: bigint) => (Number(units) / 10 ** 6).toLocaleString("en-US");

const argv = process.argv.slice(2);
const wantAll = argv.includes("--all") || process.env.WITHDRAW_ALL === "1";
const idEnv = process.env.WITHDRAW_ID ? Number(process.env.WITHDRAW_ID) : undefined;
const signerIndex = process.env.WITHDRAW_OWNER ? Number(process.env.WITHDRAW_OWNER) || 1 : 1;

const { ethers, provider, networkName } = await network.create();
if (networkName !== "localhost") {
  console.error(`❌ withdraw chỉ chạy trên localhost (hiện: ${networkName})`);
  process.exit(1);
}
const chainId = (await ethers.provider.getNetwork()).chainId;

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
  console.error(`❌ Không có deployment (chain ${chainId}) — chạy deploy:local + seed trước.`);
  process.exit(1);
}
const usdc = await ethers.getContractAt("MockUSDC", deployed[`${MODULE_ID}#MockUSDC`]);
const core = await ethers.getContractAt("SavingCore", deployed[`${MODULE_ID}#SavingCore`]);

const signer = (await ethers.getSigners())[signerIndex];
const depositCount = Number(await core.depositCount());

async function nowTs(): Promise<number> {
  const b = await ethers.provider.getBlock("latest");
  return Number(b?.timestamp ?? 0);
}

/* ── Chọn deposit cần rút: WITHDRAW_ID=<n> hoặc quét toàn bộ (lọc
     deposit của signer + Active + đã mature; id đóng bị burn →
     ownerOf revert — bắt lỗi và bỏ qua) ── */
const targets: bigint[] = [];
if (idEnv !== undefined) {
  if (!Number.isInteger(idEnv) || idEnv < 1 || idEnv > depositCount) {
    console.error(`❌ deposit id ${idEnv} không hợp lệ (count = ${depositCount})`);
    process.exit(1);
  }
  targets.push(BigInt(idEnv));
} else {
  if (!wantAll) console.log("ℹ️  Không truyền WITHDRAW_ID/ALL — mặc định: rút mọi deposit active đã mature");
  for (let id = 1; id <= depositCount; id++) {
    try {
      const owner = await core.ownerOf(id);
      if (owner.toLowerCase() !== signer.address.toLowerCase()) continue;
      const d = await core.getDeposit(id);
      if (Number(d.status) !== STATUS_ACTIVE) continue;
      if ((await nowTs()) < Number(d.maturityAt)) continue; // chưa mature — bỏ qua
      targets.push(BigInt(id));
    } catch {
      // ownerOf revert = deposit đã burn (Withdrawn/EarlyWithdrawn) — skip.
    }
  }
}

if (targets.length === 0) {
  console.log(`ℹ️  Signer #${signerIndex} (${signer.address}) không có deposit active đã mature`);
  process.exit(0);
}

console.log(`🌐 ${networkName} (chainId ${chainId}) | signer ${signer.address}`);
console.log(`🎯 Chọn rút: ${targets.join(", ")}\n`);

for (const id of targets) {
  const bal0 = await usdc.balanceOf(signer.address);
  const preview = await core.previewExit(id);

  if (Number(preview.maturityAt) > (await nowTs())) {
    console.warn(`⚠️  #${id} chưa mature — withdraw sẽ revert SC_TooEarly; bỏ qua`);
    continue;
  }

  console.log(
    `→ Rút #${id}: principal=${fmt(preview.principal)}, interest=${fmt(preview.interest)}, penalty=${fmt(preview.penalty)}`,
  );
  try {
    const tx = await core.connect(signer).withdrawAtMaturity(id);
    await tx.wait();
    const increase = (await usdc.balanceOf(signer.address)) - bal0;
    console.log(`✅ #${id} — tx ${tx.hash} | +${fmt(increase)} USDC cho ${signer.address}`);
  } catch (err: unknown) {
    console.warn(`⚠️  Rút #${id} lỗi: ${String(err).slice(0, 180)}`);
  }
}

console.log("\n✅ withdraw xong.");
