// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IVaultManager} from "./interfaces/IVaultManager.sol";

/// @title SavingCore
/// @notice Toàn bộ nghiệp vụ tiết kiệm: tạo plan, mở/đáo hạn/rút sớm/tái tục
///         (manual + auto) deposit, và cấp "giấy chứng nhận gửi tiết kiệm" dạng ERC721.
/// @dev  - HỖ PRINCIPAL người dùng nằm ở đây (tách biệt với pool lãi của bank).
///       - Lãi LUÔN được trả từ VaultManager, không bao giờ lấy từ principal
///         của người dùng khác (Rule #1 của đề).
///       - APR + penalty được SNAPSHOT vào từng deposit khi mở — admin sửa
///         plan sau đó không ảnh hưởng các deposit cũ (ADR-002).
///       - Auto-renew giữ nguyên APR gốc (ADR-003) và cùng tenor.
///       - Pause đọc từ VaultManager duy nhất (ADR: D2) — SavingCore giữ modifier
///         whenSystemRunning; payInterest trong vault vẫn chảy để phục vụ C1/C5.
contract SavingCore is ERC721, ERC721Enumerable, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ═══════════════════════════ Errors ═══════════════════════════

    error SC_PlanUnknown();
    error SC_InvalidPlan();
    error SC_PlanNotEnabled();
    error SC_AmountZero();
    error SC_AmountTooLow(uint256 minDeposit);
    error SC_AmountTooHigh(uint256 maxDeposit);
    error SC_AmountTooLarge();
    error SC_SystemPaused();
    error SC_NotDepositOwner();
    error SC_DepositNotActive();
    error SC_UnknownDeposit();
    error SC_TooEarly();
    error SC_TooLate();
    error SC_InvalidAmounts();

    // ═══════════════════════════ Types ═══════════════════════════

    /// @notice Sản phẩm tiết kiệm của ngân hàng (rate/tenor/min/max/penalty).
    struct Plan {
        uint256 tenorDays;
        uint256 aprBps;
        uint256 minDeposit;
        uint256 maxDeposit; // 0 = không giới hạn trên
        uint256 earlyWithdrawPenaltyBps;
        bool enabled;
    }

    /// @notice Trạng thái sống của deposit (theo đề).
    enum DepositStatus {
        Active,
        Withdrawn,
        ManualRenewed,
        AutoRenewed
    }

    /// @notice Ghi sổ một deposit. Giữ nguyên các trường khi tất toán để
    ///         phục vụ truy vết lịch sử (chỉ `status` đổi).
    struct DepositInfo {
        uint256 planId;
        uint256 principal; // số principal còn ở hợp đồng (C3 sẽ giảm)
        uint256 principalSeconds; // Σ principal × số giây còn lại (C3/C4 dùng)
        uint256 startAt;
        uint256 maturityAt;
        uint256 aprBpsAtOpen; // SNAPSHOT — không đổi (ADR-002)
        uint256 penaltyBpsAtOpen; // SNAPSHOT — không đổi (ADR-002)
        uint256 tenorDays;
        DepositStatus status;
    }

    // ═══════════════════════════ Events ═══════════════════════════

    // ── Bắt buộc theo đề (5 sự kiện) ──
    event PlanCreated(uint256 indexed planId, uint256 tenorDays, uint256 aprBps);
    event PlanUpdated(uint256 indexed planId, uint256 newAprBps);
    event DepositOpened(
        uint256 indexed depositId,
        address indexed owner,
        uint256 planId,
        uint256 principal,
        uint256 maturityAt,
        uint256 aprBpsAtOpen
    );
    event Withdrawn(
        uint256 indexed depositId,
        address indexed owner,
        uint256 principal,
        uint256 interest,
        bool isEarly
    );
    event Renewed(
        uint256 indexed oldDepositId,
        uint256 indexed newDepositId,
        uint256 newPrincipal,
        uint256 newPlanId
    );

    // ── Bổ sung phục vụ frontend/indexer ──
    event PlanEnabled(uint256 indexed planId, bool enabled);
    event PenaltyCharged(uint256 indexed depositId, address indexed user, uint256 penalty);

    // ═══════════════════════════ Constants ═══════════════════════════

    // ── Biến thể cá nhân AT190234: A=4, B=3 ──
    /// @notice Grace period của auto-renew: (A mod 3) + 2 = 3 ngày.
    uint256 public constant GRACE_PERIOD = 3 days;
    /// @notice C5: cho phép emergency withdraw khi pause liên tục quá 7 ngày.
    uint256 public constant EMERGENCY_DELAY = 7 days;

    /// @notice Mẫu số công thức lãi: 365 × 24 × 3600 giây.
    uint256 public constant YEAR_SECONDS = 365 days;
    /// @notice 10_000 bps = 100%.
    uint256 public constant BPS_DIVISOR = 10_000;
    /// @notice Giới hạn principal tối đa chặn overflow phi thực tế (1 tỷ USDC).
    uint256 public constant MAX_PRINCIPAL = 1_000_000_000_000_000 * 1_000_000; // 1e15 USDC

    uint256 private constant _DAY = 1 days;

    // ═══════════════════════════ Storage ═══════════════════════════

    /// @notice USDC mô phỏng (6 decimals). Immutable — chống "fake token".
    IERC20 public immutable token;
    /// @notice Kho lãi của ngân hàng. Immutable — đã link ở constructor.
    IVaultManager public immutable vault;

    /// @notice Id kế tiếp: bắt đầu từ 1 (id 0 không tồn tại).
    uint256 public nextPlanId;
    /// @notice Id kế tiếp tạo deposit: bắt đầu từ 1.
    uint256 public nextDepositId;

    mapping(uint256 planId => Plan) private _plans;
    mapping(uint256 depositId => DepositInfo) private _deposits;

    // ═══════════════════════════ Modifiers ═══════════════════════════

    /// @notice Chặn mọi LUỒNG NGƯỜI DÙNG khi hệ thống đang pause (D2/D3).
    ///         Admin ops không bị chặn (có thể sửa cấu hình khi pause).
    modifier whenSystemRunning() {
        if (vault.isPaused()) revert SC_SystemPaused();
        _;
    }

    /// @notice Deposit phải còn NFT đang sống và msg.sender đang giữ nó (D13).
    modifier onlyDepositOwner(uint256 depositId) {
        if (ownerOf(depositId) != msg.sender) revert SC_NotDepositOwner();
        _;
    }

    // ═══════════════════════════ Constructor ═══════════════════════════

    /// @param _token USDC test (6 decimals).
    /// @param _vault VaultManager đã deploy trước (link theo thứ tự deploy).
    constructor(address _token, address _vault)
        ERC721("Bank Deposit Certificate", "DEP")
        Ownable(msg.sender)
    {
        if (_token == address(0) || _vault == address(0)) revert SC_InvalidPlan();
        token = IERC20(_token);
        vault = IVaultManager(_vault);
        nextPlanId = 1;
        nextDepositId = 1;
    }

    // ═══════════════════════════ Admin ═══════════════════════════

    /// @notice Admin tạo một saving plan mới.
    /// @dev Plan được tạo ở trạng thái enabled = true; admin có thể `disablePlan`.
    function createPlan(
        uint256 tenorDays,
        uint256 aprBps,
        uint256 minDeposit,
        uint256 maxDeposit,
        uint256 earlyWithdrawPenaltyBps
    ) external onlyOwner {
        if (tenorDays == 0) revert SC_InvalidPlan();
        if (aprBps == 0 || aprBps > BPS_DIVISOR) revert SC_InvalidPlan();
        if (earlyWithdrawPenaltyBps > BPS_DIVISOR) revert SC_InvalidPlan();
        if (maxDeposit != 0 && minDeposit > maxDeposit) revert SC_InvalidPlan();

        uint256 planId = nextPlanId++;
        _plans[planId] = Plan({
            tenorDays: tenorDays,
            aprBps: aprBps,
            minDeposit: minDeposit,
            maxDeposit: maxDeposit,
            earlyWithdrawPenaltyBps: earlyWithdrawPenaltyBps,
            enabled: true
        });

        emit PlanCreated(planId, tenorDays, aprBps);
    }

    /// @notice Sửa APR của plan. Chỉ ảnh hưởng deposit MỚI — các deposit cũ
    ///         giữ nguyên snapshot (ADR-002).
    function updatePlan(uint256 planId, uint256 newAprBps) external onlyOwner {
        if (!_planExists(planId)) revert SC_PlanUnknown();
        if (newAprBps == 0 || newAprBps > BPS_DIVISOR) revert SC_InvalidPlan();
        _plans[planId].aprBps = newAprBps;

        emit PlanUpdated(planId, newAprBps);
    }

    /// @notice Bật/lật trạng thái nhận deposit mới.
    /// @dev KHÔNG ảnh hưởng ability rút/t Renew của các deposit Active (Q6).
    function setPlanEnabled(uint256 planId, bool state) external onlyOwner {
        if (!_planExists(planId)) revert SC_PlanUnknown();
        _plans[planId].enabled = state;

        emit PlanEnabled(planId, state);
    }

    // ═══════════════════════════ Plant info ═══════════════════════════

    /// @notice Số plan đã tạo.
    function planCount() external view returns (uint256) {
        return nextPlanId - 1;
    }

    /// @notice Số deposit đã mở (kể cả đã kết thúc).
    function depositCount() external view returns (uint256) {
        return nextDepositId - 1;
    }

    /// @notice Đọc plan, revert nếu id vô danh.
    function getPlan(uint256 planId) external view returns (Plan memory) {
        if (!_planExists(planId)) revert SC_PlanUnknown();
        return _plans[planId];
    }

    /// @notice Đọc deposit, revert nếu id vô danh. Trả về status hiện thời.
    function getDeposit(uint256 depositId) external view returns (DepositInfo memory) {
        if (!_depositExists(depositId)) revert SC_UnknownDeposit();
        return _deposits[depositId];
    }

    // ═══════════════════════════ User flow 1: openDeposit ═══════════════════════════

    /// @notice User mở deposit: chomp USDC → SNAPSHOT APR/penalty → mint NFT → cam kết lãi với vault (C2).
    /// @dev CEI + nonReentrant: mọi effect sổ trước_TRANSFER; external call sau cùng.
    ///      reentrancy qua token transfer hoặc NFT safeMint đều bị `nonReentrant` chặn.
    /// @return depositId id của deposit mới vừa mở.
    function openDeposit(uint256 planId, uint256 amount)
        external
        nonReentrant
        whenSystemRunning
        returns (uint256 depositId)
    {
        if (!_planExists(planId)) revert SC_PlanUnknown();
        Plan storage plan = _plans[planId];
        if (amount == 0) revert SC_AmountZero();
        if (!plan.enabled) revert SC_PlanNotEnabled();
        if (amount < plan.minDeposit) revert SC_AmountTooLow(plan.minDeposit);
        if (plan.maxDeposit != 0 && amount > plan.maxDeposit) revert SC_AmountTooHigh(plan.maxDeposit);
        if (amount > MAX_PRINCIPAL) revert SC_AmountTooLarge();

        // l_snapshot trước khi đụng vào state khác (thử nghĩa APR/penalty)
        uint256 openingApr = plan.aprBps;
        uint256 openingPenalty = plan.earlyWithdrawPenaltyBps;
        uint256 tenorDays = plan.tenorDays;

        depositId = _newDeposit(msg.sender, planId, amount, openingApr, openingPenalty, tenorDays);

        // C2: cam kết lãi với vault (tính theo toàn bộ tenor — ước lượng)
        uint256 owed = _computeInterestBySeconds(amount * tenorDays * _DAY, openingApr);
        token.safeTransferFrom(msg.sender, address(this), amount);
        vault.increaseOwedInterest(owed);
    }

    // ═══════════════════════════ User flow 2: withdrawAtMaturity ═══════════════════════════

    /// @notice User rút principal + lãi (lãi trả từ vault) khi đủ maturityAt.
    /// @dev Rule "#vault không đủ → revert" (base spec). C1 ở P3 sẽ đổi thành defer.
    ///      CEI: set status + burn NFT TRƯỚC khi gọi external (chặn reentrancy + double withdraw).
    /// @return paidInterest số lãi user thực nhận (rounding down — D9).
    function withdrawAtMaturity(uint256 depositId)
        external
        nonReentrant
        whenSystemRunning
        onlyDepositOwner(depositId)
        returns (uint256 paidInterest)
    {
        DepositInfo storage d = _deposits[depositId];
        if (d.status != DepositStatus.Active) revert SC_DepositNotActive();
        if (block.timestamp < d.maturityAt) revert SC_TooEarly();

        address depositor = ownerOf(depositId);
        uint256 principal = d.principal;
        uint256 interest = _computeInterestBySeconds(d.principalSeconds, d.aprBpsAtOpen);

        d.status = DepositStatus.Withdrawn; // CEI: khó động state từ ngoài
        _burn(depositId); // D1: certificate đã tất toán → burn

        if (interest != 0) {
            // l_base base: vaultiếu lãi → revert (lỗi surface từ VM_InsufficientBalance)
            vault.payInterest(depositor, interest);
        }
        vault.decreaseOwedInterest(interest); // C2: giải ngân cam kết lãi
        token.safeTransfer(depositor, principal);

        emit Withdrawn(depositId, depositor, principal, interest, false);
        return interest;
    }

    // ═══════════════════════════ User flow 3: earlyWithdraw ═══════════════════════════

    /// @notice Rút sớm: KHÔNG có lãi, bị trừ penalty → penalty về feeReceiver.
    /// @dev Durations: status sau cùng Withdrawn; penalty được chuyển vào vault rồi
    ///      VM forward cho feeReceiver. totalOwedInterest giảm FULL còn lại (C2).
    /// @return refunded số user nhận = principal - penalty.
    function earlyWithdraw(uint256 depositId)
        external
        nonReentrant
        whenSystemRunning
        onlyDepositOwner(depositId)
        returns (uint256 refunded, uint256 penalty)
    {
        DepositInfo storage d = _deposits[depositId];
        if (d.status != DepositStatus.Active) revert SC_DepositNotActive();
        if (block.timestamp >= d.maturityAt) revert SC_TooLate();

        address depositor = ownerOf(depositId);
        uint256 principal = d.principal;
        uint256 owedInterest = _computeInterestBySeconds(d.principalSeconds, d.aprBpsAtOpen);

        d.status = DepositStatus.Withdrawn;
        _burn(depositId);

        vault.decreaseOwedInterest(owedInterest);

        penalty = _earlyPenalty(principal, d.penaltyBpsAtOpen);
        token.safeTransfer(depositor, principal - penalty);
        if (penalty != 0) {
            token.safeTransfer(address(vault), penalty);
            vault.receivePenalty(penalty);
            emit PenaltyCharged(depositId, depositor, penalty);
        }

        // principal gốc ở đây để làm lịch sử; theo spec event - interest = 0 với early
        emit Withdrawn(depositId, depositor, principal - penalty, 0, true);
        return (principal - penalty, penalty);
    }

    // ═══════════════════════════ User flow 4: renewDeposit (manual) ═══════════════════════════

    /// @notice Tái tục thủ công: lãi cũ compound vào principal, mở bằng plan MỚI (rate mới).
    /// @dev oldDeposit status → ManualRenewed + burn NFT cũ; deposit mới mint NFT.
    ///      Khoan: trong renew, lãi chuyển vault → SC (chứa principal pool) —
    ///      do đó mint/payInterest từ vault sang SC contract address (msg.sender của VM là SC).
    function renewDeposit(uint256 depositId, uint256 newPlanId)
        external
        nonReentrant
        whenSystemRunning
        onlyDepositOwner(depositId)
        returns (uint256 newDepositId)
    {
        DepositInfo storage d = _deposits[depositId];
        if (d.status != DepositStatus.Active) revert SC_DepositNotActive();
        if (block.timestamp < d.maturityAt) revert SC_TooEarly();
        if (!_planExists(newPlanId)) revert SC_PlanUnknown();
        Plan storage newPlan = _plans[newPlanId];
        if (!newPlan.enabled) revert SC_PlanNotEnabled();

        address depositor = ownerOf(depositId);
        // ─── lấy giá trị vào memory để không rơi vô rẻ khi mutate status ───
        uint256 oldOwed = _computeInterestBySeconds(d.principalSeconds, d.aprBpsAtOpen);
        uint256 newPrincipal = d.principal + oldOwed;
        uint256 newApr = newPlan.aprBps;
        uint256 newPenalty = newPlan.earlyWithdrawPenaltyBps;
        uint256 newTenor = newPlan.tenorDays;
        uint256 newOwed = _computeInterestBySeconds(newPrincipal * newTenor * _DAY, newApr);

        d.status = DepositStatus.ManualRenewed; // old NULL-status
        _burn(depositId);

        newDepositId = _newDeposit(depositor, newPlanId, newPrincipal, newApr, newPenalty, newTenor);

        if (newOwed != 0 && newApr != 0) {
            if (oldOwed != 0) vault.payInterest(address(this), oldOwed);
        }
        vault.decreaseOwedInterest(oldOwed);
        vault.increaseOwedInterest(newOwed);

        emit Renewed(depositId, newDepositId, newPrincipal, newPlanId);
        return newDepositId;
    }

    // ═══════════════════════════ User flow 5: autoRenewDeposit (bot) ═══════════════════════════

    /// @notice Bot (hoặc AI nào) gọi sau khi hết grace period = maturityAt + 3 ngày (biến thể).
    /// @dev Rule #4 của đề: lock Original APR + same tenor (không đổi theo plan).
    ///      Plan bị disable cũng ok — dùng dữ liệu SNAPSHOT từ deposit (Q6,ADR).
    ///      Đó là lý do không check plan.enabled.
    function autoRenewDeposit(uint256 depositId)
        external
        nonReentrant
        whenSystemRunning
        returns (uint256 newDepositId)
    {
        DepositInfo storage d = _deposits[depositId];
        if (d.status != DepositStatus.Active) revert SC_DepositNotActive();
        if (block.timestamp < d.maturityAt + GRACE_PERIOD) revert SC_TooLate();

        address depositor = ownerOf(depositId);
        uint256 oldApr = d.aprBpsAtOpen; // lock năm nguyên ADR-003
        uint256 oldOwed = _computeInterestBySeconds(d.principalSeconds, d.aprBpsAtOpen);
        uint256 newPrincipal = d.principal + oldOwed;
        uint256 newOwed = _computeInterestBySeconds(newPrincipal * d.tenorDays * _DAY, oldApr);
        uint256 newPenalty = d.penaltyBpsAtOpen;
        uint256 planIdOld = d.planId;
        uint256 tenorDaysOld = d.tenorDays;

        d.status = DepositStatus.AutoRenewed;
        _burn(depositId);

        newDepositId = _newDeposit(depositor, planIdOld, newPrincipal, oldApr, newPenalty, tenorDaysOld);

        if (oldOwed != 0) vault.payInterest(address(this), oldOwed);
        vault.decreaseOwedInterest(oldOwed);
        vault.increaseOwedInterest(newOwed);

        emit Renewed(depositId, newDepositId, newPrincipal, planIdOld);
    }

    // ═══════════════════════════ Views ═══════════════════════════

    /// @notice Lãi ước tính hiện tại của một deposit (rounding down, D9).
    function previewInterest(uint256 depositId) external view returns (uint256 interest) {
        if (!_depositExists(depositId)) revert SC_UnknownDeposit();
        DepositInfo storage d = _deposits[depositId];
        return _computeInterestBySeconds(d.principalSeconds, d.aprBpsAtOpen);
    }

    /// @notice Preview đủ thông tin khi rút/t Renew để frontend hiển thị.
    /// @return principal principal còn lại, maturityAt thời điểm đáo hạn,
    ///         interest lãi nếu rút ở maturityAt (0 nếu chưa), penalty lãi sẽ bị trừ nếu rút Early,
    ///         status trạng thái hiện tại.
    function previewExit(uint256 depositId)
        external
        view
        returns (
            uint256 principal,
            uint256 interest,
            uint256 penalty,
            uint256 amountIfEarly,
            uint256 maturityAt,
            DepositStatus status
        )
    {
        if (!_depositExists(depositId)) revert SC_UnknownDeposit();
        DepositInfo storage d = _deposits[depositId];
        principal = d.principal;
        maturityAt = d.maturityAt;
        status = d.status;
        interest = _computeInterestBySeconds(d.principalSeconds, d.aprBpsAtOpen);
        penalty = _earlyPenalty(d.principal, d.penaltyBpsAtOpen);
        amountIfEarly = d.principal - penalty;
    }

    /// @notice Đã qua grace period & chưa autoRenew hay chưa? Bot dùng để quét.
    function canAutoRenew(uint256 depositId) external view returns (bool) {
        if (!_depositExists(depositId)) return false;
        DepositInfo storage d = _deposits[depositId];
        return d.status == DepositStatus.Active && block.timestamp >= d.maturityAt + GRACE_PERIOD;
    }

    // ═══════════════════════════ Internal helpers ═══════════════════════════

    function _computeInterestBySeconds(uint256 principalSeconds, uint256 aprBps)
        internal
        pure
        returns (uint256)
    {
        // ─]]);
        //	Q4/D9: multiply-before-divide giữ precision; dust (< 1 unit) rơi về vault.
        // ──]]);
        unchecked {
            // Safe: MAX_PRINCIPAL chặn overflow (D10)
            return (principalSeconds * aprBps) / (YEAR_SECONDS * BPS_DIVISOR);
        }
    }

    function _earlyPenalty(uint256 principal, uint256 penaltyBps) internal pure returns (uint256) {
        if (penaltyBps == 0 || principal == 0) return 0;
        unchecked {
            return (principal * penaltyBps) / BPS_DIVISOR;
        }
    }

    /// @notice Điều kiện tồn tại của plan (bắt đầu từ 1).
    function _planExists(uint256 planId) internal view returns (bool) {
        return planId != 0 && planId < nextPlanId;
    }

    function _depositExists(uint256 depositId) internal view returns (bool) {
        return depositId != 0 && depositId < nextDepositId;
    }

    /// @notice Tạo DepositInfo và mint NFT (cái nhé: chưa GHI cam kết owe — caller tự tính).
    function _newDeposit(
        address depositor,
        uint256 planId,
        uint256 principal,
        uint256 aprBps,
        uint256 penaltyBps,
        uint256 tenorDays
    ) internal returns (uint256 depositId) {
        depositId = nextDepositId++;
        DepositInfo storage d = _deposits[depositId];
        d.planId = planId;
        d.principal = principal;
        d.principalSeconds = principal * tenorDays * _DAY;
        d.startAt = block.timestamp;
        d.maturityAt = block.timestamp + tenorDays * _DAY;
        d.aprBpsAtOpen = aprBps;
        d.penaltyBpsAtOpen = penaltyBps;
        d.tenorDays = tenorDays;
        d.status = DepositStatus.Active;

        _safeMint(depositor, depositId);

        emit DepositOpened(depositId, depositor, planId, principal, d.maturityAt, aprBps);
    }

    // ═══════════════════════════ ERC721Enumerable plumbing (OZ v5) ═══════════════════════════

    function _update(address to, uint256 tokenId, address auth)
        internal
        override(ERC721, ERC721Enumerable)
        returns (address)
    {
        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(address account, uint128 amount)
        internal
        override(ERC721, ERC721Enumerable)
    {
        super._increaseBalance(account, amount);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721Enumerable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
