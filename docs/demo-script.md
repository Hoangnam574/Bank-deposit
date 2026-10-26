# Kịch bản quay video demo — Bank Deposit DApp (AT190234)

Video 7–9 phút, 1080p. Quay bằng OBS Studio. Mọi lệnh chạy ở thư mục gốc repo.
Trên PowerShell đặt biến env kiểu: `$env:TT_DAYS=31; npm run timetravel`.

## Chuẩn bị TRƯỚC khi bấm REC

1. Terminal A: `npm run node` (đang chạy).
2. Terminal B: `cd frontend; npm run dev` (đang chạy, mở `localhost:5173`).
3. MetaMask:
   - giả lập hai tài khoản Hardhat: #0 `0xf39F…2266` (owner/admin), #1 `0x7099…79C8` (người dùng thường);
   - tài khoản Sepolia thật của deployer `0x649D72EF…50295`;
   - network `Hardhat Local · 31337` (RPC `http://127.0.0.1:8545`).
4. Tab trình duyệt: `localhost:5173`, Sepolia Etherscan (Vault `0x6364C8b…55E9`), GitHub repo.
5. Kiểm tra `.env` đã có khóa để bot sign (đã dùng cho deploy Sepolia trước đó).

## Chạy setup ngay đầu video (khoảng 40 giây)

```powershell
npm run deploy:local
npm run seed
```
Sau đó bấm **Kết nối ví** bằng tài khoản #0. UI badge phải là `Hardhat Local · 31337`.

---

## Cảnh 1 — Intro (0:00–0:40)

- Mở tab GitHub README, cuộn tới sơ đồ kiến trúc và badge.
- Thoại: "Project gồm 3 hợp đồng Solidity: MockUSDC (token 6 decimals), VaultManager (plan + sổ tiết
  kiệm), Core (điều phối rút/lãi). Tất cả đã deploy và verify trên Sepolia. Backend đạt 164 test,
  coverage 96,52% theo dòng lệnh."

## Cảnh 2 — Deploy local + mở sổ (0:40–2:50)

- `npm run deploy:local` — chỉ 3 địa chỉ, khớp badge UI.
- `npm run seed` — mint USDC cho owner, dựng 4 plan (tenor 30/90/180/365 ngày).
- Bấm **Kết nối ví** (#0). Thoại: "Nếu cài ≥2 ví: trang sẽ hiện picker chọn ví theo EIP-6963."
- Vào `/open`: chỉ rõ **plan variant 180 ngày đã tự chọn sẵn** (viền vàng "Đề xuất").
- Nhập `1000` — panel Tóm tắt kỳ hạn cập nhật lãi dự kiến + ngày đáo hạn.
- **Approve** → MetaMask xác nhận (tx 1) → toast thành công.
- **Mở tiết kiệm** → MetaMask xác nhận (tx 2) → toast; balance giảm 1000.

Thoại: "Hai bước approve + deposit là pattern ERC-20 tiêu chuẩn. Sổ tiết kiệm đã ghi on-chain."

## Cảnh 3 — Chi tiết sổ (2:50–3:50)

- `/deposits` → mở deposit vừa tạo.
- Chỉ: principal, tenure, ngày đáo hạn, lãi dự kiến.
- Chỉ panel: **phạt rút sớm 450 bps**, **grace 3 ngày** miễn phạt sau đáo hạn.
- Quay `/open`, bấm plan #2 (30 ngày, APR 2,5%) để so sánh APR.

## Cảnh 4 — Bot auto-renew (3:50–5:10)

Chuẩn bị: trước cảnh 3 (hoặc đang ở `/open`) mở thêm 1 sổ **plan #2 (30 ngày)**, số tiền `300`.

```powershell
$env:TT_DAYS=31; npm run timetravel   # nhảy 31 ngày
npm run bot                           # để chạy ~12 giây rồi Ctrl+C
```

- F5 `/deposits`: sổ 30 ngày hiện trạng thái **chín/đáo hạn**.
- Log bot phát hiện deposit chín và gửi tx renew (dòng `Renewed deposit #…` nếu có).
- F5 detail: maturity mới = 1 chu kỳ sau đó; tenure tăng 1.
- Thoại: "Người dùng không phải bấm gì — bot cuộn vốn + lãi sang chu kỳ mới."

Lưu ý: nếu bot không thấy deposit phù hợp, kiểm tra đã mở sổ 30 ngày và đã timetravel đủ 31 ngày.

## Cảnh 5 — Rút sớm + phạt (5:10–6:10)

- Mở sổ **plan #3 (90 ngày)**, tiền `100`, rồi vào detail.
- **Rút trước hạn** → MetaMask → chỉ số balance USDC trước/sau: chênh lệch = 450 bps phạt.
- Thoại: "Rút trước hạn bị phạt 4,5% theo hợp đồng; sau đáo hạn trong 3 ngày grace thì miễn phạt."
- Tuỳ chọn: `$env:TT_DAYS=91; npm run timetravel` → rút sổ vừa chín → không phạt.

## Cảnh 6 — Admin-only (6:10–7:10)

- MetaMask: **switch tài khoản #1** (người dùng thường), F5.
- Link **Admin biến mất** khỏi navbar.
- Gõ tay `localhost:5173/#/admin` → **redirect về trang chủ**.
- Switch lại **#0**, F5 → link Admin quay lại, vào `/admin` xem console quản trị.

Lưu ý kỹ thuật: hash-only đổi URL không reload trang — luôn F5 sau khi switch tài khoản.

## Cảnh 7 — Sepolia (7:10–8:20)

- Tab Etherscan Sepolia: chỉ địa chỉ Vault (mã nguồn verified).
- Thoại: "Trên Sepolia: MockUSDC `0xF203…d67e`, Vault `0x6364…55E9`, Core `0x51Bd…6205`."
- Bấm **pill mạng góc phải header** → modal trong app → **Sepolia** → MetaMask xác nhận 1 lần → badge đổi `Sepolia · 11155111` ngay (không reload).- Khuyến nghị chỉ demo **đọc dữ liệu** (dashboard + sổ) trên Sepolia; toàn bộ ghi có tx đã demo ở local.
  (Nếu muốn mở sổ thật trên Sepolia: cần dư USDC testnet đã seed từ deployer, và mọi tx đều thật.)

## Cảnh 8 — Outro (8:20–8:50)

- Tab README: mục tests + coverage.
- Thoại: "Tổng kết: 164 test, 96,52% coverage, deploy local + Sepolia, auto-renew bot, UI đa ví."
  "Cảm ơn thầy cô — code và tài liệu đầy đủ trong repo."

---

## Mẹo quay

- Quay một bản dài rồi cắt, hoặc quay từng cảnh để retake dễ.
- Nói chậm; ngại nói thì quay không lời, thêm phụ đề sau.
- Font trình duyệt zoom 150% để chữ rõ ở video.
- MetaMask chậm thì đợi, đừng bấm hóa.

## Sau khi quay xong

- [ ] Upload YouTube (Unlisted) → gửi tôi link.
- [ ] Tôi chèn link vào README, gitleaks, commit.
- [ ] Chạy `npx hardhat coverage` → xuất `docs/coverage.png`.
- [ ] Tag `v1.0` + GitHub Release.
