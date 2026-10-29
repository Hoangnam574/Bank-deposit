// ═══════════════════════════════════════════════════════════════════
// scripts/bot.ts — Auto-renew bot (T5.3)
// ═══════════════════════════════════════════════════════════════════
// Vòng lặp: quét toàn bộ deposit → deposit nào canAutoRenew(id)
// (đã quá grace period) → gọi autoRenewDeposit(id). Hàm này permissionless
// (ai cũng được gọi thay user), bot chỉ là "thợ quét" thay user bấm nút.
// Lỗi TỪNG deposit không làm chết vòng lặp chính.
//
// Chạy (trước đó cần `npm run node` và `deploy:local` + `seed`):
//   BOT_DRY_RUN=1 npm run bot      # chỉ log, không gửi tx
//   POLL_INTERVAL_SECONDS=5 npm run bot  # cycle 5 giây
//   BOT_ONCE=1 npm run bot         # quét 1 cycle rồi thoát (debug)
// ═══════════════════════════════════════════════════════════════════

import dotenv from "dotenv";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { network } from "hardhat";

// ──────────────────────────── config & env ────────────────────────
const envFile =
  process.env.ENV_FILE ||
  (process.env.npm_lifecycle_event === "start:day1" ? ".env.sepolia-day1" : undefined) ||
  (process.env.npm_lifecycle_event === "start:day86400" ? ".env.sepolia-day86400" : undefined);
if (envFile) {
  dotenv.config({ path: envFile, override: true });
} else {
  dotenv.config();
}

const MODULE_ID = "BankDepositModule";
const DECIMALS = 6;
const fmt = (units: bigint) => (Number(units) / 10 ** DECIMALS).toLocaleString("en-US");

// ──────────────────────────── flags (env var) ────────────────────
const isDryRun = process.env.BOT_DRY_RUN === "1";
const isOnce = process.env.BOT_ONCE === "1";

// ──────────────────────────── contracts ──────────────────────────
const { ethers, networkName, provider } = await network.create();
const chainId = (await ethers.provider.getNetwork()).chainId;
const [bot] = await ethers.getSigners();

// 4. Cập nhật ABI mới từ artifacts. Địa chỉ contract, DEPLOY_BLOCK đọc từ env.
const artifactPath = join(process.cwd(), "artifacts", "contracts", "SavingCore.sol", "SavingCore.json");
let savingCoreAbi: unknown[];
try {
  const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
  savingCoreAbi = artifact.abi;
} catch {
  // fallback nếu không đọc trực tiếp từ artifacts
}

let coreAddr = process.env.SAVING_CORE_ADDRESS || process.env.CORE_ADDRESS;
if (!coreAddr) {
  try {
    const addressesFile = join(
      process.cwd(),
      "ignition",
      "deployments",
      `chain-${chainId}`,
      "deployed_addresses.json",
    );
    const deployed = JSON.parse(await readFile(addressesFile, "utf8"));
    coreAddr = deployed[`${MODULE_ID}#SavingCore`];
  } catch {
    // ignore
  }
}

if (!coreAddr) {
  console.error(`❌ Không tìm thấy địa chỉ SavingCore (từ env SAVING_CORE_ADDRESS hoặc ignition deployments cho chain ${chainId})`);
  process.exit(1);
}

const deployBlock = process.env.DEPLOY_BLOCK ? Number(process.env.DEPLOY_BLOCK) : 0;
const core = savingCoreAbi ? new ethers.Contract(coreAddr, savingCoreAbi, bot) : await ethers.getContractAt("SavingCore", coreAddr);

// 2. Cache các giá trị đọc từ contract khi khởi động:
// DAY_SECONDS(), GRACE_PERIOD(), EMERGENCY_DELAY(), YEAR_SECONDS()
const [daySeconds, gracePeriod, emergencyDelay, yearSeconds] = await Promise.all([
  core.DAY_SECONDS().then(Number).catch(() => 86400),
  core.GRACE_PERIOD().then(Number).catch(() => 259200),
  core.EMERGENCY_DELAY().then(Number).catch(() => 604800),
  core.YEAR_SECONDS().then(Number).catch(() => 31536000),
]);

// 3. Interval quét lấy từ env POLL_INTERVAL_SECONDS (5 cho bản DAY_SECONDS=1, 300 cho bản 86400)
const defaultInterval = daySeconds === 1 ? 5 : 300;
const intervalSec = process.env.POLL_INTERVAL_SECONDS
  ? Number(process.env.POLL_INTERVAL_SECONDS) || defaultInterval
  : process.env.BOT_EVERY
  ? Number(process.env.BOT_EVERY) || defaultInterval
  : defaultInterval;

console.log(`🤖 Auto-renew bot | network=${networkName} (chainId ${chainId}) | bot=${bot.address}`);
console.log(`   SavingCore: ${coreAddr} | mode=${isDryRun ? "DRY-RUN" : "LIVE"} | interval=${intervalSec}s (DEPLOY_BLOCK=${deployBlock})${isOnce ? " | once" : ""}`);
console.log(`   Contract cached: DAY_SECONDS=${daySeconds}s, GRACE_PERIOD=${gracePeriod}s, EMERGENCY_DELAY=${emergencyDelay}s, YEAR_SECONDS=${yearSeconds}s`);
console.log(`   Logic: quét canAutoRenew(depositId) từ contract → gọi autoRenewDeposit(id)\n`);

// ──────────────────────────── 1 cycle quét ───────────────────────
async function runOneCycle(): Promise<{ found: number; renewed: number }> {
  let found = 0;
  let renewed = 0;

  const block = await ethers.provider.getBlock("latest");
  console.log(`[block ${block?.number}] Bắt đầu cycle quét...`);

  const count = Number(await core.depositCount());
  if (count === 0) {
    console.log("   (chưa có deposit nào)");
    return { found, renewed };
  }

  // Bước 1: view scan (rẻ) — dùng trực tiếp canAutoRenew(id) từ contract.
  const pending: { id: bigint; owner: string; principal: bigint; aprAtOpen: bigint; startAt: bigint; maturityAt: bigint }[] = [];
  for (let id = 1; id <= count; id++) {
    try {
      if (!(await core.canAutoRenew(id))) continue;
      const info = await core.getDeposit(id);
      pending.push({
        id: BigInt(id),
        owner: await core.ownerOf(id),
        principal: info.principal,
        aprAtOpen: info.aprBpsAtOpen,
        startAt: info.startAt,
        maturityAt: info.maturityAt,
      });
    } catch (err: unknown) {
      // deposit đơn lẻ lỗi đọc — tiếp tục id khác, không chết loop.
      console.warn(`   ⚠️  Đọc deposit #${id} lỗi (bỏ qua): ${String(err).slice(0, 140)}`);
    }
  }
  found = pending.length;

  if (found === 0) {
    console.log(`   ✓ Đã quét ${count} deposit — không có deposit nào đủ điều kiện auto-renew`);
    return { found, renewed };
  }

  console.log(`   🎯 Phát hiện ${found} deposit đủ điều kiện auto-renew — xử lý:`);

  // Bước 2: gửi tx autoRenewDeposit — lỗi từng deposit không cản deposit khác.
  for (const p of pending) {
    const label = `#${p.id} (owner ${p.owner}, principal ${fmt(p.principal)} USDC, APR ${p.aprAtOpen} bps, maturityAt ${p.maturityAt})`;
    if (isDryRun) {
      console.log(`   [DRY-RUN] Sẽ gọi autoRenewDeposit(${p.id}) — ${label}`);
      continue;
    }
    try {
      const tx = await core.connect(bot).autoRenewDeposit(p.id);
      const receipt = await tx.wait();
      const logCount = receipt.logs.filter(
        (l: { address?: string }) => (l.address ?? "").toLowerCase() === coreAddr.toLowerCase(),
      ).length;
      console.log(`   ✅ Renewed ${label} — tx ${tx.hash} (block ${receipt.blockNumber}, core logs ${logCount})`);
      renewed++;
    } catch (err: unknown) {
      console.warn(`   ⚠️  autoRenewDeposit(${p.id}) lỗi (bỏ qua): ${String(err).slice(0, 180)}`);
    }
  }
  return { found, renewed };
}

// ──────────────────────────── vòng chính ─────────────────────────
for (;;) {
  try {
    const { renewed } = await runOneCycle();
    console.log(`   — cycle xong: renewed ${renewed} —\n`);
  } catch (err: unknown) {
    // Lỗi toàn cục (mạng rớt, RPC...) — chờ rồi thử lại.
    console.error(`💥 Lỗi cycle (sẽ thử lại sau ${intervalSec}s): ${String(err).slice(0, 200)}\n`);
  }

  if (isOnce) {
    console.log("👋 Chế độ --once — thoát sau 1 cycle");
    process.exit(0);
  }
  await new Promise((resolve) => setTimeout(resolve, intervalSec * 1000));
}
