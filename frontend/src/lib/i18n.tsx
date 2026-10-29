/**
 * lib/i18n.tsx — đa ngôn ngữ VI/EN tự viết (không thêm dependency):
 *   - LangProvider bọc toàn app; useLang() → { lang, setLang, t }
 *   - t(key, params?) nội suy "{placeholder}"
 *   - Lựa chọn lưu localStorage("lang"), mặc định tiếng Việt
 *   - rawT()/getLang() dùng được ở code ngoài React (lib/format.ts, providers)
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type Lang = "vi" | "en";

/* ─────────────────────────── Từ điển tiếng Việt ─────────────────────────── */
const VI = {
  /* common */
  "common.close": "Đóng",
  "common.confirm": "Xác nhận",
  "common.cancel": "Hủy",
  "common.reload": "Reload trang",
  "common.dayUnit": "ngày",
  "common.notice": "Thông báo",
  "common.ok": "Đồng ý",

  /* app shell */
  "app.adminChecking": "Đang kiểm tra quyền quản trị…",
  "app.notFound": "Trang không tồn tại —",
  "app.notFoundLink": "về trang chủ",
  "footer.tagline": "Gửi USDC theo kỳ hạn · Lãi cố định theo gói · Chứng nhận NFT",

  /* nav */
  "nav.overview": "Tổng quan",
  "nav.open": "Mở tiết kiệm",
  "nav.deposits": "Sổ tiết kiệm",
  "nav.admin": "Quản trị",
  "nav.faucet": "Nạp thử 1k",
  "nav.faucetAria": "Nạp thử — mint 1.000 USDC",
  "nav.faucetLabel": "Nạp thử: mint 1.000 USDC",
  "nav.txNoWallet": "Chưa kết nối ví",
  "nav.connect": "Kết nối ví",
  "nav.connectShort": "Kết nối",
  "nav.connecting": "Đang kết nối",
  "nav.disconnect": "Ngắt",
  "nav.disconnectTitle": "{addr} — nhấn để ngắt kết nối",
  "nav.demoTitle": "Account Hardhat #{i} — {role}",
  "nav.extTitle": "Account ngoài (có thể không có ETH/USDC local)",
  "nav.mainAria": "Điều hướng chính",
  "nav.mainAriaMobile": "Điều hướng chính (mobile)",
  "nav.menuAria": "Mở menu điều hướng và ngôn ngữ",
  "nav.langAria": "Ngôn ngữ",

  /* chain / network */
  "chain.unknown": "Không rõ",
  "chain.pillTitle": "Mạng ví đang kết nối",
  "chain.pillHint": "Bấm để chọn mạng",
  "chain.pillAria": "Chọn mạng",
  "chain.modalEyebrow": "Network",
  "chain.modalTitle": "Chọn mạng của bạn",
  "chain.modalHint": "MetaMask sẽ hiện popup xác nhận sau khi bạn chọn.",
  "chain.current": "Đang dùng",
  "chain.switch": "Chuyển →",
  "chain.switching": "Đang chuyển…",
  "chain.modalAria": "Chọn mạng",
  "chain.guardLine": "Ví đang ở",
  "chain.guardReq": "— ứng dụng cần Hardhat Local (31337) hoặc Sepolia (11155111).",
  "chain.testModeBanner": "Chế độ test: 1 ngày = {s} giây",
  "chain.guardHint":
    "Bấm vào pill tên mạng ở góc trên bên phải (kể cả khi mạng lạ) để chọn lại mạng.",

  /* wallet */
  "wallet.noDetected": "Chưa phát hiện ví Web3",
  "wallet.installHint1": "Cài đặt",
  "wallet.installHint2": "(hoặc Rabby/OKX…) rồi bấm",
  "wallet.installHint3": "ở góc phải header.",
  "wallet.connectBtn": "Kết nối ví",
  "wallet.pickerEyebrow": "Kết nối ví",
  "wallet.pickerTitle": "Chọn ví của bạn",
  "wallet.pickerHint": "Bấm vào ví bạn muốn dùng — trang chỉ giao dịch với ví đã chọn.",
  "wallet.pickerAria": "Chọn ví để kết nối",
  "wallet.defaultInjected": "MetaMask (ví mặc định của trang)",
  "wallet.notInstalled": "Chưa cài ví (MetaMask/Rabby…) — cài rồi thử lại",
  "wallet.rejected": "Kết nối bị từ chối — mở ví và thử lại",
  "wallet.reading": "Đang đọc dữ liệu on-chain…",

  /* nodeploy */
  "nodeploy.title": "Trang {page} chưa có dữ liệu hợp đồng",
  "nodeploy.chainLine": "Mạng đang kết nối:",
  "nodeploy.deployments": "— ứng dụng chỉ có deployment trên",
  "nodeploy.sepoliaNote": "11155111 (Sepolia, nếu đã triển khai)",
  "nodeploy.switchHint": "Đổi mạng: bấm",
  "nodeploy.switchHintPill": "pill tên mạng ở góc phải header",
  "nodeploy.switchHintModal": "để mở modal “Chọn mạng của bạn”.",
  "nodeploy.hardhatQ": "Account ví không có tiền local? Import key Hardhat",
  "nodeploy.step1a": "MetaMask →",
  "nodeploy.step1b": "(chọn Private key) → dán key của một account bên dưới.",
  "nodeploy.step2": "Kiểm tra network của MetaMask phải là",
  "nodeploy.copied": "Đã copy ✔",
  "nodeploy.copyKey": "Copy private key",
  "nodeploy.keyNote":
    "Key mặc định của Hardhat — chỉ dùng demo local, không phải tài sản thật.",

  /* plan */
  "plan.variantTag": "Plan gợi ý",
  "plan.recommended": "Đề xuất",
  "plan.tenor": "{d} ngày kỳ hạn",
  "plan.min": "Tối thiểu",
  "plan.max": "Tối đa",
  "plan.noMax": "Không giới hạn",
  "plan.penalty": "Phạt rút sớm",
  "plan.example": "Ví dụ: gửi {amount} USDC đủ hạn → nhận lãi ~",
  "plan.paused": "Kỳ hạn tạm ngưng",
  "plan.loading": "Đang tải kỳ hạn…",
  "plan.choose": "Chọn kỳ hạn…",
  "plan.ofCurrent": "(kỳ hạn hiện tại)",
  "plan.newTag": "kỳ hạn mới",
  "plan.currentTag": "· kỳ hạn hiện tại",
  "plan.pausedShort": "· Tạm ngưng",
  "plan.renewListAria": "Kỳ hạn cho tái ký",
  "plan.hoverHint":
    "Di chuột vào một kỳ hạn để xem thông số (APR · kỳ hạn · min/max · phạt rút sớm).",
  "plan.maturity1k": "Lãi đủ hạn 1.000",
  "plan.fmt": "Kỳ hạn #{id}",

  /* dashboard */
  "dash.eyebrow": "Chứng nhận NFT gửi kỳ hạn",
  "dash.title": "Tiết kiệm có kỳ hạn",
  "dash.body1": "Gửi USDC, nhận",
  "dash.bodyStrong": "chứng nhận NFT",
  "dash.body2":
    ", lãi tính theo giây (APR khóa tại thời điểm mở). Rút đúng hạn nhận trọn lãi; rút sớm chịu phạt. Sau grace period",
  "dash.bodyGrace": "+3 ngày",
  "dash.body3": ", sổ",
  "dash.body4": "tự động tái ký",
  "dash.body5": "giữ nguyên APR.",
  "dash.chip1": "NFT là sổ tiết kiệm — chỉ chủ sở hữu NFT rút/tái ký",
  "dash.chip2": "Mạng demo · MockUSDC 6 decimals",
  "dash.cta": "Mở tiết kiệm",
  "dash.ctaView": "Xem sổ tiết kiệm",
  "dash.connectHint": "Kết nối ví ở navbar để xem số dư và mở sổ — hoặc bấm",
  "dash.connectHintCode": "Nạp thử 1k",
  "dash.connectHint2": "sau khi kết nối.",
  "dash.plansEyebrow": "Plans on-chain",
  "dash.plansTitle": "Kỳ hạn gửi",
  "dash.recommendedNote": "Đề xuất: kỳ hạn {d} ngày · APR {apr}",
  "dash.plansEmpty": "Chưa có kỳ hạn nào — quản trị viên cần chạy",
  "dash.filler":
    "Chọn kỳ hạn ở trên hoặc vào thẳng form mở sổ — approve rồi mở trong cùng lần bấm.",
  "dash.fillerCta": "Đến form mở sổ",
  "dash.plansAria": "Các kỳ hạn tiết kiệm",

  /* stat strip */
  "stat.usdc": "USDC khả dụng",
  "stat.active": "Sổ đang chạy",
  "stat.principal": "Đang gửi (gốc)",
  "stat.vault": "Vault khả dụng (quản trị)",
  "stat.refresh": "Làm mới số liệu",

  /* open deposit */
  "open.eyebrow": "Mở sổ mới",
  "open.title": "Mở tiết kiệm",
  "open.formAria": "Form mở tiết kiệm",
  "open.amountLabel": "Số tiền muốn gửi (USDC)",
  "open.amountPh": "VD: 1000",
  "open.balanceNow": "Số dư hiện tại: {bal} USDC",
  "open.reasonNoPlan": "Chọn một kỳ hạn",
  "open.reasonPaused": "Kỳ hạn tạm ngưng",
  "open.reasonNoAmount": "Nhập số tiền",
  "open.reasonMax": "Tối đa {max} USDC",
  "open.reasonMin": "Tối thiểu {min} USDC",
  "open.reasonBalance": "Số dư chỉ {bal} USDC",
  "open.cta": "Mở tiết kiệm",
  "open.hintPending": "Đang xử lý — nếu cần, approve chạy trước rồi tự mở sổ (2 popup MetaMask).",
  "open.hintIdle": "Bấm 1 lần: cần approve thì hiện dialog trước, xong tự mở sổ.",
  "open.summaryEyebrow": "Tóm tắt kỳ hạn",
  "open.sumInterest": "Lãi dự kiến đủ hạn",
  "open.sumPenalty": "Phạt nếu rút sớm",
  "open.sumAprTenor": "APR · Kỳ hạn",
  "open.sumMaturity": "Đáo hạn (ước lượng)",
  "open.sumNote": "Lãi tính theo giây — số hiển thị khớp logic hợp đồng (làm tròn xuống, 6 số lẻ).",
  "open.sumEmpty": "Chọn kỳ hạn ở trên và nhập số tiền để xem dự phóng lãi / phạt / ngày đáo hạn.",
  "open.plansAria": "Danh sách kỳ hạn",
  "open.loadingAria": "Đang tải kỳ hạn",
  "open.approveTitle": "Cần cấp quyền Approve USDC",
  "open.approve1": "Chuẩn ERC-20 bắt buộc:",
  "open.approve2": "— cho phép hợp đồng rút",
  "open.approve3": "USDC từ ví của bạn để mở sổ.",
  "open.approve4": "Sẽ có",
  "open.approve5": "2 popup MetaMask liên tiếp",
  "open.approve6":
    ": (1) Approve → (2) Mở sổ. Chỉ cần approve lại khi số tiền vượt hạn mức còn dư.",
  "open.approveOk": "Approve & Mở sổ",
  "open.successTitle": "Mở sổ thành công",
  "open.success1": "Sổ",
  "open.success2": "đã mở:",
  "open.success3": "ngày · APR",
  "open.success4": "· đáo hạn (ước lượng)",
  "open.successOk": "Xem sổ",
  "open.successCancel": "Về trang chủ",

  /* my deposits */
  "dep.eyebrow": "Chứng nhận NFT",
  "dep.title": "Sổ tiết kiệm",
  "dep.new": "Mới",
  "dep.filterAll": "Tất cả",
  "dep.filterActive": "Đang chạy",
  "dep.filterClosed": "Đã đóng",
  "dep.filterAria": "Lọc sổ tiết kiệm",
  "dep.empty": "Bạn chưa có sổ tiết kiệm nào",
  "dep.emptyActive": "Bạn không có sổ nào đang chạy",
  "dep.emptyClosed": "Chưa có sổ nào đã đóng",
  "dep.emptyCta": "Mở sổ đầu tiên",
  "dep.loadError": "Đọc dữ liệu lỗi — triển khai/seed trước và kết nối ví đúng mạng",
  "dep.historyEyebrow": "Lịch sử — sổ đã tất toán",
  "dep.historyAria": "Lịch sử tất toán",
  "dep.noActive": "Không có sổ đang chạy — các sổ trước đây của bạn nằm bên dưới.",
  "dep.kind.maturity": "Rút đúng hạn",
  "dep.kind.early": "Rút sớm",
  "dep.kind.partial": "Rút một phần",
  "dep.kind.emergency": "Rút khẩn cấp",
  "dep.kind.renewed": "Tái ký",
  "dep.partialNote": "Rút một phần — sổ vẫn đang chạy",
  "dep.renewedNote": "Tái ký thành sổ mới #{id}",
  "dep.closedAt": "Đóng lúc {date}",
  "dep.blockNote": "Block {n}",
  "dep.page": "Sổ tiết kiệm",

  /* deposit detail */
  "detail.back": "Trở về",
  "detail.eyebrow": "Chi tiết sổ tiết kiệm",
  "detail.title": "Sổ tiết kiệm",
  "detail.subApr": "Lãi tính theo giây · APR chốt khi mở",
  "detail.subPenalty": "· phạt",
  "detail.subLocked": "(chốt tại thời điểm mở — đổi kỳ hạn sau không ảnh hưởng)",
  "detail.notOwner":
    "Chỉ chủ sở hữu NFT ({short}…) mới thao tác được — bạn đang dùng {you}…",
  "detail.boxPrincipal": "Gốc (principal)",
  "detail.boxApr": "APR khi mở (chốt)",
  "detail.boxTenor": "Kỳ hạn",
  "detail.boxMaturity": "Đáo hạn",
  "detail.boxInterestMatured": "Lãi nhận khi rút đúng hạn",
  "detail.boxInterestEst": "Lãi dự kiến khi đáo hạn",
  "detail.boxPenalty": "Phạt nếu rút sớm",
  "detail.penaltyApprox": "≈ {amount} USDC với gốc hiện tại",
  "detail.days": "{d} ngày",
  "detail.withdrawnOkTitle": "Rút thành công",
  "detail.withdrawnOkBody":
    "Sổ #{id} đã tất toán — NFT đã burn, số tiền (gốc + lãi / sau phạt) đã về ví của bạn.",
  "detail.toDeposits": "Về sổ tiết kiệm",
  "detail.toHome": "Về trang chủ",
  "detail.notFoundTitle": "Không tìm thấy sổ #{id}",
  "detail.notFoundBody":
    "NFT của sổ này có thể đã bị burn sau khi rút, hoặc liên kết trỏ đến ID chưa từng tồn tại trên mạng đang kết nối. Kiểm tra ID trong sổ tiết kiệm của bạn.",
  "detail.loadingAria": "Đang tải sổ #{id}",
  "detail.page": "Chi tiết sổ",

  /* auto-renew */
  "detail.arHeading": "Tự động tái ký",
  "ar.a": "Bật: khi sổ đáo hạn và hết",
  "ar.b": "ngày grace, ứng dụng",
  "ar.c": "tự gọi renew",
  "ar.d": "toàn bộ gốc + lãi ghép theo kỳ hạn bạn chọn bên dưới. NFT mới được cấp — trang tự chuyển sang sổ mới.",
  "ar.scheduled": "Hẹn:",
  "ar.planEyebrow": "Kỳ hạn sẽ tái ký vào",
  "ar.planHint":
    "Di chuột/chọn kỳ hạn để xem APR · kỳ hạn · phạt rút sớm (mặc định: kỳ hạn hiện tại).",
  "ar.ready": "Đã đủ điều kiện — ứng dụng sẽ tự tái ký ngay (chỉ chạy 1 lần).",
  "ar.switchAria": "Tự động tái ký sau grace",
  "ar.onTitle": "Bật tự động tái ký",
  "ar.on1": "Khi sổ #{id} đáo hạn và hết",
  "ar.on2": "ngày grace, ứng dụng sẽ",
  "ar.on3": "tự động gọi renew",
  "ar.on4":
    "toàn bộ gốc + lãi ghép theo kỳ hạn bạn chọn. NFT mới được cấp — trang tự chuyển sang sổ mới.",
  "ar.onNote":
    "Ứng dụng/tab cần đang mở để chạy (dịch vụ tự động off-chain vẫn chạy song song khi node có key).",
  "ar.onOk": "Bật tự động tái ký",
  "ar.offTitle": "Tắt tự động tái ký",
  "ar.off1": "Sổ sẽ không còn tự tái ký khi hết grace — bạn phải",
  "ar.offStrong": "tái ký hoặc rút thủ công",
  "ar.offOk": "Tắt tự động tái ký",

  /* over grace / deferred / closed */
  "og.a": "Hết grace period",  "og.b": "(đáo hạn + 3 ngày) — hệ thống sẽ tự gọi autoRenewDeposit: gốc + lãi ghép chuyển sang kỳ hạn mới, APR",
  "og.c": "giữ nguyên",
  "og.d": "và kỳ hạn",
  "og.e": "ngày (chốt khi mở).",
  "detail.deferred1": "Lãi bị hoãn trả (kho quỹ tạm thiếu USDC tại thời điểm rút): đang",
  "detail.deferred2": "NỢ bạn",
  "detail.deferredCta": "Nhận {amount}",
  "detail.deferredTx": "Nhận lãi hoãn",
  "detail.earlyWarn":
    "Rút sớm trước đáo hạn: mất toàn bộ lãi tích luỹ + phạt {penalty} (≈ {amount} USDC) → chỉ nhận",
  "detail.closedNote": "Sổ đã đóng —",
  "detail.closedStrong": "chế độ chỉ xem",
  "detail.closedTail":
    "(NFT đã burn, không thao tác được). Số liệu trên là snapshot lịch sử.",
  "detail.settleEyebrow": "Kết quả tất toán",
  "detail.settleAt": "Thời điểm tất toán",
  "detail.settleReceived": "Số tiền nhận",
  "detail.settleInterest": "Lãi nhận",
  "detail.settlePenalty": "Phạt rút sớm (lỗ)",
  "detail.settleRenewed": "Tái ký thành sổ mới",
  "detail.settleLink": "Sổ #{id} →",
  "detail.pauseNote": "Hệ thống đang tạm dừng — thao tác ghi bị chặn. Rút khẩn cấp mở sau",
  "detail.pauseHours": "giờ.",

  /* actions */
  "detail.actions": "Thao tác",
  "detail.opAmountLabel": "Số lượng (cho Rút một phần / Nạp thêm)",
  "detail.opPh": "VD: 1000",
  "detail.topupNote":
    "Nạp thêm không bị giới hạn min/max của kỳ hạn — chỉ giới hạn MAX_PRINCIPAL của hợp đồng.",
  "detail.renewPlanLabel": "Kỳ hạn cho tái ký",
  "detail.renewNote":
    "Tái ký chỉ vào kỳ hạn đang bật — ngược lại hợp đồng sẽ từ chối (SC_PlanNotEnabled).",
  "detail.btnWithdrawFull": "Rút toàn bộ (+{interest} lãi)",
  "detail.txWithdrawFull": "Rút đủ hạn",
  "detail.earlyTitle": "Rút sớm",
  "detail.earlyMsg":
    "Rút {principal} USDC trước đáo hạn (còn {days} ngày): mất toàn bộ lãi tích luỹ (−{interest}) + phạt {penalty} (≈ {approx} USDC).",
  "detail.earlyReceive": "Nhận ngay: {amount} USDC.",
  "detail.earlyOk": "Đồng ý rút sớm",
  "detail.btnEarly": "Rút sớm (−{penalty})",
  "detail.txEarly": "Rút sớm",
  "detail.partialTitle": "Rút một phần",
  "detail.partialMsg":
    "Rút {amount} USDC khỏi sổ #{id}. Lãi của phần gốc rút được tính theo thời gian gửi; phần còn lại tiếp tục tích lãi đến đáo hạn.",
  "detail.partialOk": "Rút một phần",
  "detail.btnPartial": "Rút một phần",
  "detail.txPartial": "Rút một phần",
  "detail.topupTitle": "Nạp thêm vào sổ",
  "detail.topupMsg":
    "Gửi thêm {amount} USDC vào sổ #{id} — hợp nhất vào gốc, lãi tiếp tục tính trên số mới đến đáo hạn (APR/kỳ hạn chốt khi mở giữ nguyên).",
  "detail.topupOk": "Nạp thêm",
  "detail.btnTopup": "Nạp thêm {amount}",
  "detail.txTopup": "Nạp thêm",
  "detail.approveTopupTitle":
    "Bước 1: Approve — cho phép hợp đồng rút USDC từ ví khi bạn nạp thêm. ERC-20 bắt buộc bước này trước khi nạp thêm; chỉ cần làm 1 lần cho số tiền đó.",
  "detail.btnApprove": "1. Approve ({amount} USDC)",
  "detail.topupApproveTitle": "Cần cấp quyền (Approve) USDC",
  "detail.topupApproveMsg": "Để nạp thêm {amount} USDC vào sổ #{id}, bạn cần cấp quyền (Approve) cho hợp đồng SavingCore trừ số USDC này từ ví của bạn. Bạn có muốn thực hiện cấp quyền trên MetaMask ngay bây giờ không?",
  "detail.topupApproveOk": "Cấp quyền ngay",
  "detail.maturedNoTopup": "Sổ đã đáo hạn — không thể nạp thêm gốc, chỉ có thể rút hoặc tái ký.",
  "detail.notMaturedRenew": "Sổ chưa đáo hạn — chỉ có thể tái ký khi đã đến ngày đáo hạn.",
  "og.afterGrace": "đáo hạn + {grace}",
  "detail.txApprove": "Approve USDC (nạp thêm)",
  "detail.needAmount": "Nhập số lượng ở trên",
  "detail.ltPrincipal": "Phải nhỏ hơn gốc",
  "detail.renewTitle": "Tái ký (gửi tiếp kỳ mới)",
  "detail.renew1": "Gốc + lãi ghép chuyển thành kỳ hạn mới theo",
  "detail.renewCurrent": "kỳ hạn hiện tại",
  "detail.renewTarget": "Kỳ hạn #{id}",
  "detail.renewSpec": "— APR {apr}, kỳ hạn {days} ngày, phạt rút sớm {penalty}",
  "detail.renewTail": ". NFT được cập nhật trạng thái tự tái ký (AutoRenewed).",
  "detail.renewOk": "Tái ký ngay",
  "detail.btnRenew": "Tái ký",
  "detail.txRenew": "Tái ký",
  "detail.renewHint":
    "Tái ký: gửi tiếp toàn bộ gốc + lãi ghép thành một kỳ hạn mới theo kỳ hạn đã chọn.",
  "detail.btnEmergencyLocked": "Rút khẩn cấp (khoá)",
  "detail.emergencyLockTitle": "Cần tạm dừng ≥ 7 ngày trước khi rút khẩn cấp",
  "detail.emergencyTitle": "Rút khẩn cấp",
  "detail.emergencyMsg":
    "Rút khi hệ thống tạm dừng ≥ 7 ngày: nhận gốc, không có lãi và không bị phạt.",
  "detail.emergencyOk": "Rút khẩn cấp",
  "detail.btnEmergency": "Rút khẩn cấp",
  "detail.txEmergency": "Rút khẩn cấp",
  "detail.waitingTx": "Đợi xác nhận giao dịch… (mã giao dịch hiển thị ở góc màn hình)",
  "detail.debugSummary": "Chi tiết kỹ thuật (snapshot từ hợp đồng)",

  /* tx / toast */
  "toast.pendingSuffix": "— đang gửi...",
  "toast.waitingMiner": "Chờ miner xác nhận...",
  "toast.reverted": "— giao dịch bị từ chối trên chain",
  "toast.successSuffix": "— thành công",
  "toast.failTail": "không thể hoàn tất",
  "toast.okBlock": "— OK (block {n})",
  "toast.explorer": "Xem trên explorer ↗",
  "toast.closeAria": "Đóng thông báo",

  /* confirm defaults */
  "confirm.defaultTitle": "Xác nhận",
  "confirm.defaultOk": "Xác nhận",
  "confirm.defaultCancel": "Hủy",

  /* status badge */
  "status.active": "Active",
  "status.withdrawn": "Đã rút",
  "status.renewed": "Đã Renew",
  "status.autoRenewed": "Tự động Renew",
  "status.unknown": "Không rõ",

  /* ticker */
  "ticker.perDay": "USDC/ngày",

  /* skeleton */
  "skeleton.loading": "Đang tải dữ liệu",

  /* admin */
  "admin.eyebrow": "Bảng điều khiển kho quỹ",
  "admin.title": "Trang quản trị",
  "admin.ownerLabel": "Chủ kho quỹ:",
  "admin.copyTitle": "{addr} — bấm để copy",
  "admin.youAreOwner": "(bạn là chủ kho quỹ)",
  "admin.notOwner": "(không phải bạn — chỉ xem)",
  "admin.lockedNote":
    "Các thao tác ghi chỉ dành cho chủ kho quỹ — form bên dưới bị khoá.",
  "admin.reading": "Đang đọc trạng thái kho quỹ…",
  "admin.tileBalance": "Số dư kho quỹ (thực)",
  "admin.tileOwed": "Lãi cam kết trả",
  "admin.tileAvailable": "Khả dụng (được rút)",
  "admin.healthTitle": "Sức khoẻ thanh khoản",
  "admin.insolvent": "khả dụng < 0 — mất khả năng chi trả",
  "admin.sysLabel": "Hệ thống:",
  "admin.paused": "TẠM DỪNG",
  "admin.running": "ĐANG CHẠY",
  "admin.unlockIn": "· rút khẩn cấp mở sau {h} giờ",
  "admin.btnUnpause": "Mở lại",
  "admin.btnPause": "Tạm dừng",
  "admin.txPause": "Tạm dừng hệ thống",
  "admin.txUnpause": "Mở lại hệ thống",
  "admin.plansEyebrow": "Quản lý kỳ hạn",
  "admin.plansTitle": "Các kỳ hạn",
  "admin.minShort": "tối thiểu",
  "admin.maxShort": "tối đa",
  "admin.penaltyShort": "phạt",
  "admin.newAprAria": "APR mới cho kỳ hạn {id}",
  "admin.aprPh": "APR bps",
  "admin.btnUpdate": "Cập nhật",
  "admin.txUpdateApr": "Cập nhật APR",
  "admin.btnDisable": "Tạm ngưng",
  "admin.btnEnable": "Bật lại",
  "admin.txDisable": "Tạm ngưng kỳ hạn",
  "admin.txEnable": "Bật kỳ hạn",
  "admin.createTitle": "Tạo kỳ hạn mới",
  "admin.fTenor": "Kỳ hạn (ngày)",
  "admin.fApr": "APR (bps)",
  "admin.fPenalty": "Phạt rút sớm (bps)",
  "admin.fMin": "Gửi tối thiểu (USDC)",
  "admin.fMax": "Gửi tối đa (USDC)",
  "admin.btnCreate": "Tạo kỳ hạn",
  "admin.txCreate": "Tạo kỳ hạn",
  "admin.txMissingTenorApr": "Thiếu kỳ hạn/APR",
  "admin.fundTitle": "Nạp / Rút kho quỹ",
  "admin.fundNote":
    "Nạp: approve + fundVault (2 giao dịch). Rút: chỉ phần khả dụng — không thể rút dưới số lãi cam kết (giữ khả năng chi trả).",
  "admin.amountLabel": "Số USDC",
  "admin.amountPh": "VD: 100000",
  "admin.btnFund": "Nạp kho quỹ",
  "admin.txFund": "Nạp kho quỹ",
  "admin.btnWithdraw": "Rút kho quỹ",
  "admin.txWithdraw": "Rút kho quỹ (phần dư)",
  "admin.txNoAmount": "Số lượng phải > 0",
  "admin.withdrawCap":
    "Chỉ rút được tối đa {amount} USDC (không vượt quá phần khả dụng).",
  "admin.connectFirst": "Kết nối ví để xem trang quản trị (nút",
  "admin.connectFirstBtn": "“Kết nối ví”",
  "admin.connectFirst2": "ở navbar).",
  "admin.vaultStatusAria": "Trạng thái kho quỹ",

  /* vault gauge */
  "gauge.reading": "Đang đọc dữ liệu kho quỹ",
  "gauge.empty": "Kho quỹ trống — nạp vốn (fundVault) để vận hành",
  "gauge.insolvent": "Rủi ro mất khả năng chi trả — rút/trả lãi sẽ bị từ chối (VM_Insolvent)",
  "gauge.healthy": "Khoẻ — đủ trả cả gốc cam kết lẫn lãi",
  "gauge.tight": "Cận thanh khoản — cân nhắc nạp thêm trước các đợt rút",
  "gauge.thin": "Thanh khoản mỏng — gần ngưỡng VM_Insolvent",
  "gauge.aria": "Sức khoẻ thanh khoản kho quỹ: {label}",
  "gauge.balance": "Số dư (thực)",
  "gauge.owed": "Lãi cam kết",
  "gauge.available": "Khả dụng",
  "gauge.note": "health = khả dụng ÷ số dư. Kho quỹ giữ",
  "gauge.noteStrong": "100% vốn gốc của các sổ đang chạy",
  "gauge.note2":
    ". VM_Insolvent chặn mọi rút/trả lãi khi khả dụng ≤ 0 — đồng hồ đỏ nghĩa là kho quỹ thiếu phần dự phòng, không phải mất tiền.",

  /* countdown */
  "countdown.done": "Đã đáo hạn",
  "countdown.expired": "Hết hạn",
  "countdown.dh": "{d} ngày {h} giờ",
  "countdown.hm": "{h} giờ {m} phút",
  "countdown.ms": "{m} phút {s} giây",
  "countdown.sec": "{s} giây",

  /* hooks */
  "plans.error": "Không đọc được danh sách kỳ hạn — kiểm tra mạng và bản triển khai",

  /* errors (contract + wallet + parse) */
  "err.amountInvalid": "Số tiền không hợp lệ",
  "err.decimals": "Tối đa {n} chữ số thập phân",
  "err.userRejected": "Bạn đã từ chối giao dịch trong ví",
  "err.VM_ZeroAmount": "Số lượng phải > 0",
  "err.VM_ZeroAddress": "Địa chỉ không hợp lệ (0x0)",
  "err.VM_InsufficientBalance": "Kho quỹ không đủ USDC để trả lãi — thử lại sau",
  "err.VM_Insolvent": "Rút sẽ làm kho quỹ thiếu tiền cam kết cho các sổ đang chạy",
  "err.VM_NotSavingCore": "Chỉ SavingCore được gọi hàm này",
  "err.SC_UnknownPlan": "Kỳ hạn không tồn tại",
  "err.SC_PlanNotEnabled": "Kỳ hạn này tạm ngưng — không thể mở/tái ký vào kỳ hạn",
  "err.SC_InvalidPlan": "Tham số kỳ hạn không hợp lệ",
  "err.SC_AmountOutOfRange": "Số tiền ngoài khoảng min/max của kỳ hạn",
  "err.SC_DepositUnknown": "Sổ tiết kiệm không tồn tại",
  "err.SC_DepositNotOwner": "Bạn không phải chủ sở hữu sổ này",
  "err.SC_DepositNotActive": "Sổ đã đóng (đã rút/tái ký)",
  "err.SC_TooEarly":
    "Chưa tới hạn rút — chờ tới đáo hạn; nếu bỏ qua, hệ thống sẽ tự tái ký giúp bạn",
  "err.SC_TooLate":
    "Đã quá grace period — hệ thống tự tái ký tự động, không thể rút thủ công",
  "err.SC_InvalidTopUpAmount": "Số nạp thêm không hợp lệ",
  "err.SC_InvalidPartialAmount": "Số rút một phần không hợp lệ — phải thấp hơn tổng gốc",
  "err.SC_MaxPrincipalExceeded": "Tổng gốc vượt MAX_PRINCIPAL của hợp đồng",
  "err.SC_EmergencyLocked": "Mới tạm dừng < 7 ngày — chưa được rút khẩn cấp",
  "err.SC_NothingPending": "Không có lãi hoãn nào để nhận",
  "err.ERC20": "Chuyển token bị lỗi — kiểm tra hạn mức approve",
};

export type TKey = keyof typeof VI;

/* ─────────────────────────── Từ điển tiếng Anh ─────────────────────────── */
const EN: Record<TKey, string> = {
  "common.close": "Close",
  "common.confirm": "Confirm",
  "common.cancel": "Cancel",
  "common.reload": "Reload page",
  "common.dayUnit": "days",
  "common.notice": "Notice",
  "common.ok": "OK",

  "app.adminChecking": "Checking admin rights…",
  "app.notFound": "Page not found —",
  "app.notFoundLink": "back to home",
  "footer.tagline": "Fixed-term USDC deposits · Fixed APR per plan · NFT receipts",

  "nav.overview": "Overview",
  "nav.open": "New Deposit",
  "nav.deposits": "My Deposits",
  "nav.admin": "Admin",
  "nav.faucet": "Faucet 1k",
  "nav.faucetAria": "Faucet — mint 1,000 USDC",
  "nav.faucetLabel": "Faucet: mint 1,000 USDC",
  "nav.txNoWallet": "Wallet not connected",
  "nav.connect": "Connect Wallet",
  "nav.connectShort": "Connect",
  "nav.connecting": "Connecting",
  "nav.disconnect": "Disconnect",
  "nav.disconnectTitle": "{addr} — click to disconnect",
  "nav.demoTitle": "Hardhat account #{i} — {role}",
  "nav.extTitle": "External account (may have no local ETH/USDC)",
  "nav.mainAria": "Main navigation",
  "nav.mainAriaMobile": "Main navigation (mobile)",
  "nav.menuAria": "Open navigation and language menu",
  "nav.langAria": "Language",

  "chain.unknown": "Unknown",
  "chain.pillTitle": "Connected wallet network",
  "chain.pillHint": "Click to choose a network",
  "chain.pillAria": "Choose network",
  "chain.modalEyebrow": "Network",
  "chain.modalTitle": "Choose your network",
  "chain.modalHint": "MetaMask will show a confirmation popup after you choose.",
  "chain.current": "Active",
  "chain.switch": "Switch →",
  "chain.switching": "Switching…",
  "chain.modalAria": "Choose network",
  "chain.guardLine": "Your wallet is on",
  "chain.guardReq": "— this app requires Hardhat Local (31337) or Sepolia (11155111).",
  "chain.testModeBanner": "Test mode: 1 day = {s}s",
  "chain.guardHint":
    "Click the network pill in the top-right corner (even for an unknown network) to switch.",

  "wallet.noDetected": "No Web3 wallet detected",
  "wallet.installHint1": "Install",
  "wallet.installHint2": "(or Rabby/OKX…) then click",
  "wallet.installHint3": "in the top-right of the header.",
  "wallet.connectBtn": "Connect Wallet",
  "wallet.pickerEyebrow": "Connect wallet",
  "wallet.pickerTitle": "Choose your wallet",
  "wallet.pickerHint": "Click the wallet you want to use — the app will only transact with it.",
  "wallet.pickerAria": "Choose a wallet to connect",
  "wallet.defaultInjected": "MetaMask (page default)",
  "wallet.notInstalled": "No wallet installed (MetaMask/Rabby…) — install one and retry",
  "wallet.rejected": "Connection rejected — open your wallet and try again",
  "wallet.reading": "Reading on-chain data…",

  "nodeploy.title": "No contract data on the {page} page",
  "nodeploy.chainLine": "Connected network:",
  "nodeploy.deployments": "— the app only has deployments on",
  "nodeploy.sepoliaNote": "11155111 (Sepolia, if deployed)",
  "nodeploy.switchHint": "To switch networks: click",
  "nodeploy.switchHintPill": "the network pill in the top-right of the header",
  "nodeploy.switchHintModal": "to open the “Choose your network” modal.",
  "nodeploy.hardhatQ": "Wallet account empty on local? Import a Hardhat key",
  "nodeploy.step1a": "MetaMask →",
  "nodeploy.step1b": "(choose Private key) → paste one of the keys below.",
  "nodeploy.step2": "Make sure MetaMask is on",
  "nodeploy.copied": "Copied ✔",
  "nodeploy.copyKey": "Copy private key",
  "nodeploy.keyNote": "Default Hardhat key — for local demo only, not real funds.",

  "plan.variantTag": "Featured plan",
  "plan.recommended": "Featured",
  "plan.tenor": "{d}-day term",
  "plan.min": "Minimum",
  "plan.max": "Maximum",
  "plan.noMax": "No limit",
  "plan.penalty": "Early-exit penalty",
  "plan.example": "Example: deposit {amount} USDC to term → earn ~",
  "plan.paused": "Plan paused",
  "plan.loading": "Loading plans…",
  "plan.choose": "Choose a plan…",
  "plan.ofCurrent": "(current plan)",
  "plan.newTag": "new plan",
  "plan.currentTag": "· current plan",
  "plan.pausedShort": "· paused",
  "plan.renewListAria": "Renewal plan",
  "plan.hoverHint": "Hover a plan to preview its terms (APR · term · min/max · early-exit penalty).",
  "plan.maturity1k": "Interest on 1,000",
  "plan.fmt": "Plan #{id}",

  "dash.eyebrow": "Fixed-term NFT receipts",
  "dash.title": "Fixed-Term Savings",
  "dash.body1": "Deposit USDC and receive",
  "dash.bodyStrong": "an NFT certificate",
  "dash.body2":
    ". Interest accrues per second with the APR locked at opening. Exit at maturity for full interest; early exit incurs a penalty. After the",
  "dash.bodyGrace": "+3-day",
  "dash.body3": "grace period, the position",
  "dash.body4": "auto-renews",
  "dash.body5": "at the same APR.",
  "dash.chip1": "The NFT is the passbook — only its owner can withdraw/renew",
  "dash.chip2": "Demo network · MockUSDC (6 decimals)",
  "dash.cta": "Start saving",
  "dash.ctaView": "View my deposits",
  "dash.connectHint":
    "Connect your wallet in the navbar to see balances and open a deposit — or press",
  "dash.connectHintCode": "Faucet 1k",
  "dash.connectHint2": "after connecting.",
  "dash.plansEyebrow": "Plans on-chain",
  "dash.plansTitle": "Deposit plans",
  "dash.recommendedNote": "Featured: {d}-day term · APR {apr}",
  "dash.plansEmpty": "No plans yet — an administrator needs to run",
  "dash.filler":
    "Pick a plan above or go straight to the form — approve and open in a single click.",
  "dash.fillerCta": "Open the form",
  "dash.plansAria": "Savings plans",

  "stat.usdc": "Available USDC",
  "stat.active": "Active deposits",
  "stat.principal": "Principal locked",
  "stat.vault": "Vault available (admin)",
  "stat.refresh": "Refresh data",

  "open.eyebrow": "New deposit",
  "open.title": "New Deposit",
  "open.formAria": "New deposit form",
  "open.amountLabel": "Amount to deposit (USDC)",
  "open.amountPh": "e.g. 1000",
  "open.balanceNow": "Current balance: {bal} USDC",
  "open.reasonNoPlan": "Pick a plan",
  "open.reasonPaused": "Plan paused",
  "open.reasonNoAmount": "Enter an amount",
  "open.reasonMax": "Maximum {max} USDC",
  "open.reasonMin": "Minimum {min} USDC",
  "open.reasonBalance": "Balance is only {bal} USDC",
  "open.cta": "Open deposit",
  "open.hintPending":
    "Processing — if needed, approval runs first, then the deposit opens (2 MetaMask popups).",
  "open.hintIdle":
    "One click: if approval is needed, a dialog appears first, then the deposit opens automatically.",
  "open.summaryEyebrow": "Term summary",
  "open.sumInterest": "Interest at maturity",
  "open.sumPenalty": "Penalty if exited early",
  "open.sumAprTenor": "APR · Term",
  "open.sumMaturity": "Maturity (estimated)",
  "open.sumNote":
    "Interest accrues per second — figures match the contract logic (floor, 6 decimals).",
  "open.sumEmpty":
    "Pick a plan above and enter an amount to preview interest / penalty / maturity.",
  "open.plansAria": "Deposit plans",
  "open.loadingAria": "Loading plans",
  "open.approveTitle": "USDC approval required",
  "open.approve1": "ERC-20 requires an",
  "open.approve2": "approval — it lets the contract draw",
  "open.approve3": "USDC from your wallet to open the deposit.",
  "open.approve4": "You will see",
  "open.approve5": "2 consecutive MetaMask popups",
  "open.approve6":
    ": (1) Approve → (2) Open deposit. Re-approval is only needed when the amount exceeds the remaining allowance.",
  "open.approveOk": "Approve & Open",
  "open.successTitle": "Deposit opened",
  "open.success1": "Deposit",
  "open.success2": "opened:",
  "open.success3": "days · APR",
  "open.success4": "· maturity (estimated)",
  "open.successOk": "View deposit",
  "open.successCancel": "Back to home",

  "dep.eyebrow": "NFT receipts",
  "dep.title": "My Deposits",
  "dep.new": "New",
  "dep.filterAll": "All",
  "dep.filterActive": "Active",
  "dep.filterClosed": "Closed",
  "dep.filterAria": "Filter deposits",
  "dep.empty": "No deposits yet",
  "dep.emptyActive": "No active deposits found",
  "dep.emptyClosed": "No closed deposits found",
  "dep.emptyCta": "Open your first deposit",
  "dep.loadError":
    "Failed to read data — deploy/seed first and connect on the right network",
  "dep.historyEyebrow": "History — settled deposits",
  "dep.historyAria": "Settlement history",
  "dep.noActive": "No active deposits — your previous ones are below.",
  "dep.kind.maturity": "Withdrawn at maturity",
  "dep.kind.early": "Early withdrawal",
  "dep.kind.partial": "Partial withdrawal",
  "dep.kind.emergency": "Emergency withdrawal",
  "dep.kind.renewed": "Renewed",
  "dep.partialNote": "Partial withdrawal — deposit still active",
  "dep.renewedNote": "Renewed into deposit #{id}",
  "dep.closedAt": "Closed {date}",
  "dep.blockNote": "Block {n}",
  "dep.page": "My Deposits",

  "detail.back": "Back",
  "detail.eyebrow": "Deposit details",
  "detail.title": "Deposit",
  "detail.subApr": "Interest accrues per second · APR locked at opening",
  "detail.subPenalty": "· penalty",
  "detail.subLocked": "(locked at opening — later plan changes don't affect it)",
  "detail.notOwner": "Only the NFT owner ({short}…) can act — you are using {you}…",
  "detail.boxPrincipal": "Principal",
  "detail.boxApr": "APR at opening (locked)",
  "detail.boxTenor": "Term",
  "detail.boxMaturity": "Maturity",
  "detail.boxInterestMatured": "Interest if held to maturity",
  "detail.boxInterestEst": "Projected interest at maturity",
  "detail.boxPenalty": "Early-exit penalty",
  "detail.penaltyApprox": "≈ {amount} USDC at the current principal",
  "detail.days": "{d} days",
  "detail.withdrawnOkTitle": "Withdrawal successful",
  "detail.withdrawnOkBody":
    "Deposit #{id} has settled — the NFT was burned and the funds (principal + interest / after penalty) are back in your wallet.",
  "detail.toDeposits": "Back to my deposits",
  "detail.toHome": "Back to home",
  "detail.notFoundTitle": "Deposit #{id} not found",
  "detail.notFoundBody":
    "The NFT may have been burned after withdrawal, or the link points to an ID that never existed on this network. Check the ID in your deposits list.",
  "detail.loadingAria": "Loading deposit #{id}",
  "detail.page": "Deposit details",

  "detail.arHeading": "Auto-renew",
  "ar.a": "On: when the deposit matures and the",
  "ar.b": "-day grace period ends, the app",
  "ar.c": "calls renew automatically",
  "ar.d": "for the full principal + compounded interest into the plan chosen below. A new NFT is minted — the page switches to the new deposit.",
  "ar.scheduled": "Scheduled:",
  "ar.planEyebrow": "Renewal plan",
  "ar.planHint":
    "Hover/select a plan to preview APR · term · early-exit penalty (default: current plan).",
  "ar.ready": "Eligible — the app will renew automatically now (runs once).",
  "ar.switchAria": "Auto-renew after the grace period",
  "ar.onTitle": "Enable auto-renew",
  "ar.on1": "When deposit #{id} matures and the",
  "ar.on2": "grace period ends, the app will",
  "ar.on3": "call renew automatically",
  "ar.on4":
    "for the full principal + compounded interest into the chosen plan. A new NFT is minted — the page switches to the new deposit.",
  "ar.onNote":
    "The app/tab must stay open (an off-chain automation service also runs in parallel when the node has a key).",
  "ar.onOk": "Enable auto-renew",
  "ar.offTitle": "Disable auto-renew",
  "ar.off1":
    "The deposit will no longer renew automatically after the grace period — you must",
  "ar.offStrong": "renew or withdraw manually",
  "ar.offOk": "Disable auto-renew",

  "og.a": "Past the grace period",
  "og.b":
    "(maturity + 3 days) — the system will call autoRenewDeposit: principal + compounded interest roll into a new term, APR",
  "og.c": "unchanged at",
  "og.d": ", term",
  "og.e": "days (locked at opening).",
  "detail.deferred1":
    "Deferred interest (the vault was short of USDC at withdrawal): it",
  "detail.deferred2": "owes you",
  "detail.deferredCta": "Claim {amount}",
  "detail.deferredTx": "Claim deferred interest",
  "detail.earlyWarn":
    "Early exit before maturity: forfeits all accrued interest plus a {penalty} penalty (≈ {amount} USDC) → you would receive",
  "detail.closedNote": "This deposit is closed —",
  "detail.closedStrong": "read-only mode",
  "detail.closedTail":
    "(the NFT was burned, no actions available). Figures above are a historical snapshot.",
  "detail.settleEyebrow": "Settlement result",
  "detail.settleAt": "Settled at",
  "detail.settleReceived": "Amount received",
  "detail.settleInterest": "Interest earned",
  "detail.settlePenalty": "Early-exit penalty (loss)",
  "detail.settleRenewed": "Renewed into new deposit",
  "detail.settleLink": "Deposit #{id} →",
  "detail.pauseNote":
    "The system is paused — writes are blocked. Emergency withdrawal unlocks in",
  "detail.pauseHours": "h.",

  "detail.actions": "Actions",
  "detail.opAmountLabel": "Amount (for Partial withdrawal / Top-up)",
  "detail.opPh": "e.g. 1000",
  "detail.topupNote":
    "Top-ups are not limited by the plan's min/max — only by the contract's MAX_PRINCIPAL.",
  "detail.renewPlanLabel": "Renewal plan",
  "detail.renewNote":
    "Renewal targets enabled plans only — otherwise the contract reverts (SC_PlanNotEnabled).",
  "detail.btnWithdrawFull": "Withdraw all (+{interest} interest)",
  "detail.txWithdrawFull": "Withdraw at maturity",
  "detail.earlyTitle": "Early withdrawal",
  "detail.earlyMsg":
    "Withdraw {principal} USDC before maturity ({days} days left): forfeits all accrued interest (−{interest}) plus a {penalty} penalty (≈ {approx} USDC).",
  "detail.earlyReceive": "You would receive: {amount} USDC.",
  "detail.earlyOk": "Confirm early withdrawal",
  "detail.btnEarly": "Early exit (−{penalty})",
  "detail.txEarly": "Early withdrawal",
  "detail.partialTitle": "Partial withdrawal",
  "detail.partialMsg":
    "Withdraw {amount} USDC from deposit #{id}. Interest on the withdrawn principal is prorated by time held; the rest keeps accruing until maturity.",
  "detail.partialOk": "Partial withdrawal",
  "detail.btnPartial": "Partial withdrawal",
  "detail.txPartial": "Partial withdrawal",
  "detail.topupTitle": "Top up deposit",
  "detail.topupMsg":
    "Add {amount} USDC to deposit #{id} — merged into the principal; interest keeps accruing on the new total until maturity (APR/term stay locked).",
  "detail.topupOk": "Top up",
  "detail.btnTopup": "Top up {amount}",
  "detail.txTopup": "Top up",
  "detail.approveTopupTitle":
    "Step 1: Approve — lets the contract draw USDC from your wallet on top-up. ERC-20 requires this before a top-up; needed once per amount.",
  "detail.btnApprove": "1. Approve ({amount} USDC)",
  "detail.topupApproveTitle": "USDC Approval Required",
  "detail.topupApproveMsg": "To top up {amount} USDC into deposit #{id}, you need to approve SavingCore to transfer this amount from your wallet. Would you like to approve via MetaMask now?",
  "detail.topupApproveOk": "Approve now",
  "detail.maturedNoTopup": "Deposit has matured — cannot top up, only withdraw or renew.",
  "detail.notMaturedRenew": "Deposit has not matured yet — renewal is only available after maturity.",
  "og.afterGrace": "maturity + {grace}",
  "detail.txApprove": "Approve USDC (top-up)",
  "detail.needAmount": "Enter an amount above",
  "detail.ltPrincipal": "Must be below the principal",
  "detail.renewTitle": "Renew (roll into a new term)",
  "detail.renew1": "Principal + compounded interest roll into a new term under",
  "detail.renewCurrent": "the current plan",
  "detail.renewTarget": "Plan #{id}",
  "detail.renewSpec": "— APR {apr}, {days}-day term, {penalty} early-exit penalty",
  "detail.renewTail": ". The NFT is marked as renewed (AutoRenewed).",
  "detail.renewOk": "Renew now",
  "detail.btnRenew": "Renew",
  "detail.txRenew": "Renew",
  "detail.renewHint":
    "Renew: roll the full principal + compounded interest into a new term under the chosen plan.",
  "detail.btnEmergencyLocked": "Emergency (locked)",
  "detail.emergencyLockTitle": "Requires the system to be paused for ≥ 7 days",
  "detail.emergencyTitle": "Emergency withdrawal",
  "detail.emergencyMsg":
    "Available after the system has been paused for ≥ 7 days: principal returned, no interest and no penalty.",
  "detail.emergencyOk": "Emergency withdraw",
  "detail.btnEmergency": "Emergency withdrawal",
  "detail.txEmergency": "Emergency withdrawal",
  "detail.waitingTx":
    "Waiting for transaction confirmation… (tx hash shown in the corner)",
  "detail.debugSummary": "Technical details (snapshot from the contract)",

  "toast.pendingSuffix": "— sending...",
  "toast.waitingMiner": "Waiting for miner confirmation...",
  "toast.reverted": "— transaction reverted",
  "toast.successSuffix": "— succeeded",
  "toast.failTail": "could not be completed",
  "toast.okBlock": "— OK (block {n})",
  "toast.explorer": "View on explorer ↗",
  "toast.closeAria": "Dismiss notification",

  "confirm.defaultTitle": "Confirm",
  "confirm.defaultOk": "Confirm",
  "confirm.defaultCancel": "Cancel",

  "status.active": "Active",
  "status.withdrawn": "Withdrawn",
  "status.renewed": "Renewed",
  "status.autoRenewed": "Auto-Renewed",
  "status.unknown": "Unknown",

  "ticker.perDay": "USDC/day",

  "skeleton.loading": "Loading data",

  "admin.eyebrow": "Vault operations",
  "admin.title": "Admin console",
  "admin.ownerLabel": "Vault owner:",
  "admin.copyTitle": "{addr} — click to copy",
  "admin.youAreOwner": "(you are the owner)",
  "admin.notOwner": "(not you — view only)",
  "admin.lockedNote":
    "Write operations are owner-only — the forms below are locked.",
  "admin.reading": "Reading vault state…",
  "admin.tileBalance": "Vault balance (actual)",
  "admin.tileOwed": "Committed interest owed",
  "admin.tileAvailable": "Available (withdrawable)",
  "admin.healthTitle": "Liquidity health",
  "admin.insolvent": "available < 0 — insolvent state",
  "admin.sysLabel": "System:",
  "admin.paused": "PAUSED",
  "admin.running": "RUNNING",
  "admin.unlockIn": "· emergency unlock in {h} h",
  "admin.btnUnpause": "Resume",
  "admin.btnPause": "Pause",
  "admin.txPause": "Pause system",
  "admin.txUnpause": "Resume system",
  "admin.plansEyebrow": "Plan management",
  "admin.plansTitle": "Plans",
  "admin.minShort": "min",
  "admin.maxShort": "max",
  "admin.penaltyShort": "penalty",
  "admin.newAprAria": "New APR for plan {id}",
  "admin.aprPh": "APR bps",
  "admin.btnUpdate": "Update",
  "admin.txUpdateApr": "Update APR",
  "admin.btnDisable": "Disable",
  "admin.btnEnable": "Enable",
  "admin.txDisable": "Disable plan",
  "admin.txEnable": "Enable plan",
  "admin.createTitle": "Create a new plan",
  "admin.fTenor": "Term (days)",
  "admin.fApr": "APR (bps)",
  "admin.fPenalty": "Early-exit penalty (bps)",
  "admin.fMin": "Minimum deposit (USDC)",
  "admin.fMax": "Maximum deposit (USDC)",
  "admin.btnCreate": "Create plan",
  "admin.txCreate": "Create plan",
  "admin.txMissingTenorApr": "Missing term/APR",
  "admin.fundTitle": "Vault funding / withdrawal",
  "admin.fundNote":
    "Funding: approve + fundVault (2 transactions). Withdrawal: the available portion only — never below the owed interest (solvency).",
  "admin.amountLabel": "USDC amount",
  "admin.amountPh": "e.g. 100000",
  "admin.btnFund": "Fund vault",
  "admin.txFund": "Fund vault",
  "admin.btnWithdraw": "Withdraw",
  "admin.txWithdraw": "Vault withdrawal (surplus)",
  "admin.txNoAmount": "Amount must be > 0",
  "admin.withdrawCap":
    "You can withdraw at most {amount} USDC (cannot exceed the available portion).",
  "admin.connectFirst": "Connect a wallet to view the admin page (the",
  "admin.connectFirstBtn": "“Connect Wallet”",
  "admin.connectFirst2": "button in the navbar).",
  "admin.vaultStatusAria": "Vault status",

  "gauge.reading": "Reading vault data",
  "gauge.empty": "Vault is empty — fund it (fundVault) to operate",
  "gauge.insolvent":
    "Insolvency risk — withdrawals/interest payments will revert (VM_Insolvent)",
  "gauge.healthy": "Healthy — can cover all committed principal and interest",
  "gauge.tight": "Liquidity tight — consider adding funds before large withdrawals",
  "gauge.thin": "Thin liquidity — approaching the VM_Insolvent threshold",
  "gauge.aria": "Vault liquidity health: {label}",
  "gauge.balance": "Balance (actual)",
  "gauge.owed": "Interest owed",
  "gauge.available": "Available",
  "gauge.note": "health = available ÷ balance. The vault holds",
  "gauge.noteStrong": "100% of the principal of active deposits",
  "gauge.note2":
    ". VM_Insolvent blocks all withdrawals/interest payments when available ≤ 0 — a red gauge means the vault lacks the buffer, not that funds are lost.",

  "countdown.done": "Matured",
  "countdown.expired": "Expired",
  "countdown.dh": "{d}d {h}h",
  "countdown.hm": "{h}h {m}m",
  "countdown.ms": "{m}m {s}s",
  "countdown.sec": "{s}s",

  "plans.error": "Failed to read plans — check the network and deployment",

  "err.amountInvalid": "Invalid amount",
  "err.decimals": "At most {n} decimal places",
  "err.userRejected": "You rejected the transaction in your wallet",
  "err.VM_ZeroAmount": "Amount must be > 0",
  "err.VM_ZeroAddress": "Invalid address (0x0)",
  "err.VM_InsufficientBalance":
    "The vault lacks USDC to pay interest — try again later",
  "err.VM_Insolvent":
    "This withdrawal would leave the vault short of committed funds for active deposits",
  "err.VM_NotSavingCore": "Only SavingCore may call this function",
  "err.SC_UnknownPlan": "Plan does not exist",
  "err.SC_PlanNotEnabled": "This plan is paused — cannot open/renew into it",
  "err.SC_InvalidPlan": "Invalid plan parameters",
  "err.SC_AmountOutOfRange": "Amount outside the plan's min/max range",
  "err.SC_DepositUnknown": "Deposit does not exist",
  "err.SC_DepositNotOwner": "You are not the owner of this deposit",
  "err.SC_DepositNotActive": "Deposit is closed (already withdrawn/renewed)",
  "err.SC_TooEarly":
    "Not matured yet — wait until maturity; if skipped, the system will auto-renew for you",
  "err.SC_TooLate":
    "Past the grace period — the system auto-renews automatically; manual withdrawal is disabled",
  "err.SC_InvalidTopUpAmount": "Invalid top-up amount",
  "err.SC_InvalidPartialAmount":
    "Invalid partial amount — must be below the total principal",
  "err.SC_MaxPrincipalExceeded": "Total principal exceeds the contract's MAX_PRINCIPAL",
  "err.SC_EmergencyLocked": "Paused for < 7 days — emergency withdrawal not unlocked yet",
  "err.SC_NothingPending": "No deferred interest to claim",
  "err.ERC20": "Token transfer failed — check the allowance",
};

const DICTS: Record<Lang, Record<TKey, string>> = { vi: VI, en: EN };

/* ───────────────── Runtime (dùng được cả ngoài React) ───────────────── */
let currentLang: Lang = (() => {
  try {
    const l = localStorage.getItem("lang");
    if (l === "vi" || l === "en") return l;
  } catch {
    /* SSR/private mode — dùng mặc định */
  }
  return "vi";
})();

export function getLang(): Lang {
  return currentLang;
}

export type TParams = Record<string, string | number | null | undefined>;

function interpolate(s: string, params?: TParams): string {
  if (!params) return s;
  let out = s;
  for (const [k, v] of Object.entries(params)) {
    out = out.replaceAll(`{${k}}`, v === null || v === undefined ? "" : String(v));
  }
  return out;
}

export function rawT(key: TKey, params?: TParams): string {
  const dict = DICTS[currentLang] ?? VI;
  return interpolate(dict[key] ?? VI[key] ?? key, params);
}

/* ───────────────────────────── React context ───────────────────────────── */
interface LangCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: TKey, params?: TParams) => string;
}

const Ctx = createContext<LangCtx>({ lang: currentLang, setLang: () => {}, t: rawT });

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(currentLang);

  const setLang = (l: Lang): void => {
    currentLang = l;
    try {
      localStorage.setItem("lang", l);
    } catch {
      /* ignore */
    }
    setLangState(l);
  };

  const value = useMemo<LangCtx>(
    () => ({ lang, setLang, t: (k, p) => rawT(k, p) }),
    [lang],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLang(): LangCtx {
  return useContext(Ctx);
}
