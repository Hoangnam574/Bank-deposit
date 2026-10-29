# KỊCH BẢN QUAY VIDEO DEMO & BẢO VỆ ĐỒ ÁN (ORAL DEFENSE SCRIPT)
## Môn học: Lập trình Blockchain (Blockchain Programming) — Đề tài: Online Banking System
**Sinh viên thực hiện**: **AT190234** (MSSV: `...234` → Chữ số cuối `A = 4`, Chữ số kề cuối `B = 3`)

---

## MỤC LỤC
1. [Thông số biến thể cá nhân (Personal Variant §8.1)](#1-thông-số-biến-thể-cá-nhân-personal-variant-81)
2. [Checklist chuẩn bị trước khi quay / bảo vệ](#2-checklist-chuẩn-bị-trước-khi-quay--bảo-vệ)
3. [Kịch bản chi tiết quay Video Demo (Chuẩn 3–5 phút)](#3-kịch-bản-chi-tiết-quay-video-demo-chuẩn-35-phút)
4. [Kịch bản vấn đáp & kiểm tra an ninh (Oral Defense & Security Checklist)](#4-kịch-bản-vấn-đáp--kiểm-tra-an-ninh-oral-defense--security-checklist)
5. [Giải trình 7 câu hỏi thiết kế (Design Answers Q1–Q7 §8.2)](#5-giải-trình-7-câu-hỏi-thiết-kế-design-answers-q1q7-82)
6. [Giải trình 5 tính năng sáng tạo lấy trọn điểm thưởng (Creative Challenges C1–C5 §8.3)](#6-giải-trình-5-tính-năng-sáng-tạo-lấy-trọn-điểm-thưởng-creative-challenges-c1c5-83)

---

## 1. THÔNG SỐ BIẾN THỂ CÁ NHÂN (PERSONAL VARIANT §8.1)

Toàn bộ hợp đồng, bộ kiểm thử và số liệu hiển thị trong video demo / bảo vệ khớp 100% với MSSV **AT190234** (`A = 4`, `B = 3`):

| Tham số (§8.1) | Công thức đề bài | Tính toán | Giá trị chốt |
| :--- | :--- | :--- | :--- |
| **Grace Period (Ân hạn tái ký)** | `(A mod 3) + 2` ngày | `(4 mod 3) + 2` | **3 ngày** |
| **Default Plan APR (Lãi suất năm)** | `(200 + A * 25)` bps | `200 + 4 * 25` | **300 bps (3.00%/năm)** |
| **Early Penalty (Phạt rút sớm)** | `(300 + B * 50)` bps | `300 + 3 * 50` | **450 bps (4.50%)** |
| **Default Plan Tenor (Kỳ hạn mẫu)** | `B` lẻ → 180 ngày; `B` chẵn → 90 ngày | `B = 3` (lẻ) | **180 ngày** |

### Số liệu kiểm chứng tài chính (Số chuẩn dùng trong video):
* Gửi **1.000 USDC** kỳ hạn **180 ngày** @ **300 bps**:
  $$\text{Lãi khi đáo hạn} = \frac{1.000 \times 10^6 \times 300 \times (180 \times 86.400)}{31.536.000 \times 10.000} = 14.794520 \text{ USDC}$$
  *(Rút đúng hạn nhận về: 1.014,794520 USDC)*.
* Rút trước hạn @ **450 bps**:
  $$\text{Phạt} = \frac{1.000 \times 450}{10.000} = 45 \text{ USDC}$$
  *(User nhận 955 USDC, feeReceiver nhận 45 USDC, mất toàn bộ lãi)*.

---

## 2. CHECKLIST CHUẨN BỊ TRƯỚC KHI QUAY / BẢO VỆ

1. **Khởi động môi trường**:
   * Terminal 1: `npm run node` (Hardhat node local port 8545).
   * Terminal 2: `npm run deploy:local` && `npm run seed` (triển khai hợp đồng và nạp thanh khoản mẫu).
   * Terminal 3: `npm --prefix frontend run dev` (chạy giao diện tại `http://localhost:5173`).
2. **Chuẩn bị ví MetaMask**:
   * **Account #0** (`0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`): Admin / Deployer (có quyền truy cập tab Admin).
   * **Account #1** (`0x70997970C51812dc3A010C7d01B50e0d17dc79C8`): Depositor Alice (người gửi tiết kiệm).
3. **Mở sẵn các Tab trình duyệt**:
   * Tab 1: Ứng dụng Web `http://localhost:5173` (hoặc bản Vercel production).
   * Tab 2: GitHub Repository (`Hoangnam574/Bank-deposit`).
   * Tab 3: Sepolia Etherscan kiểm chứng hợp đồng đã verify.

---

## 3. KỊCH BẢN CHI TIẾT QUAY VIDEO DEMO (CHUẨN 3–5 PHÚT)

### ⏱ 0:00 – 0:35: Giới thiệu kiến trúc & Biến thể cá nhân
* **Hình ảnh trên màn hình**: Mở đầu tại trang GitHub README, rê chuột chỉ vào MSSV và bảng Personal Variant.
* **Lời thoại**:
  > "Kính chào thầy cô và các bạn. Em là sinh viên thực hiện đề tài Online Banking System với mã số sinh viên AT190234. Theo công thức đề bài với A = 4 và B = 3, hệ thống của em có kỳ hạn mặc định là 180 ngày, lãi suất 3.00% (300 bps), phạt rút sớm 4.50% (450 bps) và thời gian ân hạn tự động tái ký là 3 ngày.
  > Về kiến trúc, hệ thống tách bạch tuyệt đối thành 3 hợp đồng độc lập: MockUSDC chuẩn 6 số lẻ, SavingCore quản lý sổ tiết kiệm và phát hành chứng nhận NFT ERC-721, và VaultManager nắm giữ quỹ thanh khoản dự trữ của ngân hàng. Lãi luôn được chi trả từ Vault, tách biệt hoàn toàn với tiền gốc của khách hàng."

---

### ⏱ 0:35 – 1:30: Quy trình mở sổ tiết kiệm & Mint chứng nhận NFT
* **Hình ảnh trên màn hình**: 
  1. Kết nối ví Account #1 (Alice) trên web.
  2. Bấm nút Faucet ("Nạp thử 1k") nếu cần thêm số dư.
  3. Vào menu **Mở tiết kiệm** (`/open`).
  4. Rê chuột vào gói kỳ hạn **180 ngày (3.00% APR)** được gắn nhãn vàng "Đề xuất".
  5. Nhập số lượng: `1000` USDC.
  6. Bấm nút **Mở tiết kiệm** (nút bấm tích hợp cơ chế 1-click: tự động Approve chính xác 1.000 USDC rồi thực hiện giao dịch mở sổ).
* **Lời thoại**:
  > "Tại trang Mở tiết kiệm, gói 180 ngày tương ứng với biến thể của em được hệ thống tự động đề xuất. Khi em nhập 1.000 USDC, hệ thống tính toán trước lãi khi đáo hạn chính xác là 14.794520 USDC.
  > Giao diện hỗ trợ quy trình 1-click mượt mà: khi bấm 'Mở tiết kiệm', hệ thống yêu cầu cấp quyền đúng 1.000 USDC (không cấp quyền vô hạn nhằm bảo đảm an toàn) và lập tức mở sổ, đúc ra một NFT ERC-721 chứng nhận số tiền gửi on-chain."

---

### ⏱ 1:30 – 2:20: Chi tiết sổ tiết kiệm, Snapshot APR & Rút trước hạn
* **Hình ảnh trên màn hình**:
  1. Vào menu **Sổ tiết kiệm** (`/deposits`), click vào sổ vừa mở để xem trang Chi tiết (`/deposit/:id`).
  2. Rê chuột chỉ các thẻ: Gốc 1.000 USDC, APR chốt 3.00%, Phạt rút sớm -4.50% (≈ 45 USDC), Lãi đáo hạn 14.794520 USDC.
  3. Bấm nút **Rút sớm (-4.50%)** → Cửa sổ xác nhận hiện rõ cảnh báo: mất toàn bộ lãi, phạt 45 USDC, nhận về 955 USDC.
* **Lời thoại**:
  > "Tại trang chi tiết sổ, mọi thông số APR và mức phạt được snapshot cố định bất biến trên hợp đồng.
  > Nếu người dùng rút trước hạn, hợp đồng áp dụng chế độ phạt 4.50% trên phần gốc. Cửa sổ xác nhận thông báo minh bạch: mất toàn bộ lãi, phạt 45 USDC và thực nhận 955 USDC về ví, tiền phạt chuyển thẳng vào quỹ dự trữ của ngân hàng."

---

### ⏱ 2:20 – 3:15: Tính năng mở rộng: Nạp thêm & Rút một phần (C3 & C4)
* **Hình ảnh trên màn hình**:
  1. Nhập `100` vào ô số lượng.
  2. Bấm **Nạp thêm 100**: Cửa sổ xác nhận hiện rõ số lãi đáo hạn tăng thêm tương ứng với số ngày còn lại (`+ΔLãi` 6 chữ số thập phân) và tổng gốc mới là 1.100 USDC.
  3. Bấm **Rút một phần**: Cửa sổ xác nhận hiện rõ số lãi đáo hạn bị giảm, số tiền phạt rút sớm và số tiền thực nhận ngay về ví.
* **Lời thoại**:
  > "Đây là hai tính năng sáng tạo C3 và C4 theo Section 8.3: Thay vì ép người dùng tất toán toàn bộ, hệ thống cho phép Nạp thêm và Rút một phần linh hoạt. Lãi được tính dồn tích theo trọng số thời gian thực (Weighted Time Accrual) đến từng giây, hiển thị minh bạch mức tăng/giảm lãi trong cửa sổ xác nhận trước khi ký ví."

---

### ⏱ 3:15 – 4:05: Đáo hạn, Tái ký thủ công & Bot tự động tái ký (Auto-Renew)
* **Hình ảnh trên màn hình**:
  1. Mở Terminal chạy lệnh tua thời gian:
     ```powershell
     $env:TT_DAYS=181; npm run timetravel
     ```
  2. F5 trang web: Sổ chuyển sang trạng thái **Đã đáo hạn** (100%), xuất hiện nút **Rút toàn bộ** (+14.794520 USDC) và nút **Tái ký**.
  3. Giải thích cơ chế Bot off-chain:
     ```powershell
     npm run bot
     ```
     Bot quét hàm `canAutoRenew()` và tự động tái ký nếu quá 3 ngày ân hạn (grace period).
* **Lời thoại**:
  > "Khi thời gian vượt qua ngày đáo hạn 180 ngày, sổ chuyển sang trạng thái Đã đáo hạn. Người dùng có quyền rút toàn bộ gốc + lãi đủ hạn, hoặc tái ký sang kỳ hạn mới.
  > Nếu sau 3 ngày ân hạn (grace period) người dùng không thao tác, bot off-chain sẽ tự động kích hoạt hàm autoRenewDeposit. Toàn bộ gốc và lãi được ghép thành kỳ hạn mới và đặc biệt lãi suất APR được khóa giữ nguyên mức cũ nhằm bảo vệ tối đa quyền lợi người gửi."

---

### ⏱ 4:05 – 4:50: Phân quyền Quản trị (Admin), Solvency Guard & Tổng kết
* **Hình ảnh trên màn hình**:
  1. Chuyển ví sang Account #0 (Admin) → Tab **Admin** xuất hiện trên thanh điều hướng.
  2. Vào trang `/admin`: xem tính năng Quản lý gói lãi suất, Nạp/Rút quỹ Vault, Tạm dừng khẩn cấp (Pause).
  3. Mở Terminal chạy báo cáo kiểm thử:
     ```powershell
     npm run test:coverage
     ```
* **Lời thoại**:
  > "Hệ thống bảo vệ phân quyền chặt chẽ: chỉ Admin mới truy cập được bảng quản trị. Admin được trang bị Solvency Guard (C2), ngăn chặn hành vi rút cạn tiền quỹ vượt quá phần lãi đã cam kết trả khách hàng. Khi hệ thống pause quá 7 ngày, người dùng được quyền kích hoạt rút khẩn cấp C5 để bảo toàn vốn.
  > Toàn bộ dự án đạt 164 bài kiểm thử tự động với độ bao phủ dòng lệnh đạt trên 96.5%, đã triển khai song song cả bản demo 1s và bản nghiệp vụ chuẩn trên Sepolia Testnet. Em xin cảm ơn thầy cô đã theo dõi!"

---

## 4. KỊCH BẢN VẤN ĐÁP & KIỂM TRA AN NINH (ORAL DEFENSE & SECURITY CHECKLIST)

Khi thầy cô yêu cầu kiểm tra các trường hợp biên và kiểm thử an ninh trực tiếp:

| Mục kiểm tra | Kịch bản thao tác & Lệnh | Kết quả kỳ vọng đạt chuẩn | Mã đe dọa |
| :--- | :--- | :--- | :--- |
| **R0 · Network Guard** | Chuyển ví sang mạng không hỗ trợ (ví dụ Ethereum Mainnet hoặc Polygon). | Thanh cảnh báo xuất hiện, toàn bộ nút bấm bị vô hiệu hóa an toàn. | `T13` |
| **R1 · Cấp quyền an toàn (Exact Allowance)** | Mở sổ 100 USDC, quan sát popup MetaMask. | Yêu cầu cấp quyền đúng `100 USDC` (không cấp quyền vô hạn `type(uint256).max`). | `T8` |
| **R2 · Phân quyền sở hữu NFT** | Dùng Account #2 truy cập URL sổ của Alice `/#/deposit/1`. | Chỉ xem được thông tin, bảng "Thao tác" bị ẩn hoàn toàn vì kiểm tra live `ownerOf(depositId)`. | `T7` |
| **R3 · Kiểm tra giây biên (Boundary Time)** | Dùng lệnh `npm run timetravel` tua đúng `maturityAt - 1s` vs `maturityAt`. | Trước 1 giây: chỉ cho rút sớm (-phạt). Đúng giây đáo hạn: nút rút đủ hạn (+lãi) xuất hiện. | `T6` |
| **R4 · Chống tấn công Reentrancy** | Chạy kiểm thử: `npx hardhat test test/Security.test.ts`. | Hợp đồng có `nonReentrant` + mô hình CEI (Cập nhật trạng thái và burn NFT trước khi chuyển token). Đòn tấn công thất bại 100%. | `T1` |
| **R5 · Kế hoạch bị vô hiệu hóa (Disabled Plan)** | Admin tắt gói kỳ hạn #1. Người dùng cố mở mới hoặc tái ký vào gói đó. | Hợp đồng lập tức từ chối với lỗi `SC_PlanNotEnabled()`. Các sổ đã mở trước đó vẫn chạy bình thường. | `Q6` |
| **R6 · Rút khẩn cấp khi Pause (C5)** | Admin gọi `pause()`. Tua thời gian quá 7 ngày (`EMERGENCY_DELAY`). | Người dùng kích hoạt `emergencyWithdraw()`, rút lại 100% gốc an toàn dù hệ thống đang bị đóng băng. | `T4 / C5` |

---

## 5. GIẢI TRÌNH 7 CÂU HỎI THIẾT KẾ (DESIGN ANSWERS Q1–Q7 §8.2)

### Câu 1: Chứng chỉ NFT chuyển nhượng được không? Ai rút tiền? Có nguy hiểm không?
* **Trả lời**: Chứng chỉ tiền gửi là NFT ERC-721 chuẩn, hoàn toàn chuyển nhượng được. Quyền rút tiền luôn thuộc về chủ sở hữu hiện tại đọc trực tiếp qua hàm `ownerOf(depositId)` tại thời điểm giao dịch (không lưu cứng địa chỉ người mở ban đầu).
* **Đánh giá**: Hành vi này **rất tốt và đúng triết lý DeFi**, biến sổ tiết kiệm thành tài sản có tính thanh khoản cao (người dùng có thể bán lại sổ cho người khác trên chợ NFT trước hạn thay vì chịu phạt). Nguy cơ gửi nhầm chỉ xảy ra nếu người dùng tự chuyển nhượng bất cẩn.
* **Vị trí code**: `SavingCore.sol` modifier `onlyDepositOwner` (kiểm tra `ownerOf(depositId) == msg.sender`) và gọi `_burn(depositId)` khi tất toán.

### Câu 2: Vault rỗng tiền trả lãi thì xử lý ra sao?
* **Trả lời**: Quy chuẩn đề bài yêu cầu `revert`. Tuy nhiên, nếu revert thì ngân hàng có thể "bắt cóc" tiền gốc của khách hàng vĩnh viễn chỉ bằng cách không nạp tiền vào quỹ lãi.
* **Giải pháp của em (Challenge C1)**: Cho phép khách hàng **rút 100% tiền gốc về ví ngay lập tức**, phần lãi chưa thanh toán được lưu vào sổ nợ `pendingInterestOf[user]`. Khi ngân hàng nạp tiền vào Vault, người dùng có thể bấm nhận lãi nợ qua hàm `claimPendingInterest()`.

### Câu 3: Bot tự động tái ký bị chết (offline 1 tháng) thì sao? Người dùng có mất tiền không?
* **Trả lời**: Người dùng **hoàn toàn không mất tiền**. Bot off-chain chỉ là công cụ hỗ trợ tiện ích, không nắm giữ bất kỳ quyền quản trị hay token nào.
* **Hệ quả & Bảo vệ**: Khi bot ngừng chạy, sổ tiết kiệm quá hạn vẫn giữ nguyên trạng thái `Active`. Khách hàng có thể chủ động bấm rút gốc + lãi bất kỳ lúc nào, hoặc tự bấm tái ký thủ công mà không bị phạt hay hết hạn.

### Câu 4: Làm tròn số lẻ (Rounding Dust) thuộc về ai? Có gây revert sai số dư không?
* **Trả lời**: Phép tính lãi dùng số học nguyên với kỹ thuật nhân trước chia sau và làm tròn xuống (`floor division`).
* **Quy tắc**: Phần dư làm tròn (nhỏ hơn $10^{-6}$ USDC) **thuộc về Vault của ngân hàng**. Nhờ làm tròn xuống, số lãi thực trả luôn $\le$ số lãi lý thuyết ($\text{paid} \le \text{owed}$), đảm bảo quỹ ngân hàng không bao giờ bị thâm hụt hay revert do thiếu 1 wei. Được chứng minh qua test case `dust` trong test suite.

### Câu 5: Biên thời gian: Đúng giây `maturityAt` là "sớm" hay "đủ hạn"?
* **Trả lời**: Đúng giây `maturityAt` được tính là **Đủ hạn (At Maturity)**.
* **Toán tử so sánh**:
  * Rút sớm: `block.timestamp < maturityAt` (chỉ khi nhỏ hơn nghiêm ngặt).
  * Rút đủ hạn: `block.timestamp >= maturityAt` (bắt đầu từ đúng giây đáo hạn trở đi).
  * Hai khoảng thời gian hoàn toàn rời nhau, loại trừ triệt để khoảng chết (dead zone).

### Câu 6: Admin vô hiệu hóa gói lãi suất (Disable Plan) khi có sổ đang hoạt động?
* **Trả lời**: Việc vô hiệu hóa chỉ ngăn chặn người dùng **mở mới** hoặc **tái ký mới** vào gói đó (`SC_PlanNotEnabled`).
* **Bảo toàn quyền lợi**: Các sổ tiết kiệm đã mở trước đó tiếp tục chạy bình thường, hưởng đủ lãi suất đã cam kết vì thông số lãi và kỳ hạn đã được snapshot độc lập từ lúc mở.

### Câu 7: Kịch bản tấn công điển hình & Cơ chế phòng chống?
* **Trả lời**: Tấn công tái thâm nhập (**Reentrancy Attack**) khi rút tiền hoặc đúc NFT.
* **Cơ chế ngăn chặn 3 lớp**:
  1. Modifier `nonReentrant` trên toàn bộ hàm thay đổi trạng thái.
  2. Tuân thủ tuyệt đối mô hình **Checks-Effects-Interactions (CEI)**: Đổi trạng thái sổ sang `Withdrawn` và burn NFT trước khi gọi lệnh chuyển token.
  3. Cơ chế kiểm soát quyền: Chỉ SavingCore mới có quyền ra lệnh cho VaultManager giải ngân lãi.

---

## 6. GIẢI TRÌNH 5 TÍNH NĂNG SÁNG TẠO LẤY TRỌN ĐIỂM THƯỞNG (CREATIVE CHALLENGES C1–C5 §8.3)

| Mã | Tính năng sáng tạo | Vấn đề trong đề bài gốc | Giải pháp thực hiện & Đánh đổi |
| :---: | :--- | :--- | :--- |
| **C1** | **Bảo toàn gốc khi Vault rỗng** | Đề bắt `revert` khi Vault thiếu tiền lãi → kẹt vốn gốc của khách hàng. | Cho rút ngay tiền gốc; lãi ghi nhận vào `pendingInterestOf` để khách hàng claim sau khi Vault có tiền. |
| **C2** | **Bảo vệ thanh khoản (Solvency Guard)** | Đề cho Admin tự do rút tiền khỏi Vault → có thể rút trộm phần lãi đã hứa trả cho khách. | Hợp đồng theo dõi biến `totalOwedInterest`. Admin chỉ được rút phần thanh khoản vượt quá mức cam kết trả lãi. |
| **C3** | **Rút một phần trước hạn (Partial Withdrawal)** | Đề chỉ cho rút tất toán 100% → khách cần ít tiền cũng phải phá cả sổ và chịu phạt nặng. | Cho phép rút một phần gốc; chỉ phạt trên phần rút ra; phần gốc còn lại tiếp tục sinh lãi dồn tích đến ngày đáo hạn. |
| **C4** | **Nạp thêm tiền vào sổ (Top-up Deposit)** | Khách có thêm tiền phải mở sổ mới với kỳ hạn và lãi suất mới riêng lẻ. | Cho phép nạp thêm tiền vào sổ đang chạy; tiền nạp thêm tính lãi theo thời gian còn lại đến ngày đáo hạn (`amount * remaining`). |
| **C5** | **Rút khẩn cấp khi hệ thống đóng băng (Emergency Exit)** | Khi Admin gọi `pause()`, mọi giao dịch bị dừng vô thời hạn → rủi ro chiếm đoạt tiền. | Nếu hệ thống bị pause quá 7 ngày (`EMERGENCY_DELAY`), khách hàng được quyền rút lại 100% tiền gốc (không tính lãi, không phạt). |

---
*Tài liệu được chuẩn hóa phục vụ trực tiếp cho buổi quay video demo và bảo vệ đồ án kết thúc học phần.*
