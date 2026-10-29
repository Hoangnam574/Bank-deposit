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

/**
 * Fixture đầy đủ: MockUSDC + VaultManager + SavingCore (linkarrison), plan mặc định.
 *
 * Plan #1 = biến thể cá nhân AT190234:
 *   tenor 180 ngày · APR 300 bps · minDeposit 100 USDC · maxDeposit 0 (unlimited)
 *   penalty 450 bps (bắt buộc theo bài).
 *
 * Trạng thái:
 *  - vault: 500.000 USDC, totalOwedInterest = 0.
 *  - user1, user2: 100.000 USDC mỗi người, approve vô hạn SavingCore.
 */
export async function deployCommonFixture() {
  const [owner, user1, user2, feeReceiver, bot, attacker] = await ethers.getSigners();

  const usdc = await ethers.deployContract("MockUSDC");
  const vault = await ethers.deployContract("VaultManager", [
    await usdc.getAddress(),
    feeReceiver.address,
  ]);
  const savingCore = await ethers.deployContract("SavingCore", [
    await usdc.getAddress(),
    await vault.getAddress(),
    86400,
  ]);

  await vault.connect(owner).setSavingCore(await savingCore.getAddress());

  // Plan #1 — bộ tham của biến thể cá nhân
  await savingCore.connect(owner).createPlan(180, 300, USDC(100), 0n, 450);

  // Nạp token + approval
  await usdc.mint(owner.address, USDC(1_000_000));
  await usdc.mint(user1.address, USDC(100_000));
  await usdc.mint(user2.address, USDC(100_000));
  await usdc.connect(user1).approve(await savingCore.getAddress(), ethers.MaxUint256);
  await usdc.connect(user2).approve(await savingCore.getAddress(), ethers.MaxUint256);

  await usdc.connect(owner).approve(await vault.getAddress(), ethers.MaxUint256);
  await vault.connect(owner).fundVault(USDC(500_000));

  return { owner, user1, user2, feeReceiver, bot, attacker, usdc, vault, savingCore };
}

export type CommonFixture = Awaited<ReturnType<typeof deployCommonFixture>>;

// ═════════════════════════ Test helpers ═════════════════════════

/**
 * Mở deposit mặc định (plan 1) cho `user` với amount tự chọn.
 * Trả về depositId (deposit có id tăng dần = depositCount).
 */
export async function openDefaultDeposit(
  f: CommonFixture,
  signer: { address: string },
  amount: bigint,
): Promise<bigint> {
  const sc = f.savingCore.connect(signer as any) as any;
  await sc.openDeposit(1, amount);
  return (await f.savingCore.depositCount()) as unknown as bigint;
}

/** Fast-forward tới timestamp chính xác `target` (mine block tại target). */
export async function timeTravelTo(target: bigint | number) {
  await networkHelpers.time.increaseTo(target as unknown as number);
}

/**
 * Đặt timestamp block KẾ TIẾP (chứa tx kế tiếp) == `target` CHÍNH XÁC.
 * Khác time.increaseTo (mine block luôn → tx sau chạy ở target+1):
 * dùng cho test boundary nghĩa thật (ví dụ maturityAt - 1s phải revert).
 */
export async function nextBlockAt(target: bigint | number) {
  await networkHelpers.time.setNextBlockTimestamp(target);
}

/** Lấy timestamp hiện tại của block mới nhất. */
export async function latestTime(): Promise<bigint> {
  const block = await ethers.provider.getBlock("latest");
  return BigInt(block!.timestamp);
}

// Re-export cho test file
export { ethers, networkHelpers, connection };
