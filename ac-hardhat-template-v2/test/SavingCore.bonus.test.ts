import { expect } from "chai";
import {
  USDC,
  DAY,
  GRACE_PERIOD_SECONDS,
  ethers,
  networkHelpers,
  deployCommonFixture,
  timeTravelTo,
  nextBlockAt,
  latestTime,
  type CommonFixture,
} from "./helpers/setup";

// ════════════════════════════════════════════════════════════════════
//  SavingCore — BONUS C1–C5 (P3)
//  C1: lãi defer khi vault thiếu + claimPendingInterest
//  C3: partialEarlyWithdraw (weighted accrual, D4)
//  C4: topUpDeposit (weighted accrual, D4)
//  C5: emergencyWithdraw (pause ≥ 7 ngày)
//  Tham chiếu: 1.000 USDC · 180d · 300bps → 14.794.520 units
// ════════════════════════════════════════════════════════════════════

const O = 14_794_520n; // owed/interest của 1.000 USDC trong plan1
const denom = 31_536_000n * 10_000n;

describe("SavingCore — bonus C1–C5", () => {
  let f: CommonFixture;

  beforeEach(async () => {
    f = await networkHelpers.loadFixture(deployCommonFixture);
  });

  /** Tạo plan mới, trả về planId. */
  async function createTestPlan(
    tenorDays: number,
    aprBps: number,
    min = 0,
    max = 0,
    penalty = 0,
  ): Promise<bigint> {
    const planId = (await f.savingCore.planCount()) + 1n;
    await f.savingCore
      .connect(f.owner)
      .createPlan(tenorDays, aprBps, BigInt(min) * 1_000_000n, BigInt(max) * 1_000_000n, penalty);
    return planId;
  }

  /** Công thức lãi đúng như contract (multiply-before-divide, floor). */
  const owedOf = (p: bigint, tenorDays: bigint, aprBps: bigint) =>
    (p * tenorDays * 86400n * aprBps) / denom;

  /** T-A10: invariant Σ previewInterest(Active) == totalOwedInterest. */
  async function expectOwedInvariant() {
    const ids1 = await f.savingCore.getUserDepositIds(f.user1.address);
    const ids2 = await f.savingCore.getUserDepositIds(f.user2.address);
    let sum = 0n;
    for (const id of [...ids1, ...ids2]) {
      sum += await f.savingCore.previewInterest(id);
    }
    expect(await f.vault.totalOwedInterest()).to.equal(sum);
  }

  // ═══════════════════════════ C1 — defer + claim ═══════════════════════════

  describe("C1 — vault thiếu lãi tại maturity", () => {
    /** Chuẩn bị: vault rỗng, user1 có 2 deposit. */
    async function emptyVaultSetup() {
      await f.vault.connect(f.owner).withdrawVault(USDC(500_000)); // vault về 0
      const id1 = 1n; // mở sau khi vault rỗng
      await f.savingCore.connect(f.user1).openDeposit(1, USDC(1_000));
      const id2 = 2n;
      await f.savingCore.connect(f.user1).openDeposit(1, USDC(1_000));
      return { id1, id2 };
    }

    it("C1.01 vault = 0 → principal vẫn trả ĐỦ, lãi defer (T-A17)", async () => {
      const { id1 } = await emptyVaultSetup();
      const d = await f.savingCore.getDeposit(id1);
      await timeTravelTo(d.maturityAt);

      const userBefore = await f.usdc.balanceOf(f.user1.address);
      const paid = await f.savingCore
        .connect(f.user1)
        .withdrawAtMaturity.staticCall(id1);

      // trả về lãi NGAY = 0 (defer); principal 1.000 vẫn về user
      expect(paid).to.equal(0n);
      await f.savingCore.connect(f.user1).withdrawAtMaturity(1n);

      // user nhận ĐỦ principal (không lãi); vault vẫn 0 — không trả gì
      expect((await f.usdc.balanceOf(f.user1.address)) - userBefore)
        .to.equal(USDC(1_000));
      // lãi ghi NỢ cho user
      expect(await f.savingCore.pendingInterestOf(f.user1.address)).to.equal(O);
      expect(await f.vault.getVaultBalance()).to.equal(0n);
      // C2: cam kết owed KHÔNG giảm khi defer — bank vẫn nợ (d1 defer + d2 Active)
      expect(await f.vault.totalOwedInterest()).to.equal(2n * O);
    });

    it("C1.02 emits InterestDeferred + Withdrawn(principal, deferred interest)", async () => {
      const { id1 } = await emptyVaultSetup();
      const d = await f.savingCore.getDeposit(id1);
      await timeTravelTo(d.maturityAt);

      const tx = await f.savingCore.connect(f.user1).withdrawAtMaturity(id1);
      await expect(tx)
        .to.emit(f.savingCore, "InterestDeferred")
        .withArgs(id1, f.user1.address, O);
      await expect(tx)
        .to.emit(f.savingCore, "Withdrawn")
        .withArgs(id1, f.user1.address, USDC(1_000), O, false); // interest hiển thị = deferred
    });

    it("C1.03 claim khi vault vẫn thiếu → revert, pending giữ nguyên", async () => {
      await emptyVaultSetup();
      const d = await f.savingCore.getDeposit(1n);
      await timeTravelTo(d.maturityAt);
      await f.savingCore.connect(f.user1).withdrawAtMaturity(1n);

      // vault 0 < O → revert từ payInterest của vault
      await expect(f.savingCore.connect(f.user1).claimPendingInterest())
        .to.be.revertedWithCustomError(f.vault, "VM_InsufficientBalance");
      // pending KHÔNG mất (roll-back)
      expect(await f.savingCore.pendingInterestOf(f.user1.address)).to.equal(O);
      expect(await f.vault.totalOwedInterest()).to.equal(2n * O);
    });

    it("C1.04 claim SAU khi vault được nạp lại: nhận đủ, pending=0, owed giảm (T-A16)", async () => {
      const { id1 } = await emptyVaultSetup();
      const d = await f.savingCore.getDeposit(id1);
      await timeTravelTo(d.maturityAt);
      await f.savingCore.connect(f.user1).withdrawAtMaturity(id1);

      // bank nạp lại vault
      await f.vault.connect(f.owner).fundVault(O);

      const before = await f.usdc.balanceOf(f.user1.address);
      await expect(f.savingCore.connect(f.user1).claimPendingInterest())
        .to.emit(f.savingCore, "PendingInterestClaimed")
        .withArgs(f.user1.address, O);

      expect((await f.usdc.balanceOf(f.user1.address)) - before).to.equal(O);
      expect(await f.savingCore.pendingInterestOf(f.user1.address)).to.equal(0n);
      // owed giảm đúng O (d1 đã solve); d2 vẫn Active
      expect(await f.vault.totalOwedInterest()).to.equal(1n * O);
    });

    it("C1.05 claim với pending = 0 → revert SC_NothingPending", async () => {
      await expect(f.savingCore.connect(f.user2).claimPendingInterest())
        .to.be.revertedWithCustomError(f.savingCore, "SC_NothingPending");
    });

    it("C1.06 claim 2 lần → lần 2 revert SC_NothingPending (CEI zero-before-transfer)", async () => {
      const { id1 } = await emptyVaultSetup();
      const d = await f.savingCore.getDeposit(id1);
      await timeTravelTo(d.maturityAt);
      await f.savingCore.connect(f.user1).withdrawAtMaturity(id1);
      await f.vault.connect(f.owner).fundVault(O);

      await f.savingCore.connect(f.user1).claimPendingInterest();
      expect(await f.savingCore.pendingInterestOf(f.user1.address)).to.equal(0n);
      await expect(f.savingCore.connect(f.user1).claimPendingInterest())
        .to.be.revertedWithCustomError(f.savingCore, "SC_NothingPending");
    });

    it("C1.07 NHIỀU deposit defer cộng gộp → một claim nhận tất", async () => {
      const { id1, id2 } = await emptyVaultSetup();
      await timeTravelTo((await f.savingCore.getDeposit(id1)).maturityAt);
      await f.savingCore.connect(f.user1).withdrawAtMaturity(id1);
      await f.savingCore.connect(f.user1).withdrawAtMaturity(id2);

      expect(await f.savingCore.pendingInterestOf(f.user1.address)).to.equal(2n * O);

      await f.vault.connect(f.owner).fundVault(2n * O);
      const before = await f.usdc.balanceOf(f.user1.address);
      await f.savingCore.connect(f.user1).claimPendingInterest();
      expect((await f.usdc.balanceOf(f.user1.address)) - before).to.equal(2n * O);
      expect(await f.savingCore.pendingInterestOf(f.user1.address)).to.equal(0n);
      expect(await f.vault.totalOwedInterest()).to.equal(0n);
    });

    it("C1.08 boundary: vault đủ ĐÚNG bằng interest → trả Ngay (Path A)", async () => {
      // vault về 0 rồi nạp ĐÚNG O cho một deposit duy nhất
      await f.vault.connect(f.owner).withdrawVault(USDC(500_000));
      await f.savingCore.connect(f.user1).openDeposit(1, USDC(1_000));
      await f.vault.connect(f.owner).fundVault(O);

      const d = await f.savingCore.getDeposit(1n);
      await timeTravelTo(d.maturityAt);

      const userBefore = await f.usdc.balanceOf(f.user1.address);
      await f.savingCore.connect(f.user1).withdrawAtMaturity(1n);

      // Path A: principal + lãi về user trong cùng tx
      expect((await f.usdc.balanceOf(f.user1.address)) - userBefore)
        .to.equal(USDC(1_000) + O);
      // không defer
      expect(await f.savingCore.pendingInterestOf(f.user1.address)).to.equal(0n);
      expect(await f.vault.getVaultBalance()).to.equal(0n);
      expect(await f.vault.totalOwedInterest()).to.equal(0n);
    });

    it("C1.09 claim bị chặn khi hệ thống pause (D3)", async () => {
      const { id1 } = await emptyVaultSetup();
      const d = await f.savingCore.getDeposit(id1);
      await timeTravelTo(d.maturityAt);
      await f.savingCore.connect(f.user1).withdrawAtMaturity(id1);
      await f.vault.connect(f.owner).fundVault(O);

      await f.vault.connect(f.owner).pause();
      await expect(f.savingCore.connect(f.user1).claimPendingInterest())
        .to.be.revertedWithCustomError(f.savingCore, "SC_SystemPaused");
    });

    it("C1.10 defer multi-user: lãi của ai về tay người đó", async () => {
      await f.vault.connect(f.owner).withdrawVault(USDC(500_000));
      await f.savingCore.connect(f.user1).openDeposit(1, USDC(1_000));
      await f.savingCore.connect(f.user2).openDeposit(1, USDC(2_000));
      const d = await f.savingCore.getDeposit(1n);
      await timeTravelTo(d.maturityAt);

      await f.savingCore.connect(f.user1).withdrawAtMaturity(1n);
      await f.savingCore.connect(f.user2).withdrawAtMaturity(2n);

      // O của user1; 2.000 USDC → owed2000 (floor riêng)
      const owed2000 = owedOf(USDC(2_000), 180n, 300n);
      expect(await f.savingCore.pendingInterestOf(f.user1.address)).to.equal(O);
      expect(await f.savingCore.pendingInterestOf(f.user2.address)).to.equal(owed2000);
    });
  });

  // ═══════════════════════════ C3 — partial early withdraw ═══════════════════════════

  describe("C3 — partialEarlyWithdraw", () => {
    /** Mở 1.000 USDC rồi chờ ĐÚNG 90 ngày (tx partial chạy ở startAt + 90d chính xác). */
    async function halfWayDeposit() {
      const id = 1n;
      await f.savingCore.connect(f.user1).openDeposit(1, USDC(1_000));
      const d = await f.savingCore.getDeposit(id);
      // nextBlockAt (không phải increaseTo) — tx kế tiếp (partial) mine ĐÚNG
      // tại startAt + 90*DAY → `remaining = maturityAt - now` khớp 90 ngày nguyên
      await nextBlockAt(d.startAt + BigInt(90 * DAY));
      return d;
    }

    it("C3.01 partial 500 USDC sau 90 ngày: penalty exact 22.5, refunded 477.5", async () => {
      await halfWayDeposit();

      const penaltyHalf = (USDC(500) * 450n) / 10_000n; // 22_500_000
      const [refunded, penalty] = await f.savingCore
        .connect(f.user1)
        .partialEarlyWithdraw.staticCall(1n, USDC(500));
      expect(penalty).to.equal(penaltyHalf);
      expect(refunded).to.equal(USDC(500) - penaltyHalf);

      const before = await f.usdc.balanceOf(f.user1.address);
      await f.savingCore.connect(f.user1).partialEarlyWithdraw(1n, USDC(500));
      expect((await f.usdc.balanceOf(f.user1.address)) - before)
        .to.equal(USDC(500) - penaltyHalf);

      // penalty về feeReceiver qua vault
      expect(await f.usdc.balanceOf(f.feeReceiver.address)).to.equal(penaltyHalf);

      // deposit vẫn Active, NFT GIỮ, principal còn 500
      const d = await f.savingCore.getDeposit(1n);
      expect(d.status).to.equal(0n); // Active
      expect(d.principal).to.equal(USDC(500));
      expect(await f.savingCore.ownerOf(1n)).to.equal(f.user1.address);
    });

    it("C3.02 emits Withdrawn(refunded, 0, isEarly=true) + PenaltyCharged", async () => {
      await halfWayDeposit();
      const penaltyHalf = (USDC(500) * 450n) / 10_000n;

      const tx = await f.savingCore.connect(f.user1).partialEarlyWithdraw(1n, USDC(500));
      await expect(tx)
        .to.emit(f.savingCore, "Withdrawn")
        .withArgs(1n, f.user1.address, USDC(500) - penaltyHalf, 0n, true);
      await expect(tx)
        .to.emit(f.savingCore, "PenaltyCharged")
        .withArgs(1n, f.user1.address, penaltyHalf);
    });

    it("C3.03 weighted accrual: phần còn lại sinh lãi ĐÚNG đến maturity", async () => {
      await halfWayDeposit();

      // principalSeconds = 1.000×180d − 500×90d = 500 USDC × 270 ngày
      await f.savingCore.connect(f.user1).partialEarlyWithdraw(1n, USDC(500));

      const expectedSeconds = USDC(1_000) * BigInt(180 * DAY) - USDC(500) * BigInt(90 * DAY);
      const d = await f.savingCore.getDeposit(1n);
      expect(d.principalSeconds).to.equal(expectedSeconds);

      // owed = previewInterest của còn lại (chính xác floor)
      const expectedInterest = (expectedSeconds * 300n) / denom;
      expect(await f.vault.totalOwedInterest()).to.equal(expectedInterest);
      expect(await f.savingCore.previewInterest(1n)).to.equal(expectedInterest);

      // maturity: payout KHỚP sẵn ban đầu
      await timeTravelTo((await f.savingCore.getDeposit(1n)).maturityAt);
      const userBefore = await f.usdc.balanceOf(f.user1.address);
      await f.savingCore.connect(f.user1).withdrawAtMaturity(1n);
      expect((await f.usdc.balanceOf(f.user1.address)) - userBefore)
        .to.equal(USDC(500) + expectedInterest);
      expect(await f.vault.totalOwedInterest()).to.equal(0n);
    });

    it("C3.04 owed giảm ĐÚNG delta lãi chunk (C2)", async () => {
      await halfWayDeposit();
      // owed trước = 14,794,520 (toàn bộ tenor)
      expect(await f.vault.totalOwedInterest()).to.equal(O);

      const remainingAtPartial = BigInt(90 * DAY);
      const chunkOwed = owedOf(USDC(500), 90n, 300n);
      await f.savingCore.connect(f.user1).partialEarlyWithdraw(1n, USDC(500));

      expect(await f.vault.totalOwedInterest()).to.equal(O - chunkOwed);
    });

    it("C3.05 amount == principal → revert (phải dùng earlyWithdraw)", async () => {
      await halfWayDeposit();
      await expect(f.savingCore.connect(f.user1).partialEarlyWithdraw(1n, USDC(1_000)))
        .to.be.revertedWithCustomError(f.savingCore, "SC_AmountTooHigh");
    });

    it("C3.06 amount = 0 / After maturity / unknown id", async () => {
      await halfWayDeposit();

      await expect(f.savingCore.connect(f.user1).partialEarlyWithdraw(1n, 0))
        .to.be.revertedWithCustomError(f.savingCore, "SC_AmountZero");

      const d = await f.savingCore.getDeposit(1n);
      await timeTravelTo(d.maturityAt);
      await expect(f.savingCore.connect(f.user1).partialEarlyWithdraw(1n, USDC(500)))
        .to.be.revertedWithCustomError(f.savingCore, "SC_TooLate");

      await expect(f.savingCore.connect(f.user1).partialEarlyWithdraw(999, USDC(500)))
        .to.be.revertedWithCustomError(f.savingCore, "ERC721NonexistentToken");
    });

    it("C3.07 not owner → revert", async () => {
      await halfWayDeposit();
      await expect(
        f.savingCore.connect(f.user2).partialEarlyWithdraw(1n, USDC(500)),
      ).to.be.revertedWithCustomError(f.savingCore, "SC_NotDepositOwner");
    });

    it("C3.08 NFT còn sống sau partial → có thể chuyển nhượng (quyền theo NFT)", async () => {
      await halfWayDeposit();
      await f.savingCore.connect(f.user1).partialEarlyWithdraw(1n, USDC(500));

      // NFT còn sống → chuyển cho user2; user2 trở thành ALL RIGHTS (rút đủ maturity)
      await f.savingCore.connect(f.user1)["transferFrom(address,address,uint256)"](
        f.user1.address, f.user2.address, 1n,
      );
      expect((await f.savingCore.getUserDepositIds(f.user2.address)).map(String))
        .to.include("1");
    });
  });

  // ═══════════════════════════ C4 — top-up ═══════════════════════════

  describe("C4 — topUpDeposit", () => {
    it("C4.01 top-up 500 USDC sau 90 ngày → lãi weighted ĐÚNG (T-A12)", async () => {
      await f.savingCore.connect(f.user1).openDeposit(1, USDC(500));
      const d = await f.savingCore.getDeposit(1n);
      // tx top-up chạy ĐÚNG tại startAt + 90d (nextBlockAt để remaining khớp)
      await nextBlockAt(d.startAt + BigInt(90 * DAY));

      const beforeUser = await f.usdc.balanceOf(f.user1.address);
      const beforeVault = await f.vault.getVaultBalance();
      await f.savingCore.connect(f.user1).topUpDeposit(1n, USDC(500));

      // token nạp vào SavingCore (không đụng vault)
      expect(await f.usdc.balanceOf(f.user1.address)).to.equal(beforeUser - USDC(500));
      expect(await f.vault.getVaultBalance()).to.equal(beforeVault);

      // weighted: 500×180d + 500×90d = 500×270d
      const expectedSeconds = USDC(500) * BigInt(180 * DAY) + USDC(500) * BigInt(90 * DAY);
      const nd = await f.savingCore.getDeposit(1n);
      expect(nd.principal).to.equal(USDC(1_000));
      expect(nd.principalSeconds).to.equal(expectedSeconds);
      expect(nd.status).to.equal(0n); // Active
      expect(nd.maturityAt).to.equal(d.maturityAt); // maturity KHÔNG đổi

      // lãi tới maturity = weighted chính xác (floor)
      const expectedInterest = (expectedSeconds * 300n) / denom;
      expect(expectedInterest).to.equal(11_095_890n); // tính tay sẵn (đặc trưng variant)
      expect(await f.savingCore.previewInterest(1n)).to.equal(expectedInterest);

      // verify payout thật tại maturity
      await timeTravelTo((await f.savingCore.getDeposit(1n)).maturityAt);
      const userBefore = await f.usdc.balanceOf(f.user1.address);
      await f.savingCore.connect(f.user1).withdrawAtMaturity(1n);
      expect((await f.usdc.balanceOf(f.user1.address)) - userBefore)
        .to.equal(USDC(1_000) + expectedInterest);
    });

    it("C4.02 emits DepositToppedUp(depositId, user, amount, newPrincipal)", async () => {
      await f.savingCore.connect(f.user1).openDeposit(1, USDC(500));
      const d = await f.savingCore.getDeposit(1n);
      await timeTravelTo(d.startAt + BigInt(90 * DAY));

      await expect(f.savingCore.connect(f.user1).topUpDeposit(1n, USDC(500)))
        .to.emit(f.savingCore, "DepositToppedUp")
        .withArgs(1n, f.user1.address, USDC(500), USDC(1_000));
    });

    it("C4.03 owed tăng ĐÚNG delta (C2)", async () => {
      await f.savingCore.connect(f.user1).openDeposit(1, USDC(500));
      const d = await f.savingCore.getDeposit(1n);
      await nextBlockAt(d.startAt + BigInt(90 * DAY));

      const owedBefore = await f.vault.totalOwedInterest();
      expect(owedBefore).to.equal(owedOf(USDC(500), 180n, 300n));

      await f.savingCore.connect(f.user1).topUpDeposit(1n, USDC(500));
      // chunk mới: 500 USDC × 90 ngày còn lại
      expect(await f.vault.totalOwedInterest())
        .to.equal(owedBefore + owedOf(USDC(500), 90n, 300n));
    });

    it("C4.04 amount 0 / sau maturity / unknown id → revert", async () => {
      await f.savingCore.connect(f.user1).openDeposit(1, USDC(500));

      await expect(f.savingCore.connect(f.user1).topUpDeposit(1n, 0))
        .to.be.revertedWithCustomError(f.savingCore, "SC_AmountZero");

      const d = await f.savingCore.getDeposit(1n);
      await timeTravelTo(d.maturityAt);
      // top-up TẠI đúng maturity ≡ sau → SC_TooLate
      await expect(f.savingCore.connect(f.user1).topUpDeposit(1n, USDC(500)))
        .to.be.revertedWithCustomError(f.savingCore, "SC_TooLate");

      await expect(f.savingCore.connect(f.user1).topUpDeposit(99n, USDC(500)))
        .to.be.revertedWithCustomError(f.savingCore, "ERC721NonexistentToken");
    });

    it("C4.05 MAX_PRINCIPAL: tổng vượt cap → revert", async () => {
      await f.savingCore.connect(f.user1).openDeposit(1, USDC(500));
      const cap = 1_000_000_000_000_000n * 1_000_000n; // MAX_PRINCIPAL
      await expect(f.savingCore.connect(f.user1).topUpDeposit(1n, cap))
        .to.be.revertedWithCustomError(f.savingCore, "SC_AmountTooLarge");
    });

    it("C4.06 pause chặn top-up (D3)", async () => {
      await f.savingCore.connect(f.user1).openDeposit(1, USDC(500));
      await f.vault.connect(f.owner).pause();
      await expect(f.savingCore.connect(f.user1).topUpDeposit(1n, USDC(500)))
        .to.be.revertedWithCustomError(f.savingCore, "SC_SystemPaused");
    });
  });

  // ═══════════════════════════ C5 — emergency withdraw ═══════════════════════════

  describe("C5 — emergencyWithdraw (pause ≥ 7 ngày)", () => {
    async function pausedFor(seconds: bigint) {
      const id = 1n;
      await f.savingCore.connect(f.user1).openDeposit(1, USDC(1_000));
      await f.vault.connect(f.owner).pause();
      const p = await f.vault.pausedAt();
      if (seconds === 0n) return { id, p, d: await f.savingCore.getDeposit(id) };
      // đặt block kế tiếp
      await nextBlockAt(p + seconds);
      return { id, p, d: await f.savingCore.getDeposit(id) };
    }

    it("C5.01 pause đủ 7 ngày (pause - 1s → revert)", async () => {
      const { id } = await pausedFor(BigInt(7 * DAY) - 1n);
      await expect(f.savingCore.connect(f.user1).emergencyWithdraw(id))
        .to.be.revertedWithCustomError(f.savingCore, "SC_EmergencyNotReady");
    });

    it("C5.02 pause 1 ngày → revert", async () => {
      const { id } = await pausedFor(BigInt(DAY));
      await expect(f.savingCore.connect(f.user1).emergencyWithdraw(id))
        .to.be.revertedWithCustomError(f.savingCore, "SC_EmergencyNotReady");
    });

    it("C5.03 pause đủ 7 ngày → trả CHỈ principal, vault không đổi (T-A5/T-A6)", async () => {
      const { id } = await pausedFor(BigInt(7 * DAY));

      const userBefore = await f.usdc.balanceOf(f.user1.address);
      const vaultBefore = await f.vault.getVaultBalance();

      await f.savingCore.connect(f.user1).emergencyWithdraw(id);

      // CHỈ principal — không lãi, không penalty
      expect((await f.usdc.balanceOf(f.user1.address)) - userBefore)
        .to.equal(USDC(1_000));
      // vault KHÔNG đổi (lãi nằm lại vault, user mất lãi giữa pause)
      expect(await f.vault.getVaultBalance()).to.equal(vaultBefore);
      // NFT burn + status Withdrawn
      await expect(f.savingCore.ownerOf(id))
        .to.be.revertedWithCustomError(f.savingCore, "ERC721NonexistentToken");
      expect((await f.savingCore.getDeposit(id)).status).to.equal(1n);
    });

    it("C5.04 emits EmergencyWithdrawn(depositId, user, principal)", async () => {
      const { id } = await pausedFor(BigInt(7 * DAY));
      await expect(f.savingCore.connect(f.user1).emergencyWithdraw(id))
        .to.emit(f.savingCore, "EmergencyWithdrawn")
        .withArgs(id, f.user1.address, USDC(1_000));
    });

    it("C5.05 không pause → revert SC_SystemNotPaused", async () => {
      const id = 1n;
      await f.savingCore.connect(f.user1).openDeposit(1, USDC(1_000));
      await expect(f.savingCore.connect(f.user1).emergencyWithdraw(id))
        .to.be.revertedWithCustomError(f.savingCore, "SC_SystemNotPaused");
    });

    it("C5.06 pause rồi UNPAUSE → revert (cửa thoát đóng theo D3)", async () => {
      const { id } = await pausedFor(BigInt(7 * DAY));
      await f.vault.connect(f.owner).unpause();
      await expect(f.savingCore.connect(f.user1).emergencyWithdraw(id))
        .to.be.revertedWithCustomError(f.savingCore, "SC_SystemNotPaused");
      // owed KHÔNG đổi vì tx revert toàn bộ
      expect(await f.vault.totalOwedInterest()).to.equal(O);
    });

    it("C5.07 owed giảm FULL sau emergency (C2)", async () => {
      const { id } = await pausedFor(BigInt(7 * DAY));
      expect(await f.vault.totalOwedInterest()).to.equal(O);
      await f.savingCore.connect(f.user1).emergencyWithdraw(id);
      expect(await f.vault.totalOwedInterest()).to.equal(0n);
    });

    it("C5.08 not owner → revert", async () => {
      const { id } = await pausedFor(BigInt(7 * DAY));
      await expect(f.savingCore.connect(f.user2).emergencyWithdraw(id))
        .to.be.revertedWithCustomError(f.savingCore, "SC_NotDepositOwner");
    });
  });

  // ═══════════════════════════ Views bổ sung ═══════════════════════════

  describe("Views bổ sung (T3.7)", () => {
    it("V.01 isMatured: false trước / true đúng maturityAt / unknown revert", async () => {
      await f.savingCore.connect(f.user1).openDeposit(1, USDC(1_000));
      const d = await f.savingCore.getDeposit(1n);
      expect(await f.savingCore.isMatured(1n)).to.equal(false);

      // view thực thi ở block MỚI NHẤT → phải mine block (increaseTo), không chỉ hẹn timestamp
      await timeTravelTo(d.maturityAt);
      expect(await f.savingCore.isMatured(1n)).to.equal(true);

      await expect(f.savingCore.isMatured(99n))
        .to.be.revertedWithCustomError(f.savingCore, "SC_UnknownDeposit");
    });

    it("V.02 getUserDepositIds: đúng lần lượt id, after withdrawing burn shrink", async () => {
      await f.savingCore.connect(f.user1).openDeposit(1, USDC(1_000));
      await f.savingCore.connect(f.user1).openDeposit(1, USDC(2_000));

      const ids = await f.savingCore.getUserDepositIds(f.user1.address);
      expect(ids.map(String)).to.deep.equal(["1", "2"]);
      expect((await f.savingCore.getUserDepositIds(f.user2.address)).map(String))
        .to.deep.equal([]);

      // early withdraw id1 → NFT burn → list chỉ còn id2
      await f.savingCore.connect(f.user1).earlyWithdraw(1n);
      expect((await f.savingCore.getUserDepositIds(f.user1.address)).map(String))
        .to.deep.equal(["2"]);
    });

    it("V.03 T-A10 invariant: Σ previewInterest(Active) == totalOwedInterest qua nhiều nhánh", async () => {
      // open 3 deposits
      await f.savingCore.connect(f.user1).openDeposit(1, USDC(1_000));
      await f.savingCore.connect(f.user2).openDeposit(1, USDC(500));
      await f.savingCore.connect(f.user1).openDeposit(1, USDC(2_000));

      // top-up + partial 2 op trước travel
      await f.savingCore.connect(f.user1).topUpDeposit(1n, USDC(500));
      await f.savingCore.connect(f.user1).partialEarlyWithdraw(3n, USDC(1_000));
      await expectOwedInvariant();

      // sang maturity: withdraw 1 deposit, renew các deposit khác
      await timeTravelTo((await f.savingCore.getDeposit(3n)).maturityAt);
      await f.savingCore.connect(f.user2).withdrawAtMaturity(2n);
      await f.savingCore.connect(f.user1).renewDeposit(1n, 1);

      await expectOwedInvariant();
      expect(await f.vault.totalOwedInterest()).to.be.above(0n);
    });
  });
});
