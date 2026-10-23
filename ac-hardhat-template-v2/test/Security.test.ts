import { expect } from "chai";
import {
  USDC,
  DAY,
  ethers,
  networkHelpers,
  deployCommonFixture,
  timeTravelTo,
  latestTime,
  type CommonFixture,
} from "./helpers/setup";
import type { MaliciousDepositor } from "../typechain-types";

// ════════════════════════════════════════════════════════════════════
//  SavingCore — SECURITY (P4): reentrancy, NFT transfer rights, dust,
//  2-user isolation, preview == payout, overflow guard.
// ════════════════════════════════════════════════════════════════════

describe("SavingCore — Security", () => {
  let f: CommonFixture;

  beforeEach(async () => {
    f = await networkHelpers.loadFixture(deployCommonFixture);
  });

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

  // ═══════════════════════════ T-A18: Reentrancy ═══════════════════════════

  describe("reentrancy (T-A18)", () => {
    /** Deploy attacker, nạp vốn, mở deposit với mode tấn công sẵn. */
    async function attackSetup(mode: number) {
      const attacker = (await ethers.deployContract("MaliciousDepositor", [
        await f.savingCore.getAddress(),
        await f.usdc.getAddress(),
      ])) as unknown as MaliciousDepositor;
      await f.usdc.mint(await attacker.getAddress(), USDC(5_000));
      await attacker.setMode(mode);
      await attacker.openDeposit(1, USDC(1_000)); // _safeMint → hook reentry
      return attacker;
    }

    it("S1. re-enter withdrawAtMaturity trong _safeMint → nonReentrant chặn (0 attack)", async () => {
      const attacker = await attackSetup(1); // 1 = TryWithdraw

      expect(await attacker.attackCount()).to.equal(0n);
      // deposit vẫn Active — NFT thuộc attacker, không bị rút kịp
      expect(await f.savingCore.ownerOf(1n)).to.equal(await attacker.getAddress());
      expect((await f.savingCore.getDeposit(1n)).status).to.equal(0n);

      // Deposit lành comitant: attacker rút bình thường sau maturity
      await timeTravelTo((await f.savingCore.getDeposit(1n)).maturityAt);
      const before = await f.usdc.balanceOf(await attacker.getAddress());
      await attacker.normalWithdraw();
      expect(
        (await f.usdc.balanceOf(await attacker.getAddress())) - before,
      ).to.equal(USDC(1_000) + 14_794_520n);
    });

    it("S2. re-enter earlyWithdraw trong _safeMint → chặn (0 attack)", async () => {
      const attacker = await attackSetup(2); // 2 = TryEarly

      expect(await attacker.attackCount()).to.equal(0n);
      // vẫn Active, principal 1.000 còn nguyên
      expect((await f.savingCore.getDeposit(1n)).principal).to.equal(USDC(1_000));
      // owed không bị mau thay đổi
      expect(await f.vault.totalOwedInterest()).to.equal(14_794_520n);
    });
  });

  // ═══════════════════════════ T-A2/T-A3: NFT transfer rights ═══════════════════════════

  describe("NFT rights (T-A2/T-A3)", () => {
    it("S3. NFT chuyển nhượng trước maturity: owner mới withdraw được, chủ cũ revert", async () => {
      const id = 1n;
      await f.savingCore.connect(f.user1).openDeposit(1, USDC(1_000));

      await f.savingCore.connect(f.user1)["transferFrom(address,address,uint256)"](
        f.user1.address, f.user2.address, id,
      );

      const d = await f.savingCore.getDeposit(id);
      await timeTravelTo(d.maturityAt);

      // user2 là owner MỚI → toàn quyền
      const before2 = await f.usdc.balanceOf(f.user2.address);
      await f.savingCore.connect(f.user2).withdrawAtMaturity(id);
      expect((await f.usdc.balanceOf(f.user2.address)) - before2)
        .to.equal(USDC(1_000) + 14_794_520n);

      // owner CŨ rút → (không còn NFT) revert nonexistent
      await expect(f.savingCore.connect(f.user1).withdrawAtMaturity(id))
        .to.be.revertedWithCustomError(f.savingCore, "ERC721NonexistentToken");
    });

    it("S4. NFT đã tất toán (burn) KHÔNG thể transfer (T-A3)", async () => {
      const id = 1n;
      await f.savingCore.connect(f.user1).openDeposit(1, USDC(1_000));
      await f.savingCore.connect(f.user1).earlyWithdraw(id);

      await expect(
        f.savingCore.connect(f.user1)['transferFrom(address,address,uint256)'](
          f.user1.address, f.user2.address, id,
        ),
      ).to.be.revertedWithCustomError(f.savingCore, "ERC721NonexistentToken");
    });
  });

  // ═══════════════════════════ T-A19: dust ═══════════════════════════

  describe("dust (T-A19)", () => {
    it("S5. deposit 1 unit: lãi 0, không revert, dust nằm ở vault", async () => {
      const planId = await createTestPlan(30, 300, 0, 0, 450); // min = 0
      await f.savingCore.connect(f.user1).openDeposit(planId, 1n);

      const d = await f.savingCore.getDeposit(1n);
      expect(d.principal).to.equal(1n);
      // owed est bằng 0 (nhanh nhỏ hơn 1e-3 = 1 unit)
      expect(await f.vault.totalOwedInterest()).to.equal(0n);
      expect(await f.savingCore.previewInterest(1n)).to.equal(0n);

      await timeTravelTo(d.maturityAt);
      const before = await f.usdc.balanceOf(f.user1.address);
      const paid = await f.savingCore
        .connect(f.user1)
        .withdrawAtMaturity.staticCall(1n);
      expect(paid).to.equal(0n); // lãi = 0 → trả ngay 0, KHÔNG defer event

      await f.savingCore.connect(f.user1).withdrawAtMaturity(1n);
      expect((await f.usdc.balanceOf(f.user1.address)) - before).to.equal(1n);
      // vault độc lập (dust vẫn ở vault không bị lôi vào)
      expect(await f.vault.getVaultBalance()).to.equal(USDC(500_000));
      expect(await f.savingCore.pendingInterestOf(f.user1.address)).to.equal(0n);
    });
  });

  // ═══════════════════════════ T-A20: 2 users isolated ═══════════════════════════

  describe("2-user isolation (T-A20)", () => {
    it("S6. hai user độc lập: số dư & owed không lẫn", async () => {
      await f.savingCore.connect(f.user1).openDeposit(1, USDC(1_000));
      await f.savingCore.connect(f.user2).openDeposit(1, USDC(2_000));

      expect((await f.savingCore.getDeposit(1n)).principal).to.equal(USDC(1_000));
      expect((await f.savingCore.getDeposit(2n)).principal).to.equal(USDC(2_000));

      // owed = O(1000) + O(2000)
      const owed2000 = ((USDC(2_000) * 180n * 86400n) * 300n) / (31_536_000n * 10_000n);
      expect(await f.vault.totalOwedInterest()).to.equal(14_794_520n + owed2000);

      // mỗi user rút cái của mình, số dư riêng
      await timeTravelTo((await f.savingCore.getDeposit(1n)).maturityAt);
      const b1 = await f.usdc.balanceOf(f.user1.address);
      await f.savingCore.connect(f.user1).withdrawAtMaturity(1n);
      expect((await f.usdc.balanceOf(f.user1.address)) - b1)
        .to.equal(USDC(1_000) + 14_794_520n);

      // user2 chưa rút: owed còn của 2000
      expect(await f.vault.totalOwedInterest()).to.equal(owed2000);
    });
  });

  // ═══════════════════════════ T-A21: preview == payout ═══════════════════════════

  describe("previewInterest == payout (T-A21)", () => {
    it("S7. khớp 100% cho 5 tenor khác nhau", async () => {
      const tenors = [
        { tenor: 30, apr: 200 },
        { tenor: 60, apr: 350 },
        { tenor: 90, apr: 400 },
        { tenor: 180, apr: 500 },
        { tenor: 365, apr: 800 },
      ];
      const denom = 31_536_000n * 10_000n;

      let planId = 1n; // plan 1 = fixture (không dùng ở vòng này)
      for (const { tenor, apr } of tenors) {
        planId = await createTestPlan(tenor, apr, 0, 0, 0);
        await f.savingCore.connect(f.user1).openDeposit(planId, USDC(1_000));

        const id = (await f.savingCore.depositCount());
        const d = await f.savingCore.getDeposit(id);
        await timeTravelTo(d.maturityAt);

        const preview = await f.savingCore.previewInterest(id);
        // contract tính công thức như test => preview khớp payout
        const paid = await f.savingCore
          .connect(f.user1)
          .withdrawAtMaturity.staticCall(id);

        expect(paid).to.equal(preview);
        expect(preview).to.be.above(0n);

        await f.savingCore.connect(f.user1).withdrawAtMaturity(id);
        expect(await f.vault.totalOwedInterest()).to.equal(0n);
      }
    });
  });

  // ═══════════════════════════ T-A22: overflow guard ═══════════════════════════

  describe("overflow guard (T-A22)", () => {
    it("S8. mở/topUp vượt MAX_PRINCIPAL → revert; KHÔNG overflow lãi", async () => {
      const cap = 1_000_000_000_000_000n * 1_000_000n; // 1e15 USDC

      // user1 không đủ tiền → chỉ assert lỗi protected (cap check chạy TRƯỚC transferFrom)
      await expect(
        f.savingCore.connect(f.user1).openDeposit(1, cap + 1n),
      ).to.be.revertedWithCustomError(f.savingCore, "SC_AmountTooLarge");

      // top-up vượt cap: mở nhỏ, nạp cap → exceeds
      await f.savingCore.connect(f.user1).openDeposit(1, USDC(100));
      await expect(
        f.savingCore.connect(f.user1).topUpDeposit(1n, cap),
      ).to.be.revertedWithCustomError(f.savingCore, "SC_AmountTooLarge");

      // state không đổi
      expect((await f.savingCore.getDeposit(1n)).principal).to.equal(USDC(100));
    });
  });
});
