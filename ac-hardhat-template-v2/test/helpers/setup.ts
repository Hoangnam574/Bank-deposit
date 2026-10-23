import { network } from "hardhat";

// ════════════════════════════════════════════════════════════════════
//  Hardhat 3 connection — KHÁC với Hardhat 2:
//  dùng `network.create()` thay cho `hre.network.connect()`.
//  Module-level: mỗi test file import setup này sẽ dùng chung 1 connection.
// ════════════════════════════════════════════════════════════════════
const connection = await network.create();
const { ethers, networkHelpers } = connection;

// ═══════════════════════════ Hằng số ═══════════════════════════

/** 1 USDC = 1_000_000 units. Helper duy nhất — CẤM hardcode 1e18. */
export const USDC = (n: number | string | bigint): bigint => BigInt(n) * 1_000_000n;

/** 365 * 24 * 3600 — mẫu số công thức lãi. */
export const YEAR_SECONDS = 31_536_000n;
export const BPS_DIVISOR = 10_000n;

/** Một ngày tính bằng giây. */
export const DAY = 24 * 60 * 60;

/** Grace period biến thể cá nhân AT190234: (4 mod 3) + 2 = 3 ngày. */
export const GRACE_PERIOD_SECONDS = 3 * DAY;

/** C5 emergency withdraw: cho phép sau 7 ngày pause liên tục. */
export const EMERGENCY_DELAY_SECONDS = 7 * DAY;

// ═════════════════════════ Fixtures ═════════════════════════

/**
 * Fixture cơ sở: chỉ MockUSDC + VaultManager (giai đoạn P1, chưa có SavingCore).
 *
 * Cấu hình sau khi deploy:
 *  - vault.savingCore ← fakeSavingCore (signer #4, đứng thay SavingCore để test).
 *  - owner mint 1.000.000 USDC, approve vô hạn cho vault, fund 500.000 USDC.
 *
 * Trạng thái vault: 500.000 USDC, totalOwedInterest = 0.
 */
export async function deployBaseFixture() {
  const [owner, user1, user2, feeReceiver, fakeSavingCore, attacker] =
    await ethers.getSigners();

  const usdc = await ethers.deployContract("MockUSDC");
  const vault = await ethers.deployContract("VaultManager", [
    await usdc.getAddress(),
    feeReceiver.address,
  ]);

  // Link "SavingCore" giả — chỉ test hàm onlySavingCore, chưa có contract thật.
  await vault.connect(owner).setSavingCore(fakeSavingCore.address);

  // Nạp token cho owner + vault
  await usdc.mint(owner.address, USDC(1_000_000));
  await usdc.connect(owner).approve(await vault.getAddress(), ethers.MaxUint256);
  await vault.connect(owner).fundVault(USDC(500_000));

  return { owner, user1, user2, feeReceiver, fakeSavingCore, attacker, usdc, vault };
}

export type BaseFixture = Awaited<ReturnType<typeof deployBaseFixture>>;

// Re-export cho test file
export { ethers, networkHelpers, connection };
