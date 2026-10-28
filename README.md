# Bank Deposit DApp

DApp tiết kiệm có kỳ hạn (fixed-term saving) trên Ethereum. Người dùng gửi **MockUSDC** (6 decimals như USDC thật), nhận **NFT chứng nhận** (ERC-721) đại diện quyền sở hữu deposit, và nhận lãi tính theo giây với **APR + penalty được snapshot** ngay tại thời điểm mở. Kèm **auto-renew bot** và frontend React.

> Sinh viên: **AT190234** — MSSV `...234` → `A` = chữ số cuối = **4**, `B` = chữ số kề cuối = **3**

## Personal Variant — biến thể cá nhân theo MSSV (§8.1 đề)

Theo §8.1: `A` = chữ số cuối MSSV, `B` = chữ số kề cuối. Các giá trị dưới đây được **hardcode vào default plan của contract, dùng trong toàn bộ test suite và trong video demo**:

| Parameter | Công thức | Tính | Kết quả |
|---|---|---|---|
| Grace period (auto-renew) | `(A mod 3) + 2` ngày | (4 mod 3) + 2 | **3 ngày** |
| Default plan APR | `(200 + A×25)` bps | 200 + 4×25 | **300 bps (3,00%)** |
| Early withdraw penalty | `(300 + B×50)` bps | 300 + 3×50 | **450 bps (4,50%)** |
| Default plan tenor | `B` even → 90 ngày; `B` odd → 180 ngày | B = 3 odd | **180 ngày** |

Công thức lãi (lãi đơn, floor, multiply-before-divide) và các con số kiểm chứng dùng trong test + video:

```
interest = principal × aprBpsAtOpen × tenorSeconds / (31_536_000 × 10_000)   // floor

1.000 USDC / 180 ngày / 300 bps   → lãi đủ hạn      = 14,794520 USDC
1.000 USDC rút sớm @450 bps       → penalty         = 45 USDC   (user nhận 955)
Renew compound 1.000 USDC         → principal mới   = 1.014,794520 USDC
```

## Tính năng

- Mở deposit theo plan có sẵn: chọn amount + plan → mint NFT chứng nhận (ERC-721)
- Rút đủ hạn (`withdrawAtMaturity`), rút sớm (trả penalty), rút một phần (partial) và nộp thêm (top-up) — lãi tính weighted theo `principalSeconds` thực
- Auto-renew trong grace window chuyển từ bot off-chain (không giữ token, không có quyền đặc biệt)
- Rút khẩn cấp (emergency) khi hợp đồng paused quá 7 ngày — nhận principal, không lãi, không penalty
- Vault có solvency guard: admin không thể rút vượt phần lãi đã cam kết trả user
- Frontend: React + Vite + TypeScript, đa ví EIP-6963, đổi network trong app, faucet, admin panel

## Công nghệ

| Lớp | Công nghệ |
|---|---|
| Smart contracts | Solidity 0.8.28 · Hardhat v3 · Ethers v6 · Ignition deploy |
| Frontend | React 19 · Vite · TypeScript strict · Tailwind v4 · wagmi/viem |
| Testing | Mocha + Chai · 164 test · coverage Istanbul |
| Other | Node auto-renew bot · gitleaks · Playwright (verify UI) |

## Kiến trúc

```
┌───────────────┐ approve/mint ┌──────────────────┐
│ User/MetaMask │─────────────▶│ MockUSDC (ERC-20) │
└──────┬────────┘              └─────────▲────────┘
       │ openDeposit / withdraw / renew / topUp    │ transfer (lãi & principal)
       ▼                                ┌─────────┴────────────┐
┌────────────────────────────┐ setSavingCore │ VaultManager         │
│         SavingCore         │◀──────────────│ giữ 100% USDC        │
│ plans · deposits · NFT     │ payInterest   │ owed (cam kết lãi)   │
│ (ERC-721 chứng nhận)       │               │ pause/unpause        │
└────────────────────────────┘               └──────────────────────┘
        ▲
│  auto-renew bot (Node script) — quét canAutoRenew → autoRenewDeposit │
```

Nguyên tắc: **mọi lãi chỉ trả từ vault** (`VaultManager.payInterest`, chỉ SavingCore được gọi), `VaultManager` là nguồn pause duy nhất, lãi **round-down** — dust nằm lại vault.

## Cài đặt & chạy

Yêu cầu: Node ≥ 22, npm; MetaMask. Workspace contracts: `ac-hardhat-template-v2` (chi tiết: [`ac-hardhat-template-v2/README.md`](ac-hardhat-template-v2/README.md)).

### Contracts

```bash
cd ac-hardhat-template-v2
npm install

npx hardhat compile                     # Solidity 0.8.28
npx hardhat test                        # 164 test
npx hardhat test --coverage             # coverage (Hardhat v3)

npm run node                            # (terminal 1) local node :8545
npm run deploy:local                    # (terminal 2) deploy qua Ignition
npm run seed                            # 4 plan + fund vault 500k + mint demo users
npm run interact                        # smoke: alice mở 5.000 USDC, bob mở 1.000…
$env:TT_DAYS="4"; npm run timetravel    # (PowerShell) tăng block.timestamp
$env:BOT_ONCE="1"; npm run bot          # bot quét + auto-renew 1 lần
$env:TT_DAYS="181"; npm run timetravel
$env:WITHDRAW_ALL="1"; npm run withdraw # rút hết deposit Active
```

Env: `TT_DAYS`/`TT_SECONDS`/`TT_TO` — time travel; `BOT_ONCE`/`BOT_EVERY`/`BOT_DRY_RUN` — bot; `WITHDRAW_ID`/`WITHDRAW_ALL`/`WITHDRAW_OWNER` — rút; `INTERACT_RESERVE=1` giữ deposit active.

### Frontend

```bash
cd ../frontend
npm install
npm run dev      # http://localhost:5173
npm run build    # tsc -b && vite build
```

MetaMask: **Add network → RPC `http://127.0.0.1:8545` chainId 31337**, import một private key từ `npm run node` (in ra 20 key). Trang `/` hiện 4 plan, faucet 1.000 USDC ở navbar.

Đổi network trong app (nhấp pill mạng ở header bao gồm Hardhat Local / Sepolia — MetaMask chỉ xác nhận 1 lần). "Kết nối ví" luôn mở picker đa ví via EIP-6963 (MetaMask/Rabby/OKX…). Route `/admin` ẩn ở Navbar và redirect về `/` nếu không phải vault owner.

### Deploy + Sepolia

```bash
# .env trong ac-hardhat-template-v2/ :
TESTNET_PRIVATE_KEY=0x...    # ví có Sepolia ETH
SEPOLIA_RPC_URL=...          # RPC public
ETHERSCAN_API_KEY=...

HARDHAT_IGNITION_CONFIRM_DEPLOYMENT=true npx hardhat --network sepolia ignition deploy ignition/modules/BankDeposit.ts --verify
npx hardhat run scripts/seed.ts --network sepolia   # tạo 4 plan + mint + fund vault (idempotent)
npm run export:frontend                             # xuất ABI + addresses.json cho frontend
npx hardhat run scripts/bot.ts --network sepolia    # (tùy chọn) bot — poll vô hạn, Ctrl+C để dừng
```

| Contract | Địa chỉ Sepolia |
|---|---|
| MockUSDC | [`0xF20376156c60FCC68DC360e216A350eAA453d67e`](https://sepolia.etherscan.io/address/0xF20376156c60FCC68DC360e216A350eAA453d67e#code) |
| VaultManager | [`0x6364C8b3042cf79A184062e4e56233fF489E55E9`](https://sepolia.etherscan.io/address/0x6364C8b3042cf79A184062e4e56233fF489E55E9#code) |
| SavingCore | [`0x51Bdfd36F72E554831529946c8B0a2A3D4346205`](https://sepolia.etherscan.io/address/0x51Bdfd36F72E554831529946c8B0a2A3D4346205#code) |

Deployed 2026-10-26 · deployer `0x649D72EF5d88f0b0bC4ACcF38C8d534B23850295` · 3 contracts verified (Etherscan + Sourcify) · seed hoàn tất: 4 plan (180/30/90/365 ngày), vault 500.000 USDC, deployer nắm 100.000 USDC faucet. Frontend đã nhận chain `11155111` — switch mạng trong MetaMask là app tự nhận contract thật.

## Test & Coverage

```
npx hardhat test             → 164 passing
                             MockUSDC 5  · VaultManager 30  · SC base 86  · bonus C1–C5 35  · Security 8

npx hardhat test --coverage  → statements 96.51% · branches 100% · functions 100% · lines 96.51%
                             MockUSDC 100% · VaultManager 100% · SavingCore 96.87%
```

Screenshot coverage: [`docs/coverage.png`](docs/coverage.png).

Invariant được test: (1) snapshot APR/penalty bất biến sau khi admin đổi plan; (2) `totalOwedInterest ≤` tổng lãi tính từ `principalSeconds` mọi deposit Active; (3) lãi rút thực tế = lãi preview đúng theo giây; (4) penalty về đúng `feeReceiver`; (5) NFT burn → không rút được lần hai (status chốt trước transfer).

## Design Answers — trả lời 7 câu hỏi mở (§8.2 đề)

Mỗi câu trả lời ngắn gọn kèm vị trí code (file:dòng) để đối chiếu trực tiếp khi oral check.

**Q1 — NFT chuyển nhượng được không? Ai rút/renew?**
Certificate = ERC-721: mỗi deposit có một NFT, transfer NFT = chuyển quyền điều hành deposit. Quyền rút quản lý theo `ownerOf(depositId)` (không cache địa chỉ trong struct) — chuyển NFT thì quyền tự động theo `ERC721.transferFrom`. Error `SC_DepositNotOwner` khi sai chủ. Hệ quả: người nhận NFT được toàn quyền withdraw/renew/top-up/partial — NFT là "hộ chiếu" của deposit.
Đánh giá: hành vi này **cố ý và tốt** — đúng triết lý ERC-721 của đề; nguy cơ "sai người rút" chỉ xảy ra nếu chủ deposit chủ động chuyển NFT đi (một hành động có chủ ý, giống giao chứng chỉ tiền gửi thật). Vì quyền luôn đọc theo `ownerOf` tại thời điểm gọi nên không tồn tại trạng thái stale. Map: `SavingCore.sol:177` (`onlyDepositOwner`), `:326/387` (`_burn` khi tất toán).

**Q2 — Vault không đủ tiền trả lãi đúng hạn thì sao?**
Phương án theo spec gốc là **revert** — vấn đề: bank có thể khoá luôn principal của user chỉ bằng việc không fund vault (user mất cả gốc lẫn lãi). Phương án khác đã cân nhắc: hàng chờ claim khi vault được nạp lại. Tôi chọn **trả principal ngay + lãi ghi nợ (`pendingInterestOf[user]`) + claim sau** (chính là C1): user không bao giờ mất gốc, lãi trở thành khoản nợ on-chain minh bạch qua event `InterestDeferred`, và `totalOwedInterest` không giảm nên C2 tiếp tục khoá phần đó trong vault. Map: `SavingCore.sol:330-345` (defer), `:354` (`claimPendingInterest`, chặn khi paused).

**Q3 — Bot chết thì sao, user có mất gì không?**
Bot không nắm token, không có quyền đặc biệt — chỉ là keeper off-chain gọi `autoRenewDeposit` public. Trong grace `[maturityAt, maturityAt+3d)` bot gọi auto-renew; nếu bot chết → deposit vẫn Active vĩnh viễn tới khi user tự rút/renew, không mất tiền và không deadline. Map: `SavingCore.sol:319`, `:562`.

**Q4 — Rounding dust: dust về ai? Có gây revert/sai số dư không?**
`_computeInterestBySeconds` dùng multiply-before-divide floor: `principalSeconds × aprBps / (10_000 × 31_536_000)`. Vault trả ≤ lãi thực — **dust thuộc về vault**: phần lẻ < 1 unit (10⁻⁶ USDC) nằm lại vault, nhờ đó solvency (C2) không bị thổi phồng và không thể revert do lệch 1 wei. Chọn vault giữ dust (không phải user) vì nó tạo hằng đẳng thức `paidInterest ≤ theoreticalInterest` — bất biến được assert trong test `dust (T-A19)` của `SavingCore.base.test.ts` (deposit 1 unit → lãi 0, không revert, vault độc lập). Map: `SavingCore.sol:648`.

**Q5 — Boundary times: tại đúng `maturityAt` là "sớm" hay "đủ hạn"?**
`earlyWithdraw`/`partial`/`topUp` chỉ khi `block.timestamp < maturityAt` (strict `<`), ngược lại → `SC_TooLate`. `withdrawAtMaturity` yêu cầu `>= maturityAt` (chọn `>=` để giây thứ chính xác của maturity thuộc phía đủ hạn — hai tập rời nhau, không có khoảng chết). Auto-renew chỉ trong grace `[maturityAt, maturityAt+3d)`. Tất cả boundary được test tại giây chặn chính giữa (`timeTravelTo(maturityAt - 1)` vs `timeTravelTo(maturityAt)`). Map: `SavingCore.sol:319/380/456/519/562`.

**Q6 — Plan bị disable khi còn deposit đang chạy?**
Mở mới/renew tay vào plan disable → `SC_PlanNotEnabled`. Deposit Active mở trước đó không bị ảnh hưởng — tiếp tục lãi bình thường; auto-renew vẫn chạy vì deposit snapshot APR/tenor riêng không phụ thuộc plan. Disable plan = chặn dòng tiền mới, không đụng tiền cũ — quy tắc công bằng: admin được dừng bán sản phẩm, không được đụng vào hợp đồng đã ký. Map: `SavingCore.sol:284/522`.

**Q7 — Reentrancy attack?**
Kẻ lạ deploy `MaliciousDepositor` (ERC-721 receiver + ERC-20 fallback) re-call `withdrawAtMaturity` trong `receive()`. Ba lớp phòng vệ: ReentrancyGuard `nonReentrant` mọi hàm state-changing; CEI — status chốt Withdrawn + `_burn` trước external transfer (call lại gặp `SC_DepositNotActive`); chỉ SavingCore được gọi `vault.payInterest`. Kết quả: 0 reentrancy thành công (`Security.test.ts`).

## Creative Challenges (§8.3 — bonus, mỗi challenge 1 ghi chú ngắn: problem / solution / trade-off)

C1–C4 lấy từ gợi ý của đề; **C5 là gap tự tìm thấy trong spec**: khi hợp đồng `pause()` (ví dụ bị hack, hoặc admin mất quyền), mọi withdrawal bị chặn vô thời hạn → tiền user bị khoá. Fix: cho phép rút khẩn cấp principal sau 7 ngày pause.

| ID | Problem | Solution | Trade-off | Tests |
|---|---|---|---|---|
| C1 interest defer | Vault thiếu USDC tại maturity → chặn rút làm user mất principal | Trả principal ngay, lãi vào `pendingInterestOf`, owed không giảm, `claimPendingInterest()` sau | Bank nợ lãi không deadline; user claim cần vault đã fund lại | `SavingCore.bonus.test.ts` |
| C2 solvency guard | Admin rút vault đè lên cam kết lãi | `totalOwedInterest` = tổng lãi cam kết; `withdrawVault(amount)` chỉ cho phép khi `bal − amount ≥ owed` | Phần cam kết bị "khóa" trong vault | `VaultManager.test.ts` |
| C3 partial early withdraw | Rút 100% chỉ để gồng cashflow, còn dính penalty khổng lồ | Rút 1 phần: principal giảm theo chunk, lãi weighted qua `principalSeconds -= amount × remaining` | Bookkeeping weighted phức tạp hơn | `SavingCore.bonus.test.ts` |
| C4 top-up | Gửi thêm giữa chừng không cần đóng deposit | Thêm amount vào principal, dùng số ngày còn lại; owed tăng đúng chunk mới; không áp min/max plan | Dễ lách min plan — có cap `MAX_PRINCIPAL` | `SavingCore.bonus.test.ts` |
| C5 emergency withdraw | Hợp đồng paused lâu — user bị kẹt vốn | `block.timestamp ≥ pausedAt + 7 ngày` → rút principal, không lãi không penalty | Mất lãi (an toàn > hiệu suất); cần `pausedAt` clock | `SavingCore.bonus.test.ts` |

## Demo video

| Thời lượng | Nội dung |
|---|---|
| 0:00–0:30 | Giới thiệu + đọc biến thể (A=4, B=3) |
| 0:30–1:00 | Dashboard: 4 plan, nhấn mạnh plan variant |
| 1:00–1:45 | Faucet → Approve → Open 1.000 USDC → NFT + countdown |
| 1:45–2:20 | Deposit detail: preview lãi 14,794520 USDC |
| 2:20–2:50 | Early withdraw → nhận 955, feeReceiver +45 |
| 2:50–3:20 | Time travel +181d → withdraw → nhận 1.014,794520 |
| 3:20–3:45 | Renew + Top-up — weighted interest |
| 3:45–4:05 | Bot auto-renew (log terminal) |
| 4:05–4:30 | Admin: fund vault, withdraw vượt ngưỡng → revert (C2), pause → C5 |
| 4:30–5:00 | Test + coverage + tổng kết |

> **Video link: `TODO_<YouTube/Drive>`** (3–5 phút, quay theo kịch bản trên — số liệu trong video khớp Personal Variant: 300 bps / 450 bps / 180 ngày / 3 ngày grace)

## Known limitations

- `MockUSDC` cho phép free mint — dùng cho testnet demo, không thay thế USDC mainnet.
- Auto-renew dựa trên off-chain bot, không dùng keeper on-chain (Chainlink Automation); bot chết thì user vẫn tự rút được (Q3).
- Lãi floor — phần lẻ < 1 unit ở lại vault; frontend preview tính bằng bigint nên khớp chính xác contract.
- Admin là EOA đơn — không timelock/multisig (ngoài phạm vi bài tập).
- E2E frontend kiểm tra tay qua MetaMask — chưa có Playwright E2E tự động.
- `npm audit`: production deps 0 vulnerabilities ở cả 2 workspace; dev-toolchain template còn 20 (không vào bundle/bytecode). `gitleaks detect` = 0 leaks.

## Cấu trúc repo

```
bank-deposit-dapp/
├─ ac-hardhat-template-v2/          # Hardhat v3 + TS ESM
│  ├─ contracts/                    # MockUSDC · VaultManager · SavingCore · MaliciousDepositor
│  ├─ ignition/modules/BankDeposit.ts
│  ├─ scripts/                      # seed · bot · interact · timeTravel · withdraw · exportFrontend
│  └─ test/                         # 164 test
├─ docs/
│  └─ coverage.png                  # screenshot coverage report
├─ frontend/                        # Vite + React-TS
│  └─ src/{abis,config,providers,hooks,components,pages,styles,lib}
└─ README.md
```

*Licence: educational.*