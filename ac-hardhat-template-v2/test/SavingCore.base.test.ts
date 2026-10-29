import { expect } from "chai";
import { anyUint } from "@nomicfoundation/hardhat-ethers-chai-matchers/withArgs";
import {
  USDC,
  DAY,
  GRACE_PERIOD_SECONDS,
  ethers,
  networkHelpers,
  deployCommonFixture,
  openDefaultDeposit,
  timeTravelTo,
  nextBlockAt,
  latestTime,
  type CommonFixture,
} from "./helpers/setup";

// ════════════════════════════════════════════════════════════════════
//  SavingCore — BASE FLOWS (5 luồng bắt buộc của đề, ~45 case)
//  Fixtures dùng plan #1 = biến thể AT190234 (180d / 300 bps / 450 bps).
//  Interest tham chiếu: 1.000 USDC · 180 ngày · 300 bps = 14.794520 USDC
//  = 14_794_520 units.
// ════════════════════════════════════════════════════════════════════

const TARGET_INTEREST = 14_794_520n; // exact theo công thức
const PENALTY_1000_USDC = 45_000_000n; // 450 bps × 1.000

describe("SavingCore — base flows", () => {
  let f: CommonFixture;

  beforeEach(async () => {
    f = await networkHelpers.loadFixture(deployCommonFixture);
  });

  /** Helper: tạo plan mới trong test, trả về planId (id tăng dần). */
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

  /** Helper: mở deposit với planId bất kỳ, trả về depositId (id tăng dần = depositCount). */
  async function openPlanDeposit(
    planId: bigint | number,
    signer: { address: string },
    amount: bigint,
  ): Promise<bigint> {
    const sc = f.savingCore.connect(signer as any) as any;
    await sc.openDeposit(planId, amount);
    return (await f.savingCore.depositCount()) as unknown as bigint;
  }

  // ═══════════════════════════ Plan CRUD ═══════════════════════════

  describe("createPlan", () => {
    it("1. creates plan with correct params and emits PlanCreated", async () => {
      const planId = (await f.savingCore.planCount()) + 1n; // = 2
      const tx = f.savingCore
        .connect(f.owner)
        .createPlan(90, 500, USDC(50), USDC(10_000), 400);

      await expect(tx)
        .to.emit(f.savingCore, "PlanCreated")
        .withArgs(planId, 90, 500);

      const plan = await f.savingCore.getPlan(planId);
      expect(plan.tenorDays).to.equal(90n);
      expect(plan.aprBps).to.equal(500n);
      expect(plan.minDeposit).to.equal(USDC(50));
      expect(plan.maxDeposit).to.equal(USDC(10_000));
      expect(plan.earlyWithdrawPenaltyBps).to.equal(400n);
      expect(plan.enabled).to.equal(true);
    });

    it("2. reverts with APR = 0", async () => {
      await expect(
        f.savingCore.connect(f.owner).createPlan(90, 0, 0, 0, 0),
      ).to.be.revertedWithCustomError(f.savingCore, "SC_InvalidPlan");
    });

    it("3. reverts with APR > 10_000 bps", async () => {
      await expect(
        f.savingCore.connect(f.owner).createPlan(90, 10_001, 0, 0, 0),
      ).to.be.revertedWithCustomError(f.savingCore, "SC_InvalidPlan");
    });

    it("4. reverts with tenor == 0", async () => {
      await expect(
        f.savingCore.connect(f.owner).createPlan(0, 500, 0, 0, 0),
      ).to.be.revertedWithCustomError(f.savingCore, "SC_InvalidPlan");
    });

    it("5. reverts with penalty > 10_000 bps", async () => {
      await expect(
        f.savingCore.connect(f.owner).createPlan(90, 500, 0, 0, 10_001),
      ).to.be.revertedWithCustomError(f.savingCore, "SC_InvalidPlan");
    });

    it("6. reverts when minDeposit > maxDeposit", async () => {
      await expect(
        f.savingCore.connect(f.owner).createPlan(90, 500, USDC(200), USDC(100), 0),
      ).to.be.revertedWithCustomError(f.savingCore, "SC_InvalidPlan");
    });

    it("7. reverts when non-owner", async () => {
      await expect(
        f.savingCore.connect(f.user1).createPlan(90, 500, 0, 0, 0),
      ).to.be.revertedWithCustomError(f.savingCore, "OwnableUnauthorizedAccount");
    });

    it("8. allows minDeposit=0 and maxDeposit=0 (no limits)", async () => {
      const planId = await createTestPlan(30, 200);
      const plan = await f.savingCore.getPlan(planId);
      expect(plan.minDeposit).to.equal(0n);
      expect(plan.maxDeposit).to.equal(0n);
    });
  });

  describe("updatePlan", () => {
    it("9. updates APR and emits PlanUpdated", async () => {
      await expect(f.savingCore.connect(f.owner).updatePlan(1, 500))
        .to.emit(f.savingCore, "PlanUpdated")
        .withArgs(1, 500);
      expect((await f.savingCore.getPlan(1)).aprBps).to.equal(500n);
    });

    it("10. reverts with unknown plan", async () => {
      await expect(
        f.savingCore.connect(f.owner).updatePlan(999, 500),
      ).to.be.revertedWithCustomError(f.savingCore, "SC_PlanUnknown");
    });

    it("11. reverts with invalid new APR", async () => {
      await expect(f.savingCore.connect(f.owner).updatePlan(1, 0))
        .to.be.revertedWithCustomError(f.savingCore, "SC_InvalidPlan");
      await expect(f.savingCore.connect(f.owner).updatePlan(1, 10_001))
        .to.be.revertedWithCustomError(f.savingCore, "SC_InvalidPlan");
    });
  });

  describe("setPlanEnabled (enable/disable)", () => {
    it("12. disables → blocks new deposits; enable re-opens; emits PlanEnabled", async () => {
      // Disable plan 1
      await expect(f.savingCore.connect(f.owner).setPlanEnabled(1, false))
        .to.emit(f.savingCore, "PlanEnabled")
        .withArgs(1, false);
      expect((await f.savingCore.getPlan(1)).enabled).to.equal(false);

      await expect(openDefaultDeposit(f, f.user1, USDC(1_000)))
        .to.be.revertedWithCustomError(f.savingCore, "SC_PlanNotEnabled");

      // Re-enable — mở lại được
      await expect(f.savingCore.connect(f.owner).setPlanEnabled(1, true))
        .to.emit(f.savingCore, "PlanEnabled")
        .withArgs(1, true);
      await openDefaultDeposit(f, f.user1, USDC(1_000)); // ok
    });

    it("13. reverts enable/disable with unknown plan", async () => {
      await expect(f.savingCore.connect(f.owner).setPlanEnabled(999, false))
        .to.be.revertedWithCustomError(f.savingCore, "SC_PlanUnknown");
    });
  });

  // ═══════════════════════════废 openDeposit ═══════════════════════════

  describe("openDeposit", () => {
    it("14. happy path: NFT mint, maturityAt = now + 180d, snapshot APR/penalty", async () => {
      const id = await openDefaultDeposit(f, f.user1, USDC(1_000));

      // NFT: user1 giữ certificate id
      expect(await f.savingCore.ownerOf(id)).to.equal(f.user1.address);
      expect(await f.savingCore.balanceOf(f.user1.address)).to.equal(1n);

      const d = await f.savingCore.getDeposit(id);
      const now = await latestTime();
      expect(d.maturityAt).to.equal(now + BigInt(180 * DAY));
      expect(d.aprBpsAtOpen).to.equal(300n); // snapshot
      expect(d.penaltyBpsAtOpen).to.equal(450n); // snapshot
      expect(d.tenorDays).to.equal(180n);
      // status 0 == Active
      expect(d.status).to.equal(0n);
      expect(d.principal).to.equal(USDC(1_000));
      // principalSeconds = principal × tenorSeconds
      expect(d.principalSeconds).to.equal(USDC(1_000) * BigInt(180 * DAY));
    });

    it("15. emits DepositOpened with exact args", async () => {
      await expect(f.savingCore.connect(f.user1).openDeposit(1, USDC(1_000)))
        .to.emit(f.savingCore, "DepositOpened")
        .withArgs(1, f.user1.address, 1, USDC(1_000), anyUint, 300n);
    });

    it("16. moves principal from user to SavingCore", async () => {
      const before = await f.usdc.balanceOf(await f.savingCore.getAddress());
      await openDefaultDeposit(f, f.user1, USDC(1_000));
      expect((await f.usdc.balanceOf(await f.savingCore.getAddress())) - before)
        .to.equal(USDC(1_000));
      expect(await f.usdc.balanceOf(f.user1.address)).to.equal(USDC(99_000));
    });

    it("17. commits owed interest to vault (C2 integration)", async () => {
      // owed ước lượng cho toàn bộ tenor = 14_794_520 units
      await openDefaultDeposit(f, f.user1, USDC(1_000));
      expect(await f.vault.totalOwedInterest()).to.equal(TARGET_INTEREST);
    });

    it("18. reverts when plan disabled", async () => {
      await f.savingCore.connect(f.owner).setPlanEnabled(1, false);
      await expect(f.savingCore.connect(f.user1).openDeposit(1, USDC(1_000)))
        .to.be.revertedWithCustomError(f.savingCore, "SC_PlanNotEnabled");
    });

    it("19. reverts with amount below minDeposit", async () => {
      // minDeposit = 100 USDC
      await expect(f.savingCore.connect(f.user1).openDeposit(1, USDC(50)))
        .to.be.revertedWithCustomError(f.savingCore, "SC_AmountTooLow")
        .withArgs(USDC(100));
    });

    it("20. reverts with amount above maxDeposit", async () => {
      const planId = await createTestPlan(30, 200, 0, 500); // max 500 USDC
      await expect(f.savingCore.connect(f.user1).openDeposit(planId, USDC(600)))
        .to.be.revertedWithCustomError(f.savingCore, "SC_AmountTooHigh")
        .withArgs(USDC(500));
    });

    it("20b. accepts amount == maxDeposit exactly (boundary =)", async () => {
      const planId = await createTestPlan(30, 200, 0, 500);
      await f.savingCore.connect(f.user1).openDeposit(planId, USDC(500));
      expect(await f.savingCore.balanceOf(f.user1.address)).to.equal(1n);
    });

    it("21. reverts when system paused", async () => {
      await f.vault.connect(f.owner).pause();
      await expect(f.savingCore.connect(f.user1).openDeposit(1, USDC(1_000)))
        .to.be.revertedWithCustomError(f.savingCore, "SC_SystemPaused");
    });

    it("22. reverts with unknown planId", async () => {
      await expect(f.savingCore.connect(f.user1).openDeposit(999, USDC(1_000)))
        .to.be.revertedWithCustomError(f.savingCore, "SC_PlanUnknown");
    });

    it("23. reverts with amount == 0", async () => {
      await expect(f.savingCore.connect(f.user1).openDeposit(1, 0))
        .to.be.revertedWithCustomError(f.savingCore, "SC_AmountZero");
    });

    it("24. reverts when amount exceeds MAX_PRINCIPAL", async () => {
      // MAX_PRINCIPAL = 1e15 USDC; nhắm giá trượt qua
      await expect(
        f.savingCore.connect(f.user1).openDeposit(1, USDC(1_000_000_000_000_001)),
      ).to.be.revertedWithCustomError(f.savingCore, "SC_AmountTooLarge");
    });

    it("25. reverts with amount exceeding minDeposit but below max (errors order)", async () => {
      const planId = await createTestPlan(30, 200, 100, 500);
      await expect(f.savingCore.connect(f.user1).openDeposit(planId, USDC(600)))
        .to.be.revertedWithCustomError(f.savingCore, "SC_AmountTooHigh");
    });

    it("26. ids increment and users independent", async () => {
      await openDefaultDeposit(f, f.user1, USDC(1_000));
      await openDefaultDeposit(f, f.user2, USDC(500));
      expect(await f.savingCore.depositCount()).to.equal(2n);
      expect(await f.savingCore.ownerOf(1n)).to.equal(f.user1.address);
      expect(await f.savingCore.ownerOf(2n)).to.equal(f.user2.address);
    });

    it("27. reverts when token not approved (allowance check)", async () => {
      // Approve 0 → openDeposit revert khi pull token (ERC20 custom error)
      await f.usdc.connect(f.user2).approve(await f.savingCore.getAddress(), 0);
      await expect(f.savingCore.connect(f.user2).openDeposit(1, USDC(1_000)))
        .to.be.revertedWithCustomError(f.usdc, "ERC20InsufficientAllowance");
      // loadFixture khôi phục approval trước mỗi test nên không cần reset
    });
  });

  // ═══════════════════════════ withdrawAtMaturity ═══════════════════════════

  describe("withdrawAtMaturity", () => {
    it("28. pays EXACT interest 14.794520 USDC (variant maths)", async () => {
      const id = await openDefaultDeposit(f, f.user1, USDC(1_000));
      const d = await f.savingCore.getDeposit(id);
      await timeTravelTo(d.maturityAt); // đúng rung maturity

      const userBefore = await f.usdc.balanceOf(f.user1.address);
      await f.savingCore.connect(f.user1).withdrawAtMaturity(id);

      const userAfter = await f.usdc.balanceOf(f.user1.address);
      // user nhận principal + interest
      expect(userAfter - userBefore).to.equal(USDC(1_000) + TARGET_INTEREST);
      expect(TARGET_INTEREST).to.equal(14_794_520n); // HARD exact theo spec
    });

    it("29. interest is paid from VAULT, principal from SavingCore", async () => {
      const id = await openDefaultDeposit(f, f.user1, USDC(1_000));
      const d = await f.savingCore.getDeposit(id);
      await timeTravelTo(d.maturityAt);

      const vaultBefore = await f.vault.getVaultBalance();
      const scBefore = await f.usdc.balanceOf(await f.savingCore.getAddress());

      await f.savingCore.connect(f.user1).withdrawAtMaturity(id);

      // vault: -interest (money của bank)
      expect(vaultBefore - (await f.vault.getVaultBalance())).to.equal(TARGET_INTEREST);
      // SC: -principal (tiền user), không trừ lãi
      expect(scBefore - (await f.usdc.balanceOf(await f.savingCore.getAddress())))
        .to.equal(USDC(1_000));
    });

    it("30. emits Withdrawn(depositId, owner, principal, interest, isEarly=false)", async () => {
      const id = await openDefaultDeposit(f, f.user1, USDC(1_000));
      const d = await f.savingCore.getDeposit(id);
      await timeTravelTo(d.maturityAt);

      await expect(f.savingCore.connect(f.user1).withdrawAtMaturity(id))
        .to.emit(f.savingCore, "Withdrawn")
        .withArgs(id, f.user1.address, USDC(1_000), TARGET_INTEREST, false);
    });

    it("31. burns the certificate NFT (no dead certificate reuse)", async () => {
      const id = await openDefaultDeposit(f, f.user1, USDC(1_000));
      const d = await f.savingCore.getDeposit(id);
      await timeTravelTo(d.maturityAt);

      await f.savingCore.connect(f.user1).withdrawAtMaturity(id);

      await expect(f.savingCore.ownerOf(id))
        .to.be.revertedWithCustomError(f.savingCore, "ERC721NonexistentToken");
      expect(await f.savingCore.balanceOf(f.user1.address)).to.equal(0n);
    });

    it("32. marks status Withdrawn (1)", async () => {
      const id = await openDefaultDeposit(f, f.user1, USDC(1_000));
      await timeTravelTo((await f.savingCore.getDeposit(id)).maturityAt);
      await f.savingCore.connect(f.user1).withdrawAtMaturity(id);
      expect((await f.savingCore.getDeposit(id)).status).to.equal(1n);
    });

    it("33. reduces vault totalOwedInterest by the amount paid (C2)", async () => {
      const id = await openDefaultDeposit(f, f.user1, USDC(1_000));
      const d = await f.savingCore.getDeposit(id);
      await timeTravelTo(d.maturityAt);

      await f.savingCore.connect(f.user1).withdrawAtMaturity(id);
      expect(await f.vault.totalOwedInterest()).to.equal(0n);
    });

    it("34. reverts before maturity (1 second early)", async () => {
      const id = await openDefaultDeposit(f, f.user1, USDC(1_000));
      const d = await f.savingCore.getDeposit(id);
      // nextBlockAt: block chứa tx đặt ĐÚNG maturityAt - 1 (time.increaseTo sẽ mine
      // block luôn nên tx sau chạy ở target+1 → không test được boundary)
      await nextBlockAt(d.maturityAt - 1n);
      await expect(f.savingCore.connect(f.user1).withdrawAtMaturity(id))
        .to.be.revertedWithCustomError(f.savingCore, "SC_TooEarly");
    });

    it("35. allows withdraw AT exact maturityAt (boundary >= check, Q5)", async () => {
      const id = await openDefaultDeposit(f, f.user1, USDC(1_000));
      const d = await f.savingCore.getDeposit(id);
      // block chứa withdraw đặt ĐÚNG timestamp = maturityAt → check `>=` vẫn pass
      await nextBlockAt(d.maturityAt);
      await f.savingCore.connect(f.user1).withdrawAtMaturity(id);
      // thành công — boundary MAT ĐÚNG một giây
    });

    it("36. reverts double-withdraw (already Withdrawn)", async () => {
      const id = await openDefaultDeposit(f, f.user1, USDC(1_000));
      const d = await f.savingCore.getDeposit(id);
      await timeTravelTo(d.maturityAt);
      await f.savingCore.connect(f.user1).withdrawAtMaturity(id);

      await expect(f.savingCore.connect(f.user1).withdrawAtMaturity(id))
        .to.be.revertedWithCustomError(f.savingCore, "ERC721NonexistentToken");
    });

    it("37. reverts when not NFT owner", async () => {
      const id = await openDefaultDeposit(f, f.user1, USDC(1_000));
      const d = await f.savingCore.getDeposit(id);
      await timeTravelTo(d.maturityAt);

      await expect(f.savingCore.connect(f.user2).withdrawAtMaturity(id))
        .to.be.revertedWithCustomError(f.savingCore, "SC_NotDepositOwner");
    });

    it("38. reverts when system paused", async () => {
      const id = await openDefaultDeposit(f, f.user1, USDC(1_000));
      const d = await f.savingCore.getDeposit(id);
      await timeTravelTo(d.maturityAt);

      await f.vault.connect(f.owner).pause();
      await expect(f.savingCore.connect(f.user1).withdrawAtMaturity(id))
        .to.be.revertedWithCustomError(f.savingCore, "SC_SystemPaused");
    });

    it("39. reverts with unknown deposit", async () => {
      await expect(
        f.savingCore.connect(f.user1).withdrawAtMaturity(999),
      ).to.be.revertedWithCustomError(f.savingCore, "ERC721NonexistentToken");
    });

    it("40. still allows withdraw when plan disabled later (Q6 part)", async () => {
      const id = await openDefaultDeposit(f, f.user1, USDC(1_000));
      const d = await f.savingCore.getDeposit(id);
      await f.savingCore.connect(f.owner).setPlanEnabled(1, false);

      await timeTravelTo(d.maturityAt);
      await f.savingCore.connect(f.user1).withdrawAtMaturity(id);
      // thành công — user's money không bị trap
    });

    it("41. SNAPSHOT PROOF: admin updatePlan APR does NOT affect existing deposit", async () => {
      const id = await openDefaultDeposit(f, f.user1, USDC(1_000));
      const d = await f.savingCore.getDeposit(id);

      // Admin tăng APR lên 500 bps — chỉ ảnh hưởng deposit mới
      await f.savingCore.connect(f.owner).updatePlan(1, 500);
      expect((await f.savingCore.getDeposit(id)).aprBpsAtOpen).to.equal(300n);

      await timeTravelTo(d.maturityAt);
      const before = await f.usdc.balanceOf(f.user1.address);
      await f.savingCore.connect(f.user1).withdrawAtMaturity(id);

      // lãi vẫn 14.794520 với old 300 bps (chính xác), KHÔNG phải 500 bps (~24.66)
      expect((await f.usdc.balanceOf(f.user1.address)) - before)
        .to.equal(USDC(1_000) + TARGET_INTEREST);
      // tương ứng vault trả đúng old APR
      const vaultOut = USDC(500_000) - (await f.vault.getVaultBalance());
      expect(vaultOut).to.equal(TARGET_INTEREST);
    });
  });

  // ═══════════════════════════ earlyWithdraw ═══════════════════════════

  describe("earlyWithdraw", () => {
    it("42. deducts EXACT 4.5% penalty = 45 USDC, user gets 955", async () => {
      const id = await openDefaultDeposit(f, f.user1, USDC(1_000));

      const before = await f.usdc.balanceOf(f.user1.address);
      const [refunded, penalty] = await f.savingCore
        .connect(f.user1)
        .earlyWithdraw.staticCall(id);

      expect(penalty).to.equal(PENALTY_1000_USDC); // 45 USDC
      expect(refunded).to.equal(USDC(1_000) - PENALTY_1000_USDC); // 955

      await f.savingCore.connect(f.user1).earlyWithdraw(id);
      expect((await f.usdc.balanceOf(f.user1.address)) - before)
        .to.equal(USDC(1_000) - PENALTY_1000_USDC);
    });

    it("43. pays ZERO interest on early exit", async () => {
      const id = await openDefaultDeposit(f, f.user1, USDC(1_000));

      const vaultBefore = await f.vault.getVaultBalance();
      await f.savingCore.connect(f.user1).earlyWithdraw(id);
      // vault NHẬN 45 penalty rồi forward NGAY cho feeReceiver → net delta = 0
      // (vault chỉ là conduit; không có lãi nào được trả)
      expect(await f.vault.getVaultBalance()).to.equal(vaultBefore);
    });

    it("44. forwards penalty to feeReceiver", async () => {
      const id = await openDefaultDeposit(f, f.user1, USDC(1_000));

      await f.savingCore.connect(f.user1).earlyWithdraw(id);
      expect(await f.usdc.balanceOf(f.feeReceiver.address)).to.equal(PENALTY_1000_USDC);
    });

    it("45. emits Withdrawn(..., isEarly=true) + PenaltyCharged", async () => {
      const id = await openDefaultDeposit(f, f.user1, USDC(1_000));

      const tx = await f.savingCore.connect(f.user1).earlyWithdraw(id);
      await expect(tx)
        .to.emit(f.savingCore, "Withdrawn")
        .withArgs(id, f.user1.address, USDC(1_000) - PENALTY_1000_USDC, 0n, true);
      await expect(tx)
        .to.emit(f.savingCore, "PenaltyCharged")
        .withArgs(id, f.user1.address, PENALTY_1000_USDC);
    });

    it("46. reduces vault totalOwedInterest to 0 (C2)", async () => {
      const id = await openDefaultDeposit(f, f.user1, USDC(1_000));
      expect(await f.vault.totalOwedInterest()).to.equal(TARGET_INTEREST);
      await f.savingCore.connect(f.user1).earlyWithdraw(id);
      expect(await f.vault.totalOwedInterest()).to.equal(0n);
    });

    it("47. burns NFT + status Withdrawn", async () => {
      const id = await openDefaultDeposit(f, f.user1, USDC(1_000));
      await f.savingCore.connect(f.user1).earlyWithdraw(id);
      await expect(f.savingCore.ownerOf(id))
        .to.be.revertedWithCustomError(f.savingCore, "ERC721NonexistentToken");
      expect((await f.savingCore.getDeposit(id)).status).to.equal(1n);
    });

    it("48. ZERO penalty: user receives full principal when penaltyBps = 0", async () => {
      const planId = await createTestPlan(90, 200, 0, 0, 0); // no penalty
      // ĐÂY là deposit ĐẦU TIÊN (plan không tạo deposit id) — id phải lấy thật
      const id = await openPlanDeposit(planId, f.user1, USDC(500));

      const before = await f.usdc.balanceOf(f.user1.address);
      const [refunded, penalty] = await f.savingCore
        .connect(f.user1)
        .earlyWithdraw.staticCall(id);
      expect(penalty).to.equal(0n);
      expect(refunded).to.equal(USDC(500));

      await f.savingCore.connect(f.user1).earlyWithdraw(id);
      expect((await f.usdc.balanceOf(f.user1.address)) - before).to.equal(USDC(500));
      // feeReceiver không nhận gì
      expect(await f.usdc.balanceOf(f.feeReceiver.address)).to.equal(0n);
    });

    it("49. reverts on/after maturity (boundary: must use early BEFORE)", async () => {
      const id = await openDefaultDeposit(f, f.user1, USDC(1_000));
      const d = await f.savingCore.getDeposit(id);
      await nextBlockAt(d.maturityAt); // === maturityAt → KHÔNG còn Early (boundary >=)
      await expect(f.savingCore.connect(f.user1).earlyWithdraw(id))
        .to.be.revertedWithCustomError(f.savingCore, "SC_TooLate");
    });

    it("50. reverts when not owner", async () => {
      const id = await openDefaultDeposit(f, f.user1, USDC(1_000));
      await expect(f.savingCore.connect(f.user2).earlyWithdraw(id))
        .to.be.revertedWithCustomError(f.savingCore, "SC_NotDepositOwner");
    });

    it("51. reverts when system paused", async () => {
      const id = await openDefaultDeposit(f, f.user1, USDC(1_000));
      await f.vault.connect(f.owner).pause();
      await expect(f.savingCore.connect(f.user1).earlyWithdraw(id))
        .to.be.revertedWithCustomError(f.savingCore, "SC_SystemPaused");
    });
  });

  // ═══════════════════════════ renewDeposit (manual) ═══════════════════════════

  describe("renewDeposit", () => {
    /** Renew test dùng plan #2: 365 ngày, 500 bps, penalty 500 bps. */
    it("52. compounds interest into new principal (1.014794520 USDC units)", async () => {
      const id = await openDefaultDeposit(f, f.user1, USDC(1_000));
      const d = await f.savingCore.getDeposit(id);
      await timeTravelTo(d.maturityAt);

      const plan2 = await createTestPlan(365, 500, 0, 0, 500);
      const newId = await f.savingCore.depositCount() + 1n;
      await f.savingCore.connect(f.user1).renewDeposit(id, plan2);

      // old: status ManualRenewed (2), NFT burn
      const old = await f.savingCore.getDeposit(id);
      expect(old.status).to.equal(2n);
      await expect(f.savingCore.ownerOf(id))
        .to.be.revertedWithCustomError(f.savingCore, "ERC721NonexistentToken");

      // new: principal = 1.000 + 14.794520 = 1.014,794520 USDC
      const nd = await f.savingCore.getDeposit(newId);
      expect(nd.principal).to.equal(USDC(1_000) + TARGET_INTEREST);
      expect(nd.aprBpsAtOpen).to.equal(500n); // plan MỚI
      expect(nd.penaltyBpsAtOpen).to.equal(500n);
      expect(nd.tenorDays).to.equal(365n);
      expect(await f.savingCore.ownerOf(newId)).to.equal(f.user1.address);
    });

    it("53. emits Renewed(oldId, newId, newPrincipal, newPlanId)", async () => {
      const id = await openDefaultDeposit(f, f.user1, USDC(1_000));
      const d = await f.savingCore.getDeposit(id);
      await timeTravelTo(d.maturityAt);

      const plan2 = await createTestPlan(365, 500, 0, 0, 500);
      const newId = (await f.savingCore.depositCount()) + 1n;

      await expect(f.savingCore.connect(f.user1).renewDeposit(id, plan2))
        .to.emit(f.savingCore, "Renewed")
        .withArgs(id, newId, USDC(1_000) + TARGET_INTEREST, plan2);
    });

    it("54. owed-interest accounting: old decreases, new increases (C2)", async () => {
      const id = await openDefaultDeposit(f, f.user1, USDC(1_000));
      await timeTravelTo((await f.savingCore.getDeposit(id)).maturityAt);
      const plan2 = await createTestPlan(365, 500, 0, 0, 500);

      // owed trước: 14_794_520 ( từ plan1) + plan2 chưa dùng
      const owedBefore = await f.vault.totalOwedInterest();
      expect(owedBefore).to.equal(TARGET_INTEREST);

      await f.savingCore.connect(f.user1).renewDeposit(id, plan2);

      // owed mới = (1.000 + 14.794520) USDC × 365 ngày × 500 bps
      const newOwed = ((USDC(1_000) + TARGET_INTEREST) * 365n * BigInt(DAY)) * 500n
        / (31_536_000n * 10_000n);
      expect(await f.vault.totalOwedInterest()).to.equal(newOwed);
    });

    it("55. interest moved from vault into SavingCore (compound, no leak)", async () => {
      const id = await openDefaultDeposit(f, f.user1, USDC(1_000));
      await timeTravelTo((await f.savingCore.getDeposit(id)).maturityAt);

      const vaultBefore = await f.vault.getVaultBalance();
      const userBefore = await f.usdc.balanceOf(f.user1.address);

      await f.savingCore.connect(f.user1).renewDeposit(1n, await createTestPlan(365, 500, 0, 0, 500));

      // vault mất đúng interest; user không nhận token nào trực tiếp
      expect(vaultBefore - (await f.vault.getVaultBalance())).to.equal(TARGET_INTEREST);
      expect(await f.usdc.balanceOf(f.user1.address)).to.equal(userBefore);
    });

    it("56. reverts before maturity", async () => {
      const id = await openDefaultDeposit(f, f.user1, USDC(1_000));
      const plan2 = await createTestPlan(30, 200);
      await expect(f.savingCore.connect(f.user1).renewDeposit(id, plan2))
        .to.be.revertedWithCustomError(f.savingCore, "SC_TooEarly");
    });

    it("57. reverts when renewing INTO disabled plan (Q6)", async () => {
      const id = await openDefaultDeposit(f, f.user1, USDC(1_000));
      await timeTravelTo((await f.savingCore.getDeposit(id)).maturityAt);

      const plan2 = await createTestPlan(30, 200);
      await f.savingCore.connect(f.owner).setPlanEnabled(plan2, false);

      await expect(f.savingCore.connect(f.user1).renewDeposit(id, plan2))
        .to.be.revertedWithCustomError(f.savingCore, "SC_PlanNotEnabled");
    });

    it("57b. reverts with unknown newPlanId", async () => {
      const id = await openDefaultDeposit(f, f.user1, USDC(1_000));
      await timeTravelTo((await f.savingCore.getDeposit(id)).maturityAt);
      await expect(f.savingCore.connect(f.user1).renewDeposit(id, 999))
        .to.be.revertedWithCustomError(f.savingCore, "SC_PlanUnknown");
    });

    it("58. reverts double-renew (second call fails on nonexistent token)", async () => {
      const id = await openDefaultDeposit(f, f.user1, USDC(1_000));
      await timeTravelTo((await f.savingCore.getDeposit(id)).maturityAt);
      const plan2 = await createTestPlan(30, 200);
      await f.savingCore.connect(f.user1).renewDeposit(id, plan2);

      await expect(f.savingCore.connect(f.user1).renewDeposit(id, plan2))
        .to.be.revertedWithCustomError(f.savingCore, "ERC721NonexistentToken");
    });

    it("59. renewing into SAME plan allowed", async () => {
      const id = await openDefaultDeposit(f, f.user1, USDC(1_000));
      await timeTravelTo((await f.savingCore.getDeposit(id)).maturityAt);
      await f.savingCore.connect(f.user1).renewDeposit(id, 1); // chính plan 1
      const nd = await f.savingCore.getDeposit(2n);
      expect(nd.principal).to.equal(USDC(1_000) + TARGET_INTEREST);
    });

    it("60. reverts when not owner", async () => {
      const id = await openDefaultDeposit(f, f.user1, USDC(1_000));
      await timeTravelTo((await f.savingCore.getDeposit(id)).maturityAt);
      await expect(f.savingCore.connect(f.user2).renewDeposit(id, 1))
        .to.be.revertedWithCustomError(f.savingCore, "SC_NotDepositOwner");
    });

    it("61. reverts when system paused", async () => {
      const id = await openDefaultDeposit(f, f.user1, USDC(1_000));
      await timeTravelTo((await f.savingCore.getDeposit(id)).maturityAt);
      await f.vault.connect(f.owner).pause();
      await expect(f.savingCore.connect(f.user1).renewDeposit(id, 1))
        .to.be.revertedWithCustomError(f.savingCore, "SC_SystemPaused");
    });
  });

  // ═══════════════════════════ autoRenewDeposit ═══════════════════════════

  describe("autoRenewDeposit", () => {
    it("62. reverts BEFORE grace period ends (< 3 days)", async () => {
      const id = await openDefaultDeposit(f, f.user1, USDC(1_000));
      const d = await f.savingCore.getDeposit(id);

      // block chứa autoRenew đặt ĐÚNG grace_end - 1s → vẫn TooLate (boundary <)
      await nextBlockAt(d.maturityAt + BigInt(GRACE_PERIOD_SECONDS) - 1n);
      await expect(f.savingCore.connect(f.bot).autoRenewDeposit(id))
        .to.be.revertedWithCustomError(f.savingCore, "SC_TooLate");
    });

    it("63. succeeds AT exact grace boundary (maturityAt + 3 days)", async () => {
      const id = await openDefaultDeposit(f, f.user1, USDC(1_000));
      const d = await f.savingCore.getDeposit(id);
      await nextBlockAt(d.maturityAt + BigInt(GRACE_PERIOD_SECONDS));

      await f.savingCore.connect(f.bot).autoRenewDeposit(id);

      const nd = await f.savingCore.getDeposit(2n);
      expect(nd.principal).to.equal(USDC(1_000) + TARGET_INTEREST);
      expect((await f.savingCore.getDeposit(id)).status).to.equal(3n); // AutoRenewed
    });

    it("64. bot (non-owner, non-depositor) can call after grace", async () => {
      const id = await openDefaultDeposit(f, f.user2, USDC(2_000));
      const d = await f.savingCore.getDeposit(id);
      await timeTravelTo(d.maturityAt + BigInt(GRACE_PERIOD_SECONDS) + 100n);
      // bot gọi, deposit của user2
      await f.savingCore.connect(f.bot).autoRenewDeposit(id);
    });

    it("65. locks ORIGINAL APR even after admin lowered plan APR", async () => {
      const id = await openDefaultDeposit(f, f.user1, USDC(1_000));
      const d = await f.savingCore.getDeposit(id);

      // admin hạ APR còn 100 bps
      await f.savingCore.connect(f.owner).updatePlan(1, 100);

      await timeTravelTo(d.maturityAt + BigInt(GRACE_PERIOD_SECONDS));
      await f.savingCore.connect(f.bot).autoRenewDeposit(id);

      const nd = await f.savingCore.getDeposit(2n);
      // APR snapshot giữ 300 bps, KHÔNG phải 100 bps ( hiện plan)
      expect(nd.aprBpsAtOpen).to.equal(300n);
      // tenor giữ nguyên 180 ngày
      expect(nd.tenorDays).to.equal(180n);
    });

    it("66. keeps SAME tenor", async () => {
      const id = await openDefaultDeposit(f, f.user1, USDC(1_000));
      const d = await f.savingCore.getDeposit(id);
      await timeTravelTo(d.maturityAt + BigInt(GRACE_PERIOD_SECONDS));
      await f.savingCore.connect(f.bot).autoRenewDeposit(id);
      expect((await f.savingCore.getDeposit(2n)).tenorDays).to.equal(180n);
    });

    it("67. works even when plan is disabled (user's snapshot keeps value)", async () => {
      const id = await openDefaultDeposit(f, f.user1, USDC(1_000));
      await f.savingCore.connect(f.owner).setPlanEnabled(1, false);

      const d = await f.savingCore.getDeposit(id);
      await timeTravelTo(d.maturityAt + BigInt(GRACE_PERIOD_SECONDS));
      await f.savingCore.connect(f.bot).autoRenewDeposit(id);
      expect((await f.savingCore.getDeposit(2n)).status).to.equal(0n); // Active
    });

    it("68. emits Renewed", async () => {
      const id = await openDefaultDeposit(f, f.user1, USDC(1_000));
      const d = await f.savingCore.getDeposit(id);
      await timeTravelTo(d.maturityAt + BigInt(GRACE_PERIOD_SECONDS));

      const newId = (await f.savingCore.depositCount()) + 1n;
      await expect(f.savingCore.connect(f.bot).autoRenewDeposit(id))
        .to.emit(f.savingCore, "Renewed")
        .withArgs(id, newId, USDC(1_000) + TARGET_INTEREST, 1);
    });

    it("69. old NFT burnt; new NFT minted to CURRENT owner", async () => {
      const id = await openDefaultDeposit(f, f.user1, USDC(1_000));
      // chuyển NFT cho user2 trước khi maturity (transferable certificate, Q1)
      await f.savingCore.connect(f.user1)["transferFrom(address,address,uint256)"](
        f.user1.address, f.user2.address, id,
      );

      const d = await f.savingCore.getDeposit(id);
      await timeTravelTo(d.maturityAt + BigInt(GRACE_PERIOD_SECONDS));
      await f.savingCore.connect(f.bot).autoRenewDeposit(id);

      const newId = 2n;
      expect(await f.savingCore.ownerOf(newId)).to.equal(f.user2.address);
    });

    it("70. reverts double auto-renew", async () => {
      const id = await openDefaultDeposit(f, f.user1, USDC(1_000));
      const d = await f.savingCore.getDeposit(id);
      await timeTravelTo(d.maturityAt + BigInt(GRACE_PERIOD_SECONDS));
      await f.savingCore.connect(f.bot).autoRenewDeposit(id);

      // autoRenewDeposit check status TRƯỚC ownerOf (bot gọi được) → SC_DepositNotActive
      await expect(f.savingCore.connect(f.bot).autoRenewDeposit(id))
        .to.be.revertedWithCustomError(f.savingCore, "SC_DepositNotActive");
    });

    it("71. reverts when system paused", async () => {
      const id = await openDefaultDeposit(f, f.user1, USDC(1_000));
      await f.vault.connect(f.owner).pause();
      await expect(f.savingCore.connect(f.bot).autoRenewDeposit(id))
        .to.be.revertedWithCustomError(f.savingCore, "SC_SystemPaused");
    });
  });

  // ═══════════════════════════ Views ═══════════════════════════

  describe("Views", () => {
    it("72. previewInterest exact va time-travel math", async () => {
      const id = await openDefaultDeposit(f, f.user1, USDC(1_000));
      expect(await f.savingCore.previewInterest(id)).to.equal(TARGET_INTEREST);
    });

    it("73. previewExit returns formula-correct values", async () => {
      const id = await openDefaultDeposit(f, f.user1, USDC(1_000));
      const [principal, interest, penalty, amountIfEarly, maturityAt, status] =
        await f.savingCore.previewExit(id);

      expect(principal).to.equal(USDC(1_000));
      expect(interest).to.equal(TARGET_INTEREST);
      expect(penalty).to.equal(PENALTY_1000_USDC);
      expect(amountIfEarly).to.equal(USDC(1_000) - PENALTY_1000_USDC);
      expect(maturityAt).to.equal((await f.savingCore.getDeposit(id)).maturityAt);
      expect(status).to.equal(0n);
    });

    it("74. canAutoRenew boundary: false trước / true sau grace", async () => {
      const id = await openDefaultDeposit(f, f.user1, USDC(1_000));
      const d = await f.savingCore.getDeposit(id);

      expect(await f.savingCore.canAutoRenew(id)).to.equal(false);
      await timeTravelTo(d.maturityAt + BigInt(GRACE_PERIOD_SECONDS) - 1n);
      expect(await f.savingCore.canAutoRenew(id)).to.equal(false);

      await timeTravelTo(d.maturityAt + BigInt(GRACE_PERIOD_SECONDS));
      expect(await f.savingCore.canAutoRenew(id)).to.equal(true);
    });

    it("75. planCount/depositCount + unknown getPlan/getDeposit revert", async () => {
      expect(await f.savingCore.planCount()).to.equal(1n);

      await createTestPlan(30, 200);
      expect(await f.savingCore.planCount()).to.equal(2n);

      await expect(f.savingCore.getPlan(3)).to.be.revertedWithCustomError(
        f.savingCore, "SC_PlanUnknown");
      await expect(f.savingCore.getDeposit(999)).to.be.revertedWithCustomError(
        f.savingCore, "SC_UnknownDeposit");
    });
    it("76. getPlan changes NOT affect existing deposit (compound snapshot integrity)", async () => {
      // kết hợp: mở ở 300 bps → update → previewInterest của deposit cũ vẫn 300
      const id = await openDefaultDeposit(f, f.user1, USDC(1_000));
      await f.savingCore.connect(f.owner).updatePlan(1, 9999);
      expect(await f.savingCore.previewInterest(id)).to.equal(TARGET_INTEREST);
    });

    it("77. ERC721 enumeration works", async () => {
      await openDefaultDeposit(f, f.user1, USDC(1_000));
      await openDefaultDeposit(f, f.user1, USDC(2_000));

      expect(await f.savingCore.balanceOf(f.user1.address)).to.equal(2n);
      expect(await f.savingCore["tokenOfOwnerByIndex(address,uint256)"](f.user1.address, 0))
        .to.equal(1n);
      expect(await f.savingCore["tokenOfOwnerByIndex(address,uint256)"](f.user1.address, 1))
        .to.equal(2n);
    });

    it("78. name/symbol của certificate NFT", async () => {
      expect(await f.savingCore.name()).to.equal("Bank Deposit Certificate");
      expect(await f.savingCore.symbol()).to.equal("DEP");
    });

    it("83. previewInterest / previewExit revert with unknown deposit", async () => {
      await expect(f.savingCore.previewInterest(999))
        .to.be.revertedWithCustomError(f.savingCore, "SC_UnknownDeposit");
      await expect(f.savingCore.previewExit(999))
        .to.be.revertedWithCustomError(f.savingCore, "SC_UnknownDeposit");
    });

    it("84. canAutoRenew unknown deposit → false", async () => {
      expect(await f.savingCore.canAutoRenew(999)).to.equal(false);
    });
  });

  // ═══════════════════════════ C2 invariant ═══════════════════════════
  // C2 invariant: owed sau khi kết hợp nhiều deposits vẫn chính xác
  // ════════════════════════════════════════════════════════════════════

  describe("C2 invariant across flows", () => {
    it("79. owed decreases on early + full withdraw + renew paths", async () => {
      // Lưu ý rounding: owed tính PER-DEPOSIT (multiply-before-divide floor),
      // KHÔNG tỉ lệ tuyến tính đơn thuần (2 × owedPer1000 ≠ owed của 2.000 USDC)
      const denom = 31_536_000n * 10_000n;
      const owedOf = (p: bigint, tenorDays: bigint, aprBps: bigint) =>
        (p * tenorDays * 86400n * aprBps) / denom;

      // id1: plan 30 ngày (tenor khác plan1 để earlyWithdraw hợp lệ)
      const plan30 = await createTestPlan(30, 200, 0, 0, 100);
      const id1 = await openPlanDeposit(plan30, f.user1, USDC(1_000));
      // id2, id3: plan1 mặc định (180d / 300 bps)
      const id2 = await openDefaultDeposit(f, f.user2, USDC(500));
      const id3 = await openDefaultDeposit(f, f.user1, USDC(2_000));

      const owed1000Plan30 = owedOf(USDC(1_000), 30n, 200n);
      const owed500 = owedOf(USDC(500), 180n, 300n);
      const owed2000 = owedOf(USDC(2_000), 180n, 300n);
      expect(await f.vault.totalOwedInterest())
        .to.equal(owed1000Plan30 + owed500 + owed2000);

      // early id1 (30d tenor — còn xa maturity) trước khi travel
      await f.savingCore.connect(f.user1).earlyWithdraw(id1);
      expect(await f.vault.totalOwedInterest()).to.equal(owed500 + owed2000);

      // travel tới maturity của id3 (id2 mở ~1s sớm hơn → cũng đã đến hạn)
      await timeTravelTo((await f.savingCore.getDeposit(id3)).maturityAt);
      await f.savingCore.connect(f.user1).withdrawAtMaturity(id3);
      expect(await f.vault.totalOwedInterest()).to.equal(owed500);

      // renew id2 vào plan 60 ngày / 400 bps
      const plan60 = await createTestPlan(60, 400, 0, 0, 100);
      await f.savingCore.connect(f.user2).renewDeposit(id2, plan60);

      const owedAfterRenew = owedOf(USDC(500) + owed500, 60n, 400n);
      expect(await f.vault.totalOwedInterest()).to.equal(owedAfterRenew);
    });
  });

  // ═══════════════════════════ Deployment & ERC165 ═══════════════════════════

  describe("Deployment & ERC165", () => {
    it("80. reverts deploy with zero-address token", async () => {
      const Factory = await ethers.getContractFactory("SavingCore");
      await expect(
        Factory.deploy(ethers.ZeroAddress, await f.vault.getAddress(), 86400),
      ).to.be.revertedWithCustomError(Factory, "SC_InvalidPlan");
    });

    it("81. reverts deploy with zero-address vault", async () => {
      const Factory = await ethers.getContractFactory("SavingCore");
      await expect(
        Factory.deploy(await f.usdc.getAddress(), ethers.ZeroAddress, 86400),
      ).to.be.revertedWithCustomError(Factory, "SC_InvalidPlan");
    });

    it("82. supportsInterface: ERC721 (0x80ac58cd) + Enumerable (0x780e9d63) true, unknown false", async () => {
      expect(await f.savingCore.supportsInterface("0x80ac58cd")).to.equal(true);
      expect(await f.savingCore.supportsInterface("0x780e9d63")).to.equal(true);
      expect(await f.savingCore.supportsInterface("0xdeadbeef")).to.equal(false);
    });
  });
});

