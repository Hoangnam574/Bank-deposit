import { expect } from "chai";
import {
  USDC,
  ethers,
  networkHelpers,
  deployBaseFixture,
  type BaseFixture,
} from "./helpers/setup";

// ════════════════════════════════════════════════════════════════════
//  VaultManager — 20 test case theo EXECUTION_PLAN (T1.8)
//  Nhóm: Deployment / Plan chỉnh sửa config / fundVault / withdrawVault (C2)
//        payInterest / receivePenalty / pause-unpause / owed-interest tracking
// ════════════════════════════════════════════════════════════════════

describe("VaultManager", () => {
  let f: BaseFixture;

  beforeEach(async () => {
    f = await networkHelpers.loadFixture(deployBaseFixture);
  });

  // ═══════════════════════════ Deployment ═══════════════════════════

  describe("Deployment", () => {
    it("1. exists with correct token and feeReceiver", async () => {
      expect(await f.vault.getAddress()).to.not.equal(ethers.ZeroAddress);
      expect(await f.vault.token()).to.equal(await f.usdc.getAddress());
      expect(await f.vault.feeReceiver()).to.equal(f.feeReceiver.address);
      expect(await f.vault.owner()).to.equal(f.owner.address);
      expect(await f.vault.isPaused()).to.equal(false);
      expect(await f.vault.pausedAt()).to.equal(0n);
      expect(await f.vault.totalOwedInterest()).to.equal(0n);
    });

    it("2. reverts deploy with zero-address token", async () => {
      const Factory = await ethers.getContractFactory("VaultManager");
      await expect(
        Factory.deploy(ethers.ZeroAddress, f.feeReceiver.address),
      ).to.be.revertedWithCustomError(Factory, "VM_ZeroAddress");
    });

    it("3. reverts deploy with zero-address feeReceiver", async () => {
      const Factory = await ethers.getContractFactory("VaultManager");
      await expect(
        Factory.deploy(await f.usdc.getAddress(), ethers.ZeroAddress),
      ).to.be.revertedWithCustomError(Factory, "VM_ZeroAddress");
    });
  });

  // ═══════════════════════════ Admin config ═══════════════════════════

  describe("setSavingCore / setFeeReceiver", () => {
    it("4. owner updates savingCore → event SavingCoreUpdated", async () => {
      const newSC = f.user2.address;
      await expect(f.vault.connect(f.owner).setSavingCore(newSC))
        .to.emit(f.vault, "SavingCoreUpdated")
        .withArgs(newSC);
      expect(await f.vault.savingCore()).to.equal(newSC);
    });

    it("5. owner updates feeReceiver → event FeeReceiverUpdated", async () => {
      const newFR = f.user1.address;
      await expect(f.vault.connect(f.owner).setFeeReceiver(newFR))
        .to.emit(f.vault, "FeeReceiverUpdated")
        .withArgs(newFR);
      expect(await f.vault.feeReceiver()).to.equal(newFR);
    });

    it("5b. reverts setSavingCore with zero address", async () => {
      await expect(f.vault.connect(f.owner).setSavingCore(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(f.vault, "VM_ZeroAddress");
    });

    it("5c. reverts setFeeReceiver with zero address", async () => {
      await expect(f.vault.connect(f.owner).setFeeReceiver(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(f.vault, "VM_ZeroAddress");
    });
  });

  // ═══════════════════════════ fundVault ═══════════════════════════

  describe("fundVault", () => {
    it("6. accepts tokens from owner → transfers + event", async () => {
      const before = await f.vault.getVaultBalance();
      const amount = USDC(10_000);

      await expect(f.vault.connect(f.owner).fundVault(amount))
        .to.emit(f.vault, "VaultFunded")
        .withArgs(f.owner.address, amount);

      const after = await f.vault.getVaultBalance();
      expect(after - before).to.equal(amount);
      expect(await f.usdc.balanceOf(f.owner.address)).to.equal(USDC(490_000));
    });

    it("7. reverts when non-owner calls", async () => {
      await expect(f.vault.connect(f.user1).fundVault(USDC(1)))
        .to.be.revertedWithCustomError(f.vault, "OwnableUnauthorizedAccount")
        .withArgs(f.user1.address);
    });

    it("8. reverts when amount == 0", async () => {
      await expect(f.vault.connect(f.owner).fundVault(0n))
        .to.be.revertedWithCustomError(f.vault, "VM_ZeroAmount");
    });
  });

  // ═══════════════════════ withdrawVault (C2) ═══════════════════════

  describe("withdrawVault + C2 Solvency Guard", () => {
    it("9. allows withdraw within balance (free surplus)", async () => {
      const amount = USDC(10_000);

      await expect(f.vault.connect(f.owner).withdrawVault(amount))
        .to.emit(f.vault, "VaultWithdrawn")
        .withArgs(f.owner.address, amount);

      expect(await f.vault.getVaultBalance()).to.equal(USDC(490_000));
      expect(await f.vault.getAvailableBalance()).to.equal(USDC(490_000)); // owed = 0
    });

    it("10. reverts when amount > balance", async () => {
      await expect(f.vault.connect(f.owner).withdrawVault(USDC(600_000)))
        .to.be.revertedWithCustomError(f.vault, "VM_InsufficientBalance");
    });

    it("11. reverts when withdraw would make vault insolvent (C2)", async () => {
      // tăng owed lên 100.000 USDC (giả lập deposit Active)
      await f.vault
        .connect(f.fakeSavingCore)
        .increaseOwedInterest(USDC(100_000));

      // vault 500.000 - 100.000 owed → rút tối đa 400.000 vẫn pass
      const withdrawOk = USDC(400_000);
      await expect(f.vault.connect(f.owner).withdrawVault(withdrawOk))
        .to.emit(f.vault, "VaultWithdrawn");

      // rút thêm 1 unit nữa → đủ balance nhưng bal - amount < owed → insolvent
      await expect(f.vault.connect(f.owner).withdrawVault(1n))
        .to.be.revertedWithCustomError(f.vault, "VM_Insolvent");
    });

    it("12. reverts when amount == 0", async () => {
      await expect(f.vault.connect(f.owner).withdrawVault(0n))
        .to.be.revertedWithCustomError(f.vault, "VM_ZeroAmount");
    });

    it("13. reverts when non-owner calls", async () => {
      await expect(f.vault.connect(f.user1).withdrawVault(1n))
        .to.be.revertedWithCustomError(f.vault, "OwnableUnauthorizedAccount");
    });
  });

  // ═══════════════════════ payInterest ═══════════════════════════

  describe("payInterest", () => {
    it("14. SavingCore pays interest to user → event + balance", async () => {
      const interest = USDC(10);
      expect(await f.user1.address).to.not.equal(ethers.ZeroAddress);

      await expect(
        f.vault.connect(f.fakeSavingCore).payInterest(f.user1.address, interest),
      )
        .to.emit(f.vault, "InterestPaid")
        .withArgs(f.user1.address, interest);

      expect(await f.usdc.balanceOf(f.user1.address)).to.equal(interest);
      expect(await f.vault.getVaultBalance()).to.equal(USDC(499_990));
    });

    it("15. reverts when vault insufficient", async () => {
      const demand = USDC(600_000); // vault chỉ 500.000
      await expect(
        f.vault.connect(f.fakeSavingCore).payInterest(f.user1.address, demand),
      ).to.be.revertedWithCustomError(f.vault, "VM_InsufficientBalance");
    });

    it("16. silently ignores zero amount (rounding case, C1-safe)", async () => {
      const tx = f.vault.connect(f.fakeSavingCore).payInterest(f.user1.address, 0n);
      // không revert, không event, không chuyển token
      await expect(tx).to.not.emit(f.vault, "InterestPaid");
      expect(await f.usdc.balanceOf(f.user1.address)).to.equal(0n);
    });

    it("17. reverts when non-SavingCore", async () => {
      await expect(
        f.vault.connect(f.user1).payInterest(f.user1.address, 1n),
      ).to.be.revertedWithCustomError(f.vault, "VM_NotSavingCore");
    });
  });

  // ═══════════════════════ receivePenalty ═══════════════════════════

  describe("receivePenalty", () => {
    it("18. forwards penalty to feeReceiver → event", async () => {
      const penalty = USDC(45); // 450 bps trên 1.000 USDC

      await expect(
        f.vault.connect(f.fakeSavingCore).receivePenalty(penalty),
      )
        .to.emit(f.vault, "PenaltyForwarded")
        .withArgs(f.fakeSavingCore.address, penalty, f.feeReceiver.address);

      expect(await f.usdc.balanceOf(f.feeReceiver.address)).to.equal(penalty);
      expect(await f.vault.getVaultBalance()).to.equal(USDC(499_955));
    });

    it("19. silently ignores zero amount", async () => {
      const tx = f.vault.connect(f.fakeSavingCore).receivePenalty(0n);
      await expect(tx).to.not.emit(f.vault, "PenaltyForwarded");
      expect(await f.usdc.balanceOf(f.feeReceiver.address)).to.equal(0n);
    });

    it("20. reverts when non-SavingCore", async () => {
      await expect(
        f.vault.connect(f.user1).receivePenalty(1n),
      ).to.be.revertedWithCustomError(f.vault, "VM_NotSavingCore");
    });

    it("20b. reverts when vault cannot cover penalty transfer", async () => {
      // penalty = 500.001 USDC > vault 500.000 → VM_InsufficientBalance
      await expect(
        f.vault.connect(f.fakeSavingCore).receivePenalty(USDC(500_001)),
      ).to.be.revertedWithCustomError(f.vault, "VM_InsufficientBalance");
    });
  });

  // ═══════════════════════ Security misc ═══════════════════════════

  describe("Security misc", () => {
    it("30. rejects direct ETH transfer", async () => {
      await expect(
        f.owner.sendTransaction({
          to: await f.vault.getAddress(),
          value: 1n,
        }),
      ).to.be.revertedWithCustomError(f.vault, "VM_EtherNotAccepted");
    });
  });

  // ═══════════════════════ pause / unpause ═══════════════════════════

  describe("pause / unpause", () => {
    it("21. pause toggles state + records pausedAt", async () => {
      await f.vault.connect(f.owner).pause();

      const latestBlock = await ethers.provider.getBlock("latest");
      expect(await f.vault.isPaused()).to.equal(true);
      expect(await f.vault.pausedAt()).to.equal(latestBlock!.timestamp);
    });

    it("22. unpause resets pausedAt to 0 (C5 countdown reset)", async () => {
      await f.vault.connect(f.owner).pause();
      await f.vault.connect(f.owner).unpause();

      expect(await f.vault.isPaused()).to.equal(false);
      expect(await f.vault.pausedAt()).to.equal(0n);
    });

    it("23. reverts pause/unpause when non-owner", async () => {
      await expect(f.vault.connect(f.user1).pause())
        .to.be.revertedWithCustomError(f.vault, "OwnableUnauthorizedAccount");
    });
  });

  // ═══════════════════════ owed-interest tracking ═══════════════════════════

  describe("owed-interest tracking (C2)", () => {
    it("24. increase / decrease / clamp to zero", async () => {
      // Tăng 100 USDC
      await expect(
        f.vault.connect(f.fakeSavingCore).increaseOwedInterest(USDC(100)),
      )
        .to.emit(f.vault, "OwedInterestIncreased")
        .withArgs(USDC(100), USDC(100));

      // Giảm 30
      await expect(
        f.vault.connect(f.fakeSavingCore).decreaseOwedInterest(USDC(30)),
      )
        .to.emit(f.vault, "OwedInterestDecreased")
        .withArgs(USDC(30), USDC(70));

      // clamp không âm: giảm 1.000 (≥ hiện tại) → về 0
      await expect(
        f.vault.connect(f.fakeSavingCore).decreaseOwedInterest(USDC(1_000)),
      ).to.emit(f.vault, "OwedInterestDecreased").withArgs(USDC(1_000), 0n);
    });

    it("25. reverts owed tracking when non-SavingCore", async () => {
      await expect(
        f.vault.connect(f.user1).increaseOwedInterest(1n),
      ).to.be.revertedWithCustomError(f.vault, "VM_NotSavingCore");

      await expect(
        f.vault.connect(f.user1).decreaseOwedInterest(1n),
      ).to.be.revertedWithCustomError(f.vault, "VM_NotSavingCore");
    });

    it("26. getAvailableBalance classifies balance vs owed", async () => {
      // owed = 50.000, vault = 500.000 → available = 450.000
      await f.vault.connect(f.fakeSavingCore).increaseOwedInterest(USDC(50_000));
      expect(await f.vault.getVaultBalance()).to.equal(USDC(500_000));
      expect(await f.vault.getAvailableBalance()).to.equal(USDC(450_000));

      // owed > balance (hiếm, defensive) → available = 0, không revert
      await f.vault
        .connect(f.fakeSavingCore)
        .decreaseOwedInterest(USDC(50_000));
      await f.vault.connect(f.owner).withdrawVault(USDC(499_000)); // còn 1.000
      await f.vault.connect(f.fakeSavingCore).increaseOwedInterest(USDC(2_000));
      expect(await f.vault.getVaultBalance()).to.equal(USDC(1_000));
      expect(await f.vault.totalOwedInterest()).to.equal(USDC(2_000));
      expect(await f.vault.getAvailableBalance()).to.equal(0n);
    });
  });
});
