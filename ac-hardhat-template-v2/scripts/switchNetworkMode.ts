import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const mode = process.argv[2]; // 'day1' or 'day86400'
if (mode !== "day1" && mode !== "day86400") {
  console.error("Usage: npx hardhat run scripts/switchNetworkMode.ts -- day1 | day86400");
  process.exit(1);
}

const day1 = {
  MockUSDC: "0xe08566d39C9a8859C74d95959Df9132755BB11c1",
  VaultManager: "0xd187926520fbdB8c2Cd779A3CE72443449E866a9",
  SavingCore: "0x7181ab0d7F5a2069Cb53C92f1C209D6526EE6C68",
};

const day86400 = {
  MockUSDC: "0xFeb9C05228Fc756f042316fdcc0f976306613853",
  VaultManager: "0x72a2e7c30cBD2595c5d2ECa94A9d6b6f23BDab6F",
  SavingCore: "0xdB882301F5C940A6238870B6B15F2674553BaebF",
};

const target = mode === "day1" ? day1 : day86400;
const rootDir = process.cwd();
const addressesPath = join(rootDir, "..", "frontend", "src", "config", "addresses.json");

const current = JSON.parse(await readFile(addressesPath, "utf8"));
current["11155111"] = target;
current.sepoliaModes = { day1, day86400 };

await writeFile(addressesPath, JSON.stringify(current, null, 2), "utf8");
console.log(`\n✅ Đã chuyển frontend Sepolia sang bản: ${mode.toUpperCase()}`);
console.log(`- MockUSDC:   ${target.MockUSDC}`);
console.log(`- Vault:      ${target.VaultManager}`);
console.log(`- SavingCore: ${target.SavingCore}\n`);

