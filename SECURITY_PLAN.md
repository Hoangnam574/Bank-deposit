# SECURITY PLAN — Bank Deposit DApp (app + web)

> Áp dụng cho: 3 Smart Contracts (`MockUSDC`, `VaultManager`, `SavingCore`) + auto-renew bot + frontend React + quy trình build/deploy.
> Trạng thái: [x] = đã làm trong code · [ ] = chưa làm / làm trước khi nộp · [prod] = ngoài phạm vi homework (note cho production).
> **Cập nhật 2026-10-26 (v1.1):** phản ánh đúng những gì đã làm — Sepolia deploy + verified 3/3 · gitleaks 2 scan = 0 · ConfirmDialog in-app thay toàn bộ `window.confirm` · fonts `@fontsource` self-host (0 external CDN) · allowlist key Hardhat test chuẩn trong `.gitleaks.toml`.

---

## 1. Threat model (SUM — Spoofing · Tampering · Repudiation · Information disclosure · Denial of service · Elevation of privilege)

| # | Đối thủ & mục tiêu | Vector | Kiểm soát |
|---|---|---|---|
| T1 | Attacker re-call withdraw để rút nhiều lần | reentrancy qua ERC-721 receiver / ERC-20 transfer callback | [x] `nonReentrant` từng hàm + CEI (status chốt trước transfer) + test `Security.test.ts` |
| T2 | Fake token claim vào vault | token giả không phải MockUSDC | [x] dùng `IERC20` interface chuẩn + address set 1 lần lúc deploy (`token` immutable trong VaultManager); [prod] production: luôn dùng USDC mainnet chính thức |
| T3 | Admin rút vault đè cam kết → user mất lãi | `withdrawVault` tùy tiện | [x] C2 solvency: cấm rút khi `bal − amount < totalOwedInterest` (`VM_Insolvent`) |
| T4 | Admin pause vĩnh viễn, kẹt vốn user | pause độc quyền | [x] C5: sau 7 ngày pause, user tự `emergencyWithdraw` bypass được `whenSystemRunning` |
| T5 | Rounding dust được khai thác tích lũy | dust dồn về attacker | [x] D9 floor multiply-before-divide — dust nằm CÒN TRONG vault (về phía protocol, không về user) |
| T6 | Kiểm trạng thái để exploit boundary (`<`/`>=`) | rút sớm/đúng/trễ lộn xộn | [x] D8 + test ở giây biên (`maturityAt−1`, `maturityAt`, `+3d−1`, `+3d`) |
| T7 | Gọi hàm deposit khi không phải owner | gọi withdraw/renew/topUp của người khác | [x] `onlyDepositOwner(depositId)` (đọc live `ownerOf`), quyền tự động theo NFT — Q1 |
| T8 | Frontend gắn ABI/address giả để lure approve | phishing domain / app giả gắn | [x] Approve luôn **exact amount** (`frontend/src/pages/OpenDeposit.tsx` — `approve(spender, amount)`, không MaxUint256); [prod] production: domain chính thức + EIP-712 cho permit |
| T9 | Front-run mempool tx (approve lộ ra trước swap) | kẻ đứng trước trong mempool | [prod] local/testnet chấp nhận (demo); production: private mempool / Flashblobs Protect hoặc permit EIP-2612 |
| T10 | Dependency supply chain (npm inject) | package trôi nổi có malware | [x] `npm audit` đã chạy cả 2 workspace (production = 0 vuln — §3b); `package-lock.json` commit cả 2 dự án; build dùng `npm run build` với lockfile cố định mọi lần; [ ] CI pipeline `npm ci` (hiện chưa có CI — là gate thủ công trước mỗi build) |
| T11 | XSS chạy script trong app React | inject qua dữ liệu on-chain | [x] React tự escape; không dùng `dangerouslySetInnerHTML`; mọi confirm/alert native đã thay bằng ConfirmDialog in-app; [prod] CSP header `default-src 'self'` (fonts + tất cả asset đã self-host nên CSP chỉ cần 'self') |
| T12 | Rò rỉ secret | private key commit nhầm | [x] `.env` trong `.gitignore`, không hardcode; `git log -p -- .env` sạch; [x] **gitleaks 8.30.1 chạy `detect` + `--no-git` = 0 leaks** (2026-10-26, §3c) — đang là **pre-commit gate bắt buộc** trước mọi commit; `.gitleaks.toml` cho phép 6 private key Hardhat test (derive từ well-known mnemonic `"test test test junk…"`, đúng chuẩn công khai của Hardhat — không phải secret thật) |
| T13 | Ví dùng nhầm chain sai (dẫn phí sai, approval sai) | chainId lạ | [x] `NetworkGuard` chặn + `hasDeployment` kiểm tra addresses.json trước khi render |
| T14 | App giả mạo dụ user approve cho spender lạ | social engineering | [prod] ngoài code — video demo chỉ rõ app thật + README cảnh báo; production: permit EIP-2612 kèm deadline |

---

## 2. Smart contracts — hiện trạng (bảo vệ đã có)

| Hạng mục | Chi tiết |
|---|---|
| Reentrancy | `ReentrancyGuard` OZ v5 — `nonReentrant` trên openDeposit/withdrawAtMaturity/earlyWithdraw/partial/topUp/renew/autoRenew/emergencyWithdraw/claimPendingInterest |
| CEI | status → burn NFT → giảm owed TRƯỚC mọi external call |
| Vault-only interest | lãi chỉ chảy qua `VaultManager.payInterest` (chỉ SavingCore được gọi — `onlySavingCore`) |
| Solvency | `totalOwedInterest` vs `getVaultBalance` — rút vault bị chặn, increment/decrement owed ánh xạ từng chunk (top-up, partial, C1) |
| Snapshot immutable | APR + penalty ghi trong `DepositInfo` khi mở → admin đổi plan không ảnh hưởng deposit cũ (test có) |
| Custom errors | `SC_`/`VM_` prefix, không `require(string)` — tiết kiệm gas, test assert từng error |
| Checked math | `* before /`, floor D9; bigint units (1e6), không dùng float |
| Access control | [prod] Ownable 1-step hiện tại; production nên `Ownable2Step` + timelock |
| Pause nguồn duy nhất | `whenSystemRunning` đọc `vault.isPaused()` — không có pause song song trong SC |

**Lệnh kiểm soát (chạy trong repo):**

```bash
npx hardhat test                        # 164 test (đủ edge + security suite)
npx hardhat test --coverage             # 96.52% — gate > 90%
npx hardhat compile
```

## 3. Frontend & bot — hiện trạng

| Hạng mục | Chi tiết |
|---|---|
| No secrets | Frontend đọc ABI + addresses tĩnh, **không bao giờ** chứa private key; bot chạy bằng account deployer từ `.env` của `ac-hardhat-template-v2` |
| Approve exact | Không dùng `MaxUint256` — lượng approve luôn đúng số tiền gửi/top-up hiện tại |
| Bigint chính xác | Preview lãi tính BigInt multiply-before-divide — không lệch so với contract (không dùng `Number.float`) |
| Guard chain | `NetworkGuard` chỉ cho 31337/11155111; sai chain → banner + switchNetwork, không set contract với address rác |
| Toast không đổi | `aria-live`; mọi confirm `window.confirm`/`alert` native đã **thay toàn bộ bằng ConfirmDialog in-app** (`ConfirmProvider` + `useConfirm() → Promise<boolean>`): dialog 2 nút, tone `danger` (rút sớm/emergency) vs `primary`, đóng bằng Hủy/bấm ngoài/`Esc` — giờ đây là modal duy nhất app có |
| Fonts self-host | Inter + IBM Plex Mono bundle qua `@fontsource` (subset vietnamese) — **0 external CDN** trong dev + build → giảm 1 vector supply-chain (không phụ thuộc Google Fonts CDN, CSP giản lược chỉ cần `default-src 'self'`) |
| Pause-aware UI | Nút write tự disable khi vault paused; hiện đồng hồ C5 unlock còn bao nhiêu giờ |
| Bot an toàn | Bot không nắm quyền admin, chỉ gọi public deposit actions; thất bại từng deposit không crash vòng quét |

## 3b. Frontend security assessment — vòng redesign v3 (2026-10-26) + vòng v4 (cùng ngày)

| Khía cạnh | Kết quả | Ghi chú |
|---|---|---|
| Dangerous DOM sinks | [x] 0 hit trong `frontend/src` | Grep `dangerouslySetInnerHTML\|innerHTML\|eval(\|new Function(` toàn `src` — 0; `dist/` chỉ có 13+18 match nằm **bên trong React DOM internals** (metadata prop handler, không phải code app) |
| Runtime write-flow test | [x] qua Playwright | Connect shim → Approve → Mở deposit 1.000 USDC thành công trên Hardhat; validate ở phía client (`min/max/decimal`) + contract cả 2 lớp |
| Bug P0 tìm thấy & vá | [x] | `ContractsProvider` đọc key `usdc/vault/core` nhưng `addresses.json` (do `exportFrontend.ts` xuất) dùng `MockUSDC/VaultManager/SavingCore` → `INVALID_ARGUMENT` crash trắng trang ngay khi có ví — đã đồng bộ key theo phía export nguồn sự thật |
| Wallet fail-safe | [x] | Kết nối từ chối / chain lạ → banner lỗi + `NoDeploymentState`, không crash; `buildContracts` trả null an toàn |
| `npm audit` frontend | [x] 0 vulnerabilities | full Dependence tree (kèm dev) — 2026-10-26 |
| `npm audit` template (contracts) | [x] production = 0 | Full tree còn **20 vuln (15 high / 5 low), 100% dev-toolchain Hardhat/ethers ecosystem**, không ship vào bytecode contract hay bundle frontend. Đã chạy `npm audit fix` non-breaking: nâng `undici` → 7.30.1, `serialize-javascript` → 7.1.4; 164 test vẫn pass sau đó. Số còn lại (zod qua hardhat-zod-utils, elliptic qua @openzeppelin/hardhat-upgrades...) không thể fix non-breaking — chấp nhận có kiểm soát |

**Vòng redesign v4 (cùng ngày 2026-10-26) — thêm facts bảo mật:**

| Khía cạnh | Kết quả | Ghi chú |
|---|---|---|
| `window.confirm`/`window.alert` native | [x] = 0 occurrences trong `frontend/src` | Toàn bộ thay bằng `ConfirmDialog.tsx` (in-app modal, focusable, Esc/click-outside → cancel); phần `dist/` không sinh thêm surface mới |
| External network requests lúc runtime | [x] = 0 | ABI + addresses bundle tĩnh; fonts `@fontsource` self-host (không Google Fonts CDN); không analytics/third-party script |
| `npm audit` sau vòng v4 | [x] 0 production vuln | Frontend full-tree 0; build pass sau khi thêm fonts + ConfirmDialog |
| gitleaks sau khi thêm allowlist | [x] 0 leaks | `.gitleaks.toml` bổ sung allowlist 6 private key Hardhat test-chain (derive từ well-known mnemonic công khai — không phải secret): xuất hiện trong `test/helpers` nhưng không phải credential thật |

## 3c. Secret scanning report — gitleaks (2026-10-26)

- Tool: gitleaks 8.30.1, config custom `.gitleaks.toml` (mở rộng default ruleset).
- `gitleaks detect` (quét toàn bộ git history): **0 leaks** — không secret nào từng vào commit.
- `gitleaks detect --no-git` (quét working tree): **0 leaks** sau triage.
  - 2 hit ban đầu tại `ignition/deployments/chain-11155111/deployed_addresses.json` = **địa chỉ contract công khai** (public on-chain data, không phải secret) → cho phép có kiểm soát.
  - 71 hit trong `.agents/skills/*.md` = ví dụ cURL/JWT/API-key **trong văn bản docs cục bộ**, các file này KHÔNG được track (`git ls-files .agents/skills` = 0) → không thể nào vào git history.
  - File `.env` chứa private key Sepolia **thật của user** — nằm ngoài git tree (gitignored, verify `git check-ignore .env` ⇒ match), không được phép scan/commit. Lưu ý: **không bao giờ** fill `MAINNET_PRIVATE_KEY` bằng placeholder `0x0000…0` (key số 0 bị Hardhat từ chối — HHE15).

## 4. Roadmap — việc còn thiếu (ưu tiên cao → thấp)

### S1 — Trước khi nộp (bắt buộc)
- [x] [x] `npm audit --omit=dev` cả 2 dự án — **0 vulnerabilities (production deps)**; `frontend` full-tree 0; template dev-tree 6 low (tooling dev-only — chấp nhận, khuyến nghị `npm audit fix` trên máy dev mới) — 2026-10-24
- [x] [x] `gitleaks detect` + `gitleaks detect --no-git` (8.30.1, config `.gitleaks.toml`) — **0 leaks cả hai scan** sau triage; chi tiết §3c — 2026-10-26
- [x] [x] Điền địa chỉ Sepolia vào README §2.3 — **xong 2026-10-26** (MockUSDC `0xF203…d67e` · Vault `0x6364…55E9` · Core `0x51Bd…6205`, đã verified Etherscan/Sourcify)
- [ ] [ ] Chụp screenshot coverage (`npx hardhat test --coverage`) → `docs/coverage.png` (README §6 dẫn tới)
- [ ] [ ] Quay video demo 3–5 phút + upload → link vào README (lộ trình §5 EXECUTION_PLAN — Plan A/B 5 ngày)
- [ ] [ ] Tag `v1.0` sau khi video link + coverage.png sẵn sàng (gitleaks chốt cuối trước tag)

### S2 — Ngay sau nộp (nâng cao giá trị)
- [ ] [ ] Fuzz test interest/owed bằng Echidna hoặc Foundry invariant `owed ≤ Σ(principalSeconds×apr)` (nếu thời gian cho phép — không bắt buộc trong homework)
- [ ] [ ] Slither chạy trên `contracts/` — xuất report `docs/slither.md`; finding Medium+ cần note lý do chấp nhận

### S3 — Production checklist (nêu trong video/đào bảo vệ)
- [ ] [prod] `Ownable2Step` + timelock cho `setSavingCore`, `updatePlan`, `pause/unpause`, `withdrawVault`
- [ ] [prod] Multisig (Safe 2/3) giữ admin key; private key admin vào cold storage
- [ ] [prod] Chainlink Automation thay bot off-chain (keeper on-chain tin cậy hơn cron/script)
- [ ] [prod] USDC thật (Ethereum mainnet, decimals 6) — `SavingCore` generic IERC20 nên không cần đổi code
- [ ] [prod] Rate-limit faucet + chống mint-spam same-block trên testnet
- [ ] [prod] CSP + SRI + domain chính thức cho frontend deploy (Vercel/Netlify) — CSP giờ chỉ cần `default-src 'self'` vì mọi asset + font (fontsource) đều self-host, không còn `fonts.gstatic.com` stylesheets/network

### S4 — Quy trình
- [ ] [prod] PR review 2 người cho mỗi pull request vào contracts — hợp đồng không trực tiếp merge lên master
- [ ] [prod] Immutable deploy (không upgradeable) — chấp nhận bug bằng C5 emergency + redeploy với cùng address pattern (CREATE2 optional)

## 5. Acceptance criteria của plan này

| KPI | Đích |
|---|---|
| 164 test passing | [x] đã đạt |
| Coverage lines ≥ 90% | [x] 96.52% |
| Reentrancy test | [x] MaliciousDepositor 0 lượt thành công |
| Secrets trong git history | [x] = 0 (gitleaks detect + --no-git, xem §3c) |
| npm audit HIGH/CRITICAL | [x] = 0 production deps cả 2 workspace; 20 vuln còn lại 100% dev-toolchain (§3b) |
| Approve MaxUint256 trong frontend | [x] = 0 |
| boundary test ở giây biên | [x] có (D8 suite) |
| `window.confirm`/`alert` native trong app | [x] = 0 (ConfirmDialog in-app thay toàn bộ) |
| External CDN/runtime request | [x] = 0 (fonts @fontsource self-host, mọi asset tĩnh) |
| Sepolia contracts verified | [x] 3/3 (Etherscan + Sourcify, 2026-10-26) |

> Mọi thay đổi bảo mật sau v1.0 phải qua PR có ghi CHANGELOG.Security.
