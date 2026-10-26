# REVIEW SCRIPT — Bank Deposit DApp (kiểm tra an ninh + tương tác người dùng)

> Mục đích: kịch bản có sẵn để (1) giảng viên/reviewer tự tay bấm thử DApp và (2) quay riêng phần "kiểm tra an ninh" trong video — bám threat model T1–T14 tại `SECURITY_PLAN.md` §1 và test tự động `Security.test.ts` S1–S8.
> Kịch bản demo chức năng tổng quát (intro, bot, Sepolia...) xem `docs/demo-script.md` — tài liệu này tập trung ở khía cạnh an ninh.
> Ký hiệu: [x] đã có sẵn, bấm được ngay trên UI · [ ] cần lệnh terminal/script phụ trợ.

---

## 0. Chuẩn bị (làm trước, ~2 phút)

```bash
cd ac-hardhat-template-v2
npx hardhat node                  # terminal 1 — hardhat local
npm run deploy:local              # terminal 2 — deploy 3 contracts
npm run seed                      # seed plans + deposit mẫu (Alice #1 sở hữu deposit của mình)
npm run dev                       # hoặc: cd ../frontend && npm run dev — Vite ở http://localhost:5173
```

Tài khoản Hardhat local dùng trong kịch bản (chọn ví qua WalletPicker — app KHÔNG auto-connect):

| Tài khoản | Địa chỉ | Vai |
|---|---|---|
| Account #0 | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` | Deployer = Admin (tab Admin) |
| Account #1 | `0x70997970C51812dc3A010C7d01B50e0d17dc79C8` | Alice — chủ deposit seed |

> Vào `Admin` cần kết nối với Account #0 (`AdminGuard` chặn); vào deposit của Alice cần Account #1. Đổi tài khoản: bấm "Ngắt" ở navbar → "Kết nối ví" → chọn lại.

---

## Phần A — Kiểm thử tự động (terminal, không cần UI) [x]

```bash
npx hardhat test test/Security.test.ts            # 8 case an ninh, chạy vài giây
npx hardhat test --coverage                       # full suite 164 test, 96.52% lines
npm audit --workspaces                            # 0 vulnerabilities (prod deps)
```

Ánh xạ S1–S8 → threat (chi tiết tại `ac-hardhat-template-v2/test/Security.test.ts`):

| Test | Nội dung | Threat |
|---|---|---|
| S1, S2 | Re-enter `withdrawAtMaturity`/`earlyWithdraw` trong hook `_safeMint` → `nonReentrant` chặn, 0 attack thành công | T1 |
| S3, S4 | NFT chuyển nhượng: owner mới withdraw được, owner cũ revert; NFT đã burn không transfer được | T7 |
| S5 | Deposit 1 unit: lãi = 0, không revert, dust ở vault (floor) | T5 |
| S6 | 2 user độc lập: principal/balance/lãi không lẫn | T7 |
| S7 | `previewInterest` khớp payout 100% ở 5 tenor khác nhau | T5 |
| S8 | Mở/topUp vượt `MAX_PRINCIPAL` → revert, lãi không overflow | T6 |

---

## Phần B — Checklist tương tác UI (quay video được)

### R0 · Guard chain + địa chỉ on-chain — T13 · PASS: chỉ chạy đúng chain

1. Mở `http://localhost:5173` → navbar hiển thị "Hardhat Local · 31337".
2. Trong ví (shim 31337 hoặc MetaMask thật), chuyển sang chain khác → `NetworkGuard` chặn, cảnh báo giao dịch bị tắt.
3. PASS check: app đọc `addresses.json` theo chainId trước mỗi lần render hợp đồng — chain sai không render hành động nào.

### R1 · Approve exact amount, không unlimited — T8 · PASS: popup ví hiển thị số cụ thể

1. Alice (Account #1) → "Mở tiết kiệm" → chọn plan → nhập 100 → bấm nút mở.
2. Xem màn hình xác nhận của ví: **approve SavingCore = 100 USDC** chính xác — KHÔNG phải MaxUint256 (unlimited).
3. Sau đó mở thành công; lần tiếp theo không cần approve lại nếu đồng lượng còn đủ.

### R2 · Cách ly vai — chỉ chủ NFT thao tác được — T7 (S3/S4, Q1) · PASS: panel Thao tác ẩn

1. Account #2 → "Sổ tiết kiệm" → deposit của Alice KHÔNG hiển thị (list lọc theo `ownerOf`).
2. Account #2 vào thẳng URL `/#/deposit/<id của Alice>` → thấy chi tiết nhưng KHÔNG có panel "Thao tác" (Rút/Renew/Top-up), có dòng "Chỉ chủ NFT (0x…) mới thao tác được".
3. Giải trình Q1: mọi button nằm trong block `isOwner`; hợp đồng chặn bằng `onlyDepositOwner` đọc live `ownerOf` — quyền đi theo NFT, chủ mới sau chuyển nhượng được phép rút — chứng minh trong S3.

### R3 · Biên thời gian rút sớm / đúng hạn / qua grace — T6 (test #34/#35) · PASS: đúng thời điểm, đúng nút

Dùng `npm run timetravel` (băng thời gian hardhat local — KHÔNG chạy trên Sepolia). Ví dụ deposit tenor 180 ngày:

| Lệnh | Thời điểm | Kết quả đúng trên UI |
|---|---|---|
| `npm run timetravel -- --seconds 86399` (chọn offset để còn < maturity 1s) | `now < maturityAt` | Chỉ có "Rút sớm (−penalty)" + "Rút một phần" + "Top-up" + "Renew"; KHÔNG có "Rút full" |
| cộng thêm `--seconds 1` | `now >= maturityAt` | Đổi: hiện "Rút full (+lãi)", mất "Rút sớm" |
| thêm `--days 3` (+1s nếu cần) | `maturityAt + grace` | "Rút full" vẫn mở, "Renew" thủ công mất (đã qua cửa); `autoRenewDeposit` từ giờ này permissionless gọi được |

> Test tự động đã chứng minh từng giây biên: `SavingCore.base.test.ts` #34 (1s sớm → revert), #35 (đúng giây maturity) và biến thể `+3d − 1` / `+3d`.

### R4 · Confirm in-app + số liệu khớp preview — T11 + T5 (S7)

1. Bấm "Rút sớm" → ConfirmDialog in-app (KHÔNG phải `window.confirm` trình duyệt) hiển thị: mất toàn bộ lãi tích luỹ + penalty (rate) ≈ số USDC + "Nhận ngay" — đối chiếu với dòng "Lãi tích luỹ tới hiện tại" trên cùng trang, phải khớp.
2. "Rút một phần" nhập 40/100 → confirm → sau tx số dư tăng đúng 40, deposit còn 60, maturity giữ nguyên (C3 weighted).
3. "Top-up" +50 → bước 1 "1. Approve (50 USDC)" → bước 2 "Top-up" → principal hợp nhất, APR/tenor snapshot giữ nguyên.

### R5 · Renew qua dropdown plan (Q6 — `SC_PlanNotEnabled`) · PASS: chặn plan disabled

1. Mở deposit của Alice → mở dropdown "Plan cho Renew" → plan hiện tại có tag "(plan hiện tại)" và mặc định chọn sẵn.
2. Hover plan khác → panel dưới list hiện APR/kỳ hạn/min/max/penalty — khớp PlanCard. Bấm chọn → nút "Renew" sáng.
3. Bấm Renew → confirm → tx thành công, NFT status AutoRenewed, maturity mới theo tenor plan đã chọn.
4. Case âm: Account #0 vào Admin → tắt enabled của plan → Alice Renew vào plan đã tắt → tx revert `SC_PlanNotEnabled` (hợp đồng chặn; reopen vào plan khác vẫn được — deposit cũ vẫn accrue và withdraw bình thường).

### R6 · Admin pause + Emergency Withdraw (C5) — T4 · PASS: pause không kẹt vốn vĩnh viễn

1. Account #0 → "Admin" → "Pause hệ thống" → hành động deposit ngừng (nút Rút/Renew/Top-up ẩn theo `paused`), UI hiện nút "Emergency (khóa)" kèm tooltip "Cần pause ≥ 7 ngày (C5)".
2. `npm run timetravel -- --days 8` → nút đổi thành "Emergency Withdraw (C5)".
3. Alice bấm → tx thành công: nhận principal, không lãi, không penalty — admin pause độc quyền không biến thành "giam tài sản" vô thời hạn.

### R7 · Solvency vault (C2) — T3 · PASS: `VM_Insolvent` chặn rút vượt cam kết

UI Admin có nút "Withdraw vault (residual surplus)" với điều kiện client `amount <= available` (chỉ rút phần THỪA sau trừ tổng lãi cam kết). Kiểm tra lớp chặn trên chuỗi (bỏ qua UI) bằng hardhat console:

```bash
npx hardhat console --network localhost
```

```js
const v = await ethers.getContractAt("VaultManager", "<địa chỉ VaultManager>"); // xem deployments/localhost-31337.json
const tk = await ethers.getContractAt("MockUSDC", await v.token());
const bal = await tk.balanceOf(v.target);
await (await v.withdrawVault(bal + 1n)).wait();   // cố rút nhiều hơn quỹ → balance < totalOwedInterest
```

Kết quả: tx **revert `VM_Insolvent`** — admin không thể rút vault đè lên cam kết lãi của user (`VaultManager.sol:119-123`; test `VaultManager.test.ts` biến thể "insolvent +1 unit revert").

### R8 · XSS / confirm native phải biến mất — T11 · PASS: React text nodes

1. `grep -rn "dangerouslySetInnerHTML" frontend/src` → 0 kết quả (mọi chuỗi on-chain render qua text node, React tự escape).
2. `grep -rn "window.confirm\|window.alert" frontend/src` → 0 kết quả (đã thay toàn bộ bằng ConfirmDialog in-app).
3. Fonts + asset self-host (`@fontsource`), `dist` không có external CDN script; CSP header là [prod] còn lại.

### R9 · Secret + supply chain — T12 + T10 · PASS: 0 leak + 0 vuln

```bash
git log -p -- .env .env_example | head                # .env không từng được commit
gitleaks detect --source . --config .gitleaks.toml --exit-code 1   # 0 leaks
npm audit --workspaces                                # 0 vulnerabilities prod deps
git ls-files | findstr "package-lock"                 # lockfile commit cả 2 workspace
```

Đạt: gitleaks 0 leaks (allowlist 6 key Hardhat test — derive từ mnemonic công khai "test test... junk"); `npm ci` hiện là gate thủ công trước mỗi build (chưa có CI pipeline — ghi nhận minh bạch trong SECURITY_PLAN T10, muốn tự kiểm tra lại chỉ cần chạy lại các lệnh trên).

### R10 · Attack không trực tiếp qua UI (giải trình truyền miệng) — T1/T2/T9/T14

- **T1 reentrancy**: cần contract riêng re-enter trong receiver callback — UI không thể; chứng minh bằng S1/S2 + lớp chặn `nonReentrant` + CEI (status chốt trước mọi external call).
- **T2 token giả**: `token` immutable của VaultManager set 1 lần lúc deploy; UI chỉ giao MockUSDC đúng addresses.json.
- **T9 front-run mempool**: local/testnet chấp nhận cho demo; production cần private mempool/Flashblobs hoặc permit EIP-2612.
- **T14 app giả mạo**: video demo ghi rõ domain + địa chỉ contracts verified trên Etherscan; README cảnh báo user luôn xác minh hợp đồng trước approve (production: permit EIP-712 kèm deadline).

---

## Bảng tóm tắt ánh xạ

| Kịch bản | Threat | Test chứng minh | Cách thực hiện |
|---|---|---|---|
| R0 Guard chain | T13 | NetworkGuard (UI) | UI |
| R1 Approve exact | T8 | review `OpenDeposit.tsx` | UI |
| R2 Role isolation | T7 | S3, S4 | UI (URL trực tiếp) |
| R3 Boundary maturity/grace | T6 | #34/#35 + biến thể `+3d` | UI + `timetravel` |
| R4 Confirm + preview khớp | T5, T11 | S5, S7 | UI |
| R5 Renew + plan disabled | Q6 | #12/#18/#40 | UI + Admin |
| R6 Pause ≥ 7d → Emergency | T4 (C5) | C5 test | UI + `timetravel --days 8` |
| R7 Solvency vault (C2) | T3 | `VaultManager` insolvent test | terminal (console) |
| R8 XSS/confirm native | T11 | grep 0 `dangerouslySetInnerHTML` | terminal + UI |
| R9 Secret/supply chain | T10, T12 | gitleaks + npm audit | terminal |
| Phần A (test tự động) | T1, T5, T6, T7 | S1–S8 + suite 164 | terminal |

> Thời gian quay phần an ninh gợi ý: R0–R6 (UI) ~3 phút; phần A (terminal) ~1 phút cắt nhanh. Ghép vào `docs/demo-script.md` sau Cảnh 7 nếu cần.
