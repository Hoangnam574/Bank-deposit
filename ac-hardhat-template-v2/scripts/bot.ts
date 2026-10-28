// ═══════════════════════════════════════════════════════════════════
// scripts/bot.ts — Auto-renew bot (T5.3)
// ═══════════════════════════════════════════════════════════════════
// Vòng lặp: quét toàn bộ deposit → deposit nào đã quá grace period
// (maturityAt + GRACE ngày — APR/tenor là SNAPSHOT trong deposit) →
// gọi autoRenewDeposit(id). Hàm này permissionless (ai cũng được gọi
// thay user), bot chỉ là "thợ quét" thay user bấm nút. Lỗi TỪNG
// deposit không làm chết vòng lặp chính.
//
// Chạy (trước đó cần `npm run node` và `deploy:local` + `seed`):
//   BOT_DRY_RUN=1 npm run bot      # chỉ log, không gửi tx
//   BOT_EVERY=5 npm run bot        # cycle 5 giây (demo nhanh)
//   BOT_ONCE=1 npm run bot         # quét 1 cycle rồi thoát (debug)
// ═══════════════════════════════════════════════════════════════════

import { network } from "hardhat";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const MODULE_ID = "BankDepositModule";
const DECIMALS = 6;
const fmt = (units: bigint) => (Number(units) / 10 ** DECIMALS).toLocaleString("en-US");

// ──────────────────────────── flags (env var) ────────────────────
// `hardhat run` không nhận CLI flag ngoài → cấu hình qua env var.
const isDryRun = process.env.BOT_DRY_RUN === "1";
const isOnce = process.env.BOT_ONCE === "1";
const intervalSec = process.env.BOT_EVERY ? Number(process.env.BOT_EVERY) || 60 : 60;

// ──────────────────────────── contracts ──────────────────────────
const { ethers, networkName, provider } = await network.create();
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
  console.error(`❌ Không tìm thấy deployment cho chain ${chainId}: ${addressesFile}`);
  console.error("   → Chạy trước: npm run deploy:local");
  process.exit(1);
}

const core = await ethers.getContractAt("SavingCore", deployed[`${MODULE_ID}#SavingCore`]);
const [bot] = await ethers.getSigners();
const GRACE_DAYS = 3; // variant cá nhân AT190234 (A=4, B=3 → grace 3 ngày)

const coreAddr = deployed[`${MODULE_ID}#SavingCore`];
console.log(`🤖 Auto-renew bot | network=${networkName} (chainId ${chainId}) | bot=${bot.address}`);
console.log(`   SavingCore: ${coreAddr} | mode=${isDryRun ? "DRY-RUN" : "LIVE"} | interval=${intervalSec}s${isOnce ? " | once" : ""}`);
console.log(`   Logic: block.timestamp >= maturityAt + ${GRACE_DAYS} ngày → autoRenewDeposit(id)\n`);

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

  // Bước 1: view scan (rẻ) — chỉ chọn deposit đủ điều kiện auto-renew.
  const pending: { id: bigint; owner: string; principal: bigint; aprAtOpen: bigint }[] = [];
  for (let id = 1; id <= count; id++) {
    try {
      if (!(await core.canAutoRenew(id))) continue;
      const info = await core.getDeposit(id);
      pending.push({
        id: BigInt(id),
        owner: await core.ownerOf(id),
        principal: info.principal,
        aprAtOpen: info.aprBpsAtOpen,
      });
    } catch (err: unknown) {
      // deposit đơn lẻ lỗi đọc — tiếp tục id khác, không chết loop.
      console.warn(`   ⚠️  Đọc deposit #${id} lỗi (bỏ qua): ${String(err).slice(0, 140)}`);
    }
  }
  found = pending.length;

  if (found === 0) {
    console.log(`   ✓ Đã quét ${count} deposit — không có deposit nào quá grace period`);
    return { found, renewed };
  }

  console.log(`   🎯 Phát hiện ${found} deposit quá grace period — xử lý auto-renew:`);

  // Bước 2: gửi tx autoRenewDeposit — lỗi từng deposit không cản deposit khác.
  for (const p of pending) {
    const label = `#${p.id} (owner ${p.owner}, principal ${fmt(p.principal)} USDC, APR ${p.aprAtOpen} bps)`;
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
