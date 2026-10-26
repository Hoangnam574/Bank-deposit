# 🏦 Bank Deposit DApp — AT190234

DApp tiết kiệm có kỳ hạn (fixed-term saving) trên Ethereum: gửi **MockUSDC (6 decimals như USDC thật)**, nhận **NFT chứng nhận** (ERC-721), nhận lãi theo **giây tích luỹ** với **APR + penalty snapshot** khóa tại thời điểm mở. Có **auto-renew bot** và frontend React.

> Sinh viên: **AT190234** — Biến thể cá nhân xem bảng dưới.

---

## 1. Personal Variant (AT190234)

`A` = chữ số **cuối** MSSV = **4** · `B` = chữ số **kề cuối** = **3**

| Parameter | Công thức (§8.1 đề) | Kết quả |
|---|---|---|
| Grace period (auto-renew) | `(A mod 3) + 2` ngày = (4 mod 3)+2 | **3 ngày** |
| Default plan APR | `(200 + A×25)` bps = 200+100 | **300 bps (3.00%)** |
| Early withdraw penalty | `(300 + B×50)` bps = 300+150 | **450 bps (4.50%)** |
| Default plan tenor | `B` odd → 180 ngày | **180 ngày** |

**Số liệu kiểm chứng (dùng trong test + video):**

```
interest = principal × aprBps × tenorSeconds / (10_000 × 31_536_000)
         (floor — multiply-before-divide, dust ở lại vault)

1.000 USDC / 180 ngày / 300 bps  → lãi đủ hạn = 14,794520 USDC
1.000 USDC rút sớm @450 bps      → penalty  = 45 USDC (user nhận 955)
Renew compound 1.000 USDC        → principal mới = 1.014,794520 USDC
```

Seed tạo 4 plan — **plan #1 là variant** (180d/300bps/450bps), kèm 30d/250/500 · 90d/350/400 · 365d/500/600.

---

## 2. Quick Start

Yêu cầu: Node ≥ 22, npm; MetaMask cài sẵn.

### 2.1 Contracts — compile / test / coverage / deploy local / bot

```bash
cd ac-hardhat-template-v2
npm install

npx hardhat compile                      # Solidity 0.8.28
npx hardhat test                         # 164 test
npx hardhat test --coverage              # Hardhat v3: coverage qua flag `--coverage`

npm run node                             # (terminal 1) node localhost:8545
npm run deploy:local                     # (terminal 2) deploy qua Ignition
npm run seed                             # 4 plan + fund vault 500k + mint demo users
npm run interact                         # smoke: alice mở 5.000 USDC, bob mở 1.000…
$env:TT_DAYS="4"; npm run timetravel    #   (PowerShell) tăng block.timestamp
$env:BOT_ONCE="1"; npm run bot           # bot quét + auto-renew 1 lần
$env:TT_DAYS="181"; npm run timetravel
$env:WITHDRAW_ALL="1"; npm run withdraw  # rút hết deposit Active
```

> Ý nghĩa env: `TT_DAYS`/`TT_SECONDS`/`TT_TO` — time travel; `BOT_ONCE`/`BOT_EVERY`/`BOT_DRY_RUN` — bot; `WITHDRAW_ID`/`WITHDRAW_ALL`/`WITHDRAW_OWNER` — rút; `INTERACT_RESERVE=1` giữ deposit active (để bot có việc).

### 2.2 Frontend

```bash
cd ../frontend
npm install
npm run dev     # http://localhost:5173  (vite)
npm run build   # tsc -b && vite build — TS strict, pass
```

MetaMask: **Add network → RPC `http://127.0.0.1:8545` chainId 31337**, rồi **import private key** một account hardhat (ví dụ account #0 `0xac0974bec39a17e36ba…` — xem `npm run node` in ra 20 key). Trang "/" hiện 4 plan, faucet 1.000 USDC ở navbar.

**Design v4 (Binance design language — spec tại `DESIGN.md`)**: canvas đen sâu `#0B0E11`, card phẳng `#1E2329` + hairline `#2B3139` (zero gradient/glow/glass), yellow `#FCD535` là accent duy nhất (CTA black-on-yellow), trading green `#0ECB81`/red `#F6465D` cho tín hiệu tăng/giảm, footer tối hòa canvas `#0b0e11` + hairline `#2B3139` (thay `footer-light` của spec Binance gốc — theo yêu cầu người dùng). Số liệu dùng IBM Plex Mono tabular, body Inter. Shell layout kiểu Binance: header full-bleed (logo sát mép trái, cụm ví sát mép phải) + content shell `max-w-[1680px]`, footer ghim đáy viewport qua flex column `min-h-dvh` (không nảy layout khi kết nối ví). UX phụ: `/open` auto chọn sẵn plan đề xuất (tenor 180 ngày); route `/admin` ẩn ở Navbar và redirect về `/` nếu ví không phải vault owner (`useAdminRole` + `AdminGuard`); "Kết nối ví" hỗ trợ đa ví qua **EIP-6963** — có ≥2 ví cài cùng lúc thì mở picker chọn (MetaMask/Rabby/OKX…), 1 ví thì nối trực tiếp.

### 2.3 Sepolia

```bash
# .env trong ac-hardhat-template-v2/ :
TESTNET_PRIVATE_KEY=0x...    # ví có Sepolia ETH (faucet: sepolia.dev / infura)
SEPOLIA_RPC_URL=...          # RPC public (publicnode/sepolia.infura.io)
ETHERSCAN_API_KEY=...

# Deploy + verify (Ignition tự verify Etherscan/Sourcify nếu có ETHERSCAN_API_KEY):
HARDHAT_IGNITION_CONFIRM_DEPLOYMENT=true npx hardhat --network sepolia ignition deploy ignition/modules/BankDeposit.ts --verify
npx hardhat run scripts/seed.ts --network sepolia            # tạo 4 plan + mint + fund vault (idempotent)
npm run export:frontend                                      # xuất ABI + addresses.json cho frontend (mọi chain)
npx hardhat run scripts/bot.ts --network sepolia             # (tùy chọn) auto-renew bot — poll vô hạn, Ctrl+C để dừng
```

| Contract | Địa chỉ Sepolia | Trạng thái |
|---|---|---|
| MockUSDC | [`0xF20376156c60FCC68DC360e216A350eAA453d67e`](https://sepolia.etherscan.io/address/0xF20376156c60FCC68DC360e216A350eAA453d67e#code) | ✅ |
| VaultManager | [`0x6364C8b3042cf79A184062e4e56233fF489E55E9`](https://sepolia.etherscan.io/address/0x6364C8b3042cf79A184062e4e56233fF489E55E9#code) | ✅ |
| SavingCore | [`0x51Bdfd36F72E554831529946c8B0a2A3D4346205`](https://sepolia.etherscan.io/address/0x51Bdfd36F72E554831529946c8B0a2A3D4346205#code) | ✅ |

> Deployed 2026-10-26 · deployer `0x649D72EF5d88f0b0bC4ACcF38C8d534B23850295` · 3 contracts **verified + published source** trên Etherscan (và Sourcify) · seed hoàn tất: 4 plan (180/30/90/365 ngày), vault 500.000 USDC, deployer nắm 100.000 USDC faucet. Frontend (`frontend/src/config/addresses.json`) đã nhận chain `11155111` — để demo Sepolia: **MetaMask switch sang mạng Sepolia** là app tự nhận contract thật.

---

## 3. Kiến trúc

```
┌────────────┐ approve/mint ┌───────────┐
│   User/MetaMask │──────────▶ MockUSDC (ERC-20, 6d) │
└──────┬─────────┘              └─────▲──────┘
       │ openDeposit / withdraw / renew / topUp    │ transfer (lãi & principal)
       ▼                              ┌─────┴──────────┐
┌─────────────────────────┐  setSavingCore   │ VaultManager │
│      SavingCore         │◀─────────────────│ giữ 100% USDC │
│ plans · deposits · NFT  │  payInterest /   │ owed (cam kết)│
│ (ERC-721 chứng nhận)    │  owed tăng/giảm  │ pause/unpause │
└─────────────────────────┘                  └────────────────┘
        ▲
│  auto-renew bot (Node script) — quét canAutoRenew → autoRenewDeposit │
```

Nguyên tắc: **mọi lãi chỉ trả từ vault** (`VaultManager.payInterest`, chỉ SavingCore được gọi), `VaultManager` là nguồn pause duy nhất (`whenSystemRunning` đọc `vault.isPaused()`), lãi **round-down** — dust nằm trong vault.

---

## 4. Design Answers — 7 câu mở

**Q1 — NFT chuyển nhượng được không? Ai rút/renew?**
Certificate = ERC-721 mint theo deposit khác nhau như một voucher ERC-20: mỗi deposit có một NFT, transfer NFT = chuyển quyền điều hành deposit. Hợp đồng quản lý quyền rút bằng `ownerOf(depositId)` (không cache địa chỉ trong struct) — chuyển NFT thì quyền tự động theo `ERC721.transferFrom`. Error `SC_DepositNotOwner` khi sai chủ. Hệ quả: người nhận NFT được toàn quyền `withdrawAtMaturity/earlyWithdraw/renew/top-up/partial` — NFT là "hộ chiếu" của deposit (mất ví = mất certificate, như mất sổ tiết kiệm vật lý). Map: `SavingCore.sol:177` (`onlyDepositOwner`), `SavingCore.sol:326/387` (`_burn` khi tất toán).

**Q2 — Vault không đủ tiền trả lãi đúng hạn thì sao? (C1)**
Không chặn rút principal: user luôn nhận đủ `principal + interest` nếu vault đủ; nếu thiếu lãi → trả chính xác `principal` về user, phần lãi ghi vào `pendingInterestOf[user]` (giữ nguyên, bank nợ user), emit `InterestDeferred`, và owed NOT decrease (C2 cam kết mở rộng). `claimPendingInterest()` chạy khi `whenSystemRunning` (pause chặn, D3), zero-before-transfer theo CEI. Test: `SavingCore.bonus.test.ts` — "C1 defer khi vault thiếu lãi", "claim sau khi fund đủ". Map: `SavingCore.sol:330-345` (defer path), `SavingCore.sol:354` (claim).

**Q3 — Bot chết kế nào user vẫn nhận đủ?**
Bot không nắm token, không có quyền đặc biệt — chỉ là keeper off-chain (Node script) gọi `autoRenewDeposit` public. Bất cứ lúc nào `block.timestamp >= maturityAt`, chính chủ gọi `withdrawAtMaturity(id)` nhận đủ lãi — không deadline (deposit Active vĩnh viễn tới khi user quyết định). Auto-renew chỉ hợp lệ trong grace `[maturityAt, maturityAt+3d)` (D8); nếu bot chậm quá grace → deposit vẫn Active → user tự rút/renew được, không mất tiền. Map: `SavingCore.sol:319` (chỉ lower-bound), `SavingCore.sol:562` (grace check của auto-renew).

**Q4 — Làm tròn / dust (D9)?**
`_computeInterestBySeconds` dùng **multiply-before-divide** floor quanh vùng chuẩn: `principalSeconds × aprBps / (10_000 × 31_536_000)`. Floor nghĩa là vault trả ≤ nghĩa lý lượt thực — phần lẻ < 1 unit (10⁻⁶ USDC) nằm lại vault. Nhờ đó tổng lãi mọi deposit ≤ tổng vault có thể chi trả (C2 solvency không bị thối). Test: principal = 1 unit → interest 0, không revert, dust giữ vault. Map: `SavingCore.sol:648`.

**Q5 — Boundary `<` vs `>=` (D8)?**
`earlyWithdraw`/`partial`/`topUp` chỉ khi **Trước** maturity: `block.timestamp >= maturityAt` → `SC_TooLate` (đúng hạn dùng `withdrawAtMaturity`). Trái lại `withdrawAtMaturity` yêu cầu `>= maturityAt` — `<` → `SC_TooEarly`; **auto-renew** yêu cầu trong `[maturityAt, maturityAt+3d)` — ngoài grace → `SC_TooLate` (bot retry lần sau) hoặc bỏ cho auto rút. Test: mọi boundary có test tại **giây chặn chính giữa** (`timeTravelTo(maturityAt - 1)` vs `timeTravelTo(maturityAt)`). Map: `SavingCore.sol:319/380/456/519/562`.

**Q6 — Plan bị disable (D6)?**
Phân tầng: (a) **mở mới / renew tay** vào plan disable → `SC_PlanNotEnabled` (`SavingCore.sol:284` open, `:522` renew tay); (b) deposit Active mở **trước đó** không bị ảnh hưởng — tiếp tục accrue lãi bình thường; (c) auto-renew vẫn chạy — vì deposit snapshot APR/tenor riêng tại thời điểm mở/renew, không cần consult plan (`SavingCore.sol:554-597`). Nghĩa là disable plan = chặn dòng tiền mới vào kế hoạch đó, không đụng tiền cũ của user.

**Q7 — Reentrancy attack?**
Người lạ deploy `MaliciousDepositor` (ERC-721 receiver + ERC-20 fallback) re-call `withdrawAtMaturity` trong `receive()`. Ba lớp phòng vệ: (1) ReentrancyGuard `nonReentrant` trên mọi hàm state-changing (`SavingCore.sol:277/312/373/…`); (2) CEI — `d.status` chốt sang Withdrawn + `_burn` **trước** external transfer → call ngược lại gặp `SC_DepositNotActive`; (3) chỉ SavingCore được gọi `vault.payInterest` — attacker không tự sinh lãi. Kết quả test: 0 lượt reentrancy thành công (`Security.test.ts` — reentrancy + double-withdraw + malicious receiver).

---

## 5. Creative Challenges (C1–C5)

| ID | Problem | Solution | Trade-off | Tests |
|---|---|---|---|---|
| **C1** interest defer | Vault thiếu USDC tại maturity → chặn rút làm user mất principal | Trả principal ngay, lãi vào `pendingInterestOf`, owed không giảm, `claimPendingInterest()` sau | Bank nợ lãi không deadline; user claim cần vault đã fund lại | `SavingCore.bonus.test.ts` — defer + claim + block khi pause |
| **C2** solvency guard | Admin rút vault đè lên cam kết lãi → vault mất khả năng trả | `totalOwedInterest` = tổng lãi cam kết; `withdrawVault(amount)` chỉ cho phép khi `bal − amount ≥ owed` | Phần cam kết bị "khóa" trong vault — vốn linh hoạt của admin giảm | `VaultManager.test.ts` — 30 test gồm `VM_Insolvent` |
| **C3** partial early withdraw | Rút 100% chỉ để gồng cashflow còn dính penalty khổng lồ | Rút 1 phần: principal giảm theo chunk, lãi weighted qua `principalSeconds -= amount × remaining` | Bookkeeping weighted phức tạp hơn — đổi lại công bằng cho user | `SavingCore.bonus.test.ts` — partial + weighted interest chính xác |
| **C4** top-up | User muốn gửi thêm giữa chừng mà không phải đóng deposit | Thêm amount vào principal, dùng số ngày còn lại; owed tăng đúng chunk mới; **không** áp dụng min/max plan | Dễ dùng để lách min của plan — chấp nhận vì có cap `MAX_PRINCIPAL` | `SavingCore.bonus.test.ts` — top-up + weighted + cap |
| **C5** emergency withdraw | Hợp đồng paused lâu (bug/offline) — user bị kẹt vốn | `block.timestamp ≥ pausedAt + 7 ngày` → rút principal, **không lãi không penalty**, không bị `whenSystemRunning` chặn | Mất lãi (an toàn đơn > hiệu suất); cần `pausedAt` clock | `SavingCore.bonus.test.ts` — emergency path + boundary 7 ngày |

---

## 6. Test & Coverage

```
npx hardhat test               → 164 passing (MockUSDC 5 · VaultManager 30 · SC base 86 · bonus 35 · Security 8)
npx hardhat test --coverage    → 96.52% statement 96.83% branch 96.51% func 95.94% line
       MockUSDC 100% · VaultManager 100% · SavingCore 96.88% · MaliciousDepositor 82%
```

Chạy lệnh coverage (Hardhat v3 không có task `coverage` riêng): `npx hardhat test --coverage`. Screenshot coverage lưu ở `docs/coverage.png` *(TODO: chụp khi chạy lần cuối)*.

Invariant được test: (1) snapshot APR/penalty bất biến sau khi admin đổi plan; (2) `totalOwedInterest ≤` tổng lãi tính từ `principalSeconds` mọi deposit Active; (3) lãi rút thực tế = lãi preview đúng theo giây; (4) penalty về đúng `feeReceiver`; (5) NFT burn → không rút được lần hai (status chốt trước transfer).

---

## 7. Demo Video (3–5 phút)

Script quay (giữ nguyên theo Phụ lục D):

| Thời lượng | Nội dung | Chuẩn bị |
|---|---|---|
| 0:00–0:30 | Giới thiệu + đọc biến thể (A=4,B=3 → 3 ngày/300bps/450bps/180 ngày) | README mở sẵn |
| 0:30–1:00 | Dashboard: 4 plan, nhấn mạnh plan variant | `npm run seed` |
| 1:00–1:45 | Faucet → Approve → Open 1.000 USDC → NFT + countdown | local + MetaMask |
| 1:45–2:20 | Deposit detail: preview lãi 14,794520 USDC | — |
| 2:20–2:50 | **Early withdraw** deposit khác → nhận 955, feeReceiver +45 | 2 deposit |
| 2:50–3:20 | **Time travel +181d** → withdraw → nhận 1.014,794520 | `timeTravel.ts` |
| 3:20–3:45 | **Renew + Top-up** — weighted interest | — |
| 3:45–4:05 | **Bot auto-renew** (log terminal) | `npm run bot` nền |
| 4:05–4:30 | Admin: fund vault, withdraw vượt ngưỡng → revert (C2), pause → C5 | — |
| 4:30–5:00 | Test + coverage + tổng kết | coverage screenshot |

> **Video link: `TODO_<YouTube/Drive>`** *(quay theo bảng trên)*

---

## 8. Known Limitations

- **`MockUSDC` cho phép free mint** — dùng cho testnet demo, không thay thế USDC mainnet.
- **Auto-renew dựa trên off-chain bot** — không dùng keeper on-chain (Chainlink Automation); bot chết thì user vẫn tự rút được (Q3).
- **Lãi floor (D9)** — phần lẻ < 1 unit ở lại vault; frontend preview tính bằng bigint nên khớp chính xác với contract.
- **Admin là EOA đơn** — không timelock/multisig (ngoài phạm vi homework).
- **E2E frontend manual với MetaMask** — chưa có Playwright E2E tự động.
- **`npm audit` / gitleaks** — production deps 0 vulnerabilities ở cả 2 workspace; dev-toolchain của template còn 20 (15 high / 5 low — Hardhat/ethers ecosystem, không vào bundle hay bytecode, chi tiết `SECURITY_PLAN.md` §3b). `gitleaks detect` + `--no-git` = 0 leaks (§3c, checked 2026-10-26).
- **Repo nằm trong OneDrive (R1)** — nếu compile bị file-lock, move repo ra `C:\dev\` (T0.7).

---

## 9. Cấu trúc repo

```
Bank/
├─ ac-hardhat-template-v2/          # Hardhat v3 + TS ESM
│  ├─ contracts/                    # MockUSDC · VaultManager · SavingCore · MaliciousDepositor
│  ├─ ignition/modules/BankDeposit.ts
│  ├─ scripts/                      # seed · bot · interact · timeTravel · withdraw · exportFrontend
│  └─ test/                         # 164 test
├─ frontend/                        # Vite + React-TS + Tailwind v4
│  └─ src/{abis,config,providers,hooks,components,pages,styles,lib}
├─ EXECUTION_PLAN.md                # kế hoạch chi tiết + tiến độ
├─ SECURITY_PLAN.md                 # kế hoạch bảo mật app + web
└─ README.md
```

*Licence: educational.*
