// ═══════════════════════════════════════════════════════════════════
// scripts/exportFrontend.ts — Export artifacts cho frontend (T5.4)
// ═══════════════════════════════════════════════════════════════════
// Đọc ABI từ ./artifacts/ (Hardhat compile) và addresses từ
// ./ignition/deployments/chain-<chainId>/deployed_addresses.json
// → ghi vào frontend/src:
//
//   frontend/src/abis/MockUSDC.json        (chỉ mảng ABI)
//   frontend/src/abis/VaultManager.json
//   frontend/src/abis/SavingCore.json
//   frontend/src/config/addresses.json     ({ chainId: { MockUSDC, ... } })
//
// → Frontend build không cần sửa tay. Chạy lại mỗi khi redeploy.
// ═══════════════════════════════════════════════════════════════════

import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const MODULE_ID = "BankDepositModule";
const CONTRACT_NAMES = ["MockUSDC", "VaultManager", "SavingCore"] as const;

const templateDir = process.cwd(); // thư mục gốc hardhat project
const frontendDir = join(templateDir, "..", "frontend", "src");

interface Artifact {
  abi: unknown[];
}

// ─────────────────── 1) Ghi ABI vào frontend/src/abis ────────────
const abiDir = join(frontendDir, "abis");
await mkdir(abiDir, { recursive: true });

for (const name of CONTRACT_NAMES) {
  const artifactPath = join(templateDir, "artifacts", "contracts", `${name}.sol`, `${name}.json`);
  const artifact: Artifact = JSON.parse(await readFile(artifactPath, "utf8"));
  await writeFile(join(abiDir, `${name}.json`), JSON.stringify(artifact.abi, null, 2), "utf8");
  console.log(`✅ ABI ${name}.json (${artifact.abi.length} entry) → frontend/src/abis/`);
}

// ───────────── 2) Ghi addresses.json theo từng chainId ───────────
const deployDir = join(templateDir, "ignition", "deployments");
let chainDirs: string[];
try {
  chainDirs = (await readdir(deployDir)).filter((d) => d.startsWith("chain-"));
} catch {
  console.error("❌ Chưa có ignition/deployments — chạy deploy trước.");
  process.exit(1);
}

if (chainDirs.length === 0) {
  console.error("❌ Không có deployment nào trong ignition/deployments");
  process.exit(1);
}

// Gom địa chỉ từng chain. Sắp xếp chainId tăng dần — frontend chọn
// chain bằng chainId từ MetaMask nên thứ tự chỉ để file dễ đọc
// (31337 local trước, 11155111 Sepolia sau).
const addressesByChain: Record<string, Record<string, string>> = {};

for (const dir of chainDirs) {
  const chainId = dir.replace("chain-", "");
  const deployedFile = join(deployDir, dir, "deployed_addresses.json");
  try {
    const deployed: Record<string, string> = JSON.parse(await readFile(deployedFile, "utf8"));
    const perChain: Record<string, string> = {};
    for (const name of CONTRACT_NAMES) {
      const key = `${MODULE_ID}#${name}`;
      if (deployed[key]) perChain[name] = deployed[key];
    }
    if (Object.keys(perChain).length === 0) {
      console.warn(`⚠️  chain-${chainId}: không có key ${MODULE_ID}#* — bỏ qua`);
      continue;
    }
    addressesByChain[chainId] = perChain;
    console.log(`✅ chain-${chainId} → ${JSON.stringify(perChain)}`);
  } catch (err) {
    console.warn(`⚠️  Lỗi đọc ${deployedFile}: ${String(err).slice(0, 140)}`);
  }
}

if (Object.keys(addressesByChain).length === 0) {
  console.error("❌ Không extract được address nào — kiểm tra module id BankDepositModule");
  process.exit(1);
}

const perChain = Object.keys(addressesByChain)
  .sort((a, b) => Number(a) - Number(b))
  .reduce<Record<string, Record<string, string>>>((acc, chainId) => {
    acc[chainId] = addressesByChain[chainId];
    return acc;
  }, {});

const cfgDir = join(frontendDir, "config");
await mkdir(cfgDir, { recursive: true });
await writeFile(join(cfgDir, "addresses.json"), JSON.stringify(perChain, null, 2), "utf8");
console.log(`\n📦 Export xong: ${Object.keys(perChain).length} chain(s) → frontend/src/config/addresses.json`);
