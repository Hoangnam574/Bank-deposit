# Bank Deposit DApp — Contracts

Workspace smart contracts của đồ án: viết bằng **Solidity 0.8.28**, build/test bằng **Hardhat v3 + TypeScript (ESM)**, deploy bằng **Hardhat Ignition**, gọi contract bằng **Ethers v6**.

Root repo ([README.md](../README.md)) có tổng quan toàn bộ đồ án; README này mô tả riêng workspace contracts.

## Contracts

| File | Mô tả |
|---|---|
| `MockUSDC.sol` | Token ERC-20 mock, 6 decimals như USDC thật — dùng làm tài sản gửi tiết kiệm |
| `SavingCore.sol` | Logic chính: plan, deposit, lãi tính theo giây, rút đủ hạn/sớm/một phần, top-up, auto-renew, emergency withdraw, NFT chứng nhận ERC-721 |
| `VaultManager.sol` | Nguồn giữ 100% USDC: pause/unpause, trả lãi cho SavingCore, solvency guard (không rút vượt phần lãi đã cam kết) |
| `interfaces/IVaultManager.sol` | Interface SavingCore dùng để gọi VaultManager |
| `test/MaliciousDepositor.sol` | Contract "kẻ tấn công" dùng trong test reentrancy — không deploy thật |

## Scripts (`scripts/`)

| File | Mô tả |
|---|---|
| `seed.ts` | Tạo 4 plan (180/30/90/365 ngày), fund vault 500.000 USDC, mint USDC cho 2 user demo. Idempotent |
| `interact.ts` | Smoke test end-to-end: alice mở 5.000 USDC, bob mở 1.000, rút sớm... |
| `timeTravel.ts` | Tăng `block.timestamp` của node local (biến `TT_DAYS` / `TT_SECONDS` / `TT_TO`) |
| `bot.ts` | Auto-renew bot off-chain: quét deposit trong grace window rồi gọi `autoRenewDeposit` (`BOT_ONCE` = chạy 1 lần) |
| `withdraw.ts` | Rút deposit Active (`WITHDRAW_ID` / `WITHDRAW_ALL=`1`) |
| `exportFrontend.ts` | Xuất ABI + `addresses.json` cho frontend (mọi chain) |

## Test (`test/`)

164 test (Mocha + Chai + Ethers):

- `MockUSDC.test.ts` — token mock (5 test)
- `VaultManager.test.ts` — pause, solvency guard, rút vault (30)
- `SavingCore.base.test.ts` — vòng đời deposit, lãi, boundary `<`/`>=` (86)
- `SavingCore.bonus.test.ts` — creative C1–C5: defer lãi, partial, top-up, emergency (35)
- `Security.test.ts` — reentrancy, bất biến snapshot APR (8)
- `helpers/setup.ts` — fixture deploy + tiện ích time travel dùng chung

## Ignition (`ignition/`)

- `modules/BankDeposit.ts` — module deploy cả 3 contract, wire `SavingCore` ↔ `VaultManager`
- `deployments/` — nhật ký deploy đã thực hiện, phân theo chain ID (ví dụ `chain-11155111` = Sepolia), gồm `journal.jsonl`, `deployed_addresses.json`

## File cấu hình

| File | Mô tả |
|---|---|
| `hardhat.config.ts` | Phiên bản Solidity 0.8.28, optimizer, cấu hình network |
| `package.json` | Scripts và dependencies |
| `tsconfig.json` | TypeScript strict, ESM |
| `.env` | Biến bí mật (private key, RPC URL) — **không commit vào git** |
| `.env_example` | Mẫu biến môi trường để sao chép sang `.env` |
| `.gitignore` | Loại trừ `node_modules`, `artifacts`, `cache`, `.env`... |

> Lưu ý: `.env` chỉ cần khi deploy lên Sepolia. Chạy local không cần.

## Lệnh thường dùng

```bash
npm run compile            # biên dịch contract
npm test                   # chạy 164 test
npm run test:coverage      # coverage (Hardhat v3)
npm run test:gas           # test kèm gas stats

npm run node               # local node :8545 (terminal 1)
npm run deploy:local       # deploy qua Ignition (terminal 2)
npm run seed               # 4 plan + fund vault + user demo
npm run interact           # smoke test everything
npm run timetravel         # tăng block.timestamp (env TT_DAYS...)
npm run bot                # auto-renew bot
npm run withdraw           # rút deposit Active

npm run deploy:sepolia     # deploy lên Sepolia (cần .env)
npm run export:frontend    # xuất ABI + addresses.json cho frontend
```

Biến môi trường cho scripts:

| Biến | Dùng cho |
|---|---|
| `TT_DAYS` / `TT_SECONDS` / `TT_TO` | `timetravel` — tăng thời gian node local |
| `BOT_ONCE` / `BOT_EVERY` / `BOT_DRY_RUN` | `bot` — chạy 1 lần / chu kỳ / mô phỏng |
| `WITHDRAW_ID` / `WITHDRAW_ALL` / `WITHDRAW_OWNER` | `withdraw` — chọn deposit cần rút |
| `INTERACT_RESERVE=1` | `interact` — giữ deposit active thay vì rút hết |

## Deploy lên Sepolia

```bash
# .env:
TESTNET_PRIVATE_KEY=0x...    # ví có Sepolia ETH
SEPOLIA_RPC_URL=...          # RPC endpoint
ETHERSCAN_API_KEY=...

HARDHAT_IGNITION_CONFIRM_DEPLOYMENT=true npx hardhat --network sepolia ignition deploy ignition/modules/BankDeposit.ts --verify
npx hardhat run scripts/seed.ts --network sepolia   # tạo plan + fund vault (idempotent)
npm run export:frontend                             # xuất ABI + địa chỉ cho frontend
```

Địa chỉ đã deploy xem ở `ignition/deployments/chain-11155111/deployed_addresses.json` và bảng trong [README root](../README.md#kiến-trúc--quyết-định-thiết-kế-q1q7).
