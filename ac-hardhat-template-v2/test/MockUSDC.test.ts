import { expect } from "chai";
import {
  USDC,
  ethers,
  networkHelpers,
  deployBaseFixture,
  type BaseFixture,
} from "./helpers/setup";

// ════════════════════════════════════════════════════════════════════
//  MockUSDC — 5 test case theo EXECUTION_PLAN (T1.2)
// ════════════════════════════════════════════════════════════════════

describe("MockUSDC", () => {
  let f: BaseFixture;

  beforeEach(async () => {
    f = await networkHelpers.loadFixture(deployBaseFixture);
  });

  it("1. has name 'Mock USDC' and symbol 'USDC'", async () => {
    expect(await f.usdc.name()).to.equal("Mock USDC");
    expect(await f.usdc.symbol()).to.equal("USDC");
  });

  it("2. has 6 decimals (not 18!)", async () => {
    expect((await f.usdc.decimals()).toString()).to.equal("6");
  });

  it("3. allows ANYONE to mint", async () => {
    // user1 (không phải owner) mint bình thường — dùng cho faucet demo
    await f.usdc.connect(f.user1).mint(f.user2.address, USDC(42));
    expect(await f.usdc.balanceOf(f.user2.address)).to.equal(USDC(42));
  });

  it("4. transfers balances correctly", async () => {
    await f.usdc.mint(f.user1.address, USDC(10));

    // Trước khi transfer
    expect(await f.usdc.balanceOf(f.user1.address)).to.equal(USDC(10));
    expect(await f.usdc.balanceOf(f.user2.address)).to.equal(0n);

    await f.usdc.connect(f.user1).transfer(f.user2.address, USDC(4));

    expect(await f.usdc.balanceOf(f.user1.address)).to.equal(USDC(6));
    expect(await f.usdc.balanceOf(f.user2.address)).to.equal(USDC(4));
  });

  it("5. approve + transferFrom works", async () => {
    await f.usdc.mint(f.user1.address, USDC(20));
    await f.usdc.connect(f.user1).approve(f.user2.address, USDC(5));

    expect(await f.usdc.allowance(f.user1.address, f.user2.address)).to.equal(USDC(5));

    await f.usdc.connect(f.user2).transferFrom(f.user1.address, f.user2.address, USDC(5));

    expect(await f.usdc.balanceOf(f.user2.address)).to.equal(USDC(5));
    expect(await f.usdc.allowance(f.user1.address, f.user2.address)).to.equal(0n);
  });
});
