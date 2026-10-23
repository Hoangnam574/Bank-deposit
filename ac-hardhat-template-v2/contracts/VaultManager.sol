// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/// @title VaultManager
/// @notice Quản lý "kho tiền của ngân hàng": pool lãi suất, admin controls,
///         pause toàn hệ thống, fee nhận penalty.
/// @dev  - TÁCH BIỆT với principal của user (principal nằm trong SavingCore).
///       - C2 Solvency Guard: admin KHÔNG thể rút tiền đã cam kết trả lãi
///         (khoản chênh `totalOwedInterest`).
///       - Pause là NGUỒN SỰ THẬT DUY NHẤT của trạng thái dừng hệ thống:
///         SavingCore đọc `isPaused()`/`pausedAt()` từ đây (ADR: D2).
contract VaultManager is Ownable, Pausable {
    using SafeERC20 for IERC20;

    // ═══════════════════════════ Errors ═══════════════════════════

    /// @notice Truyền địa chỉ 0 khi construct/set.
    error VM_ZeroAddress();
    /// @notice Số lượng phải > 0 cho các thao tác tiền.
    error VM_ZeroAmount();
    /// @notice Không đủ token trong vault cho thao tác.
    error VM_InsufficientBalance();
    /// @notice C2: rút sẽ làm vault không đủ trả lãi đã cam kết.
    error VM_Insolvent();
    /// @notice Hàm chỉ SavingCore được gọi.
    error VM_NotSavingCore();
    /// @notice Contract không nhận ETH trực tiếp.
    error VM_EtherNotAccepted();

    // ═══════════════════════════ Storage ═══════════════════════════

    /// @notice Token mà vault nắm giữ (USDC 6 decimals). Immutable — không
    ///         thể fake token sau deploy (chống attack "fake token").
    IERC20 public immutable token;

    /// @notice Địa chỉ nhận penalty khi user rút sớm.
    address public feeReceiver;

    /// @notice Địa chỉ contract SavingCore (được set sau khi deploy vì vòng phụ thuộc).
    address public savingCore;

    /// @notice Thời điểm bắt đầu pause (block.timestamp khi pause; 0 khi unpaused).
    uint256 public pausedAt;

    /// @notice C2: tổng lãi đã cam kết cho các deposit đang "nợ" (Active,
    ///         deferred và pending). Admin không thể rút phần này.
    uint256 public totalOwedInterest;

    // ═══════════════════════════ Events ═══════════════════════════

    event VaultFunded(address indexed funder, uint256 amount);
    event VaultWithdrawn(address indexed to, uint256 amount);
    event InterestPaid(address indexed to, uint256 amount);
    event PenaltyForwarded(address indexed from, uint256 amount, address indexed feeReceiver);
    event FeeReceiverUpdated(address indexed newFeeReceiver);
    event SavingCoreUpdated(address indexed newSavingCore);
    event OwedInterestIncreased(uint256 amount, uint256 newTotal);
    event OwedInterestDecreased(uint256 amount, uint256 newTotal);

    // ═══════════════════════════ Modifiers ═══════════════════════════

    /// @notice Gated cho SavingCore — cần link bằng `setSavingCore` sau deploy.
    modifier onlySavingCore() {
        if (msg.sender != savingCore) revert VM_NotSavingCore();
        _;
    }

    // ═══════════════════════════ Constructor ═══════════════════════════

    /// @param _token Token lãi suất (USDC test, 6 decimals).
    /// @param _feeReceiver Địa chỉ nhận penalty rút sớm.
    constructor(address _token, address _feeReceiver) Ownable(msg.sender) {
        if (_token == address(0)) revert VM_ZeroAddress();
        if (_feeReceiver == address(0)) revert VM_ZeroAddress();
        token = IERC20(_token);
        feeReceiver = _feeReceiver;
    }

    /// @notice Chặn gửi ETH trực tiếp — mọi token phải đi qua ERC20 có track.
    receive() external payable {
        revert VM_EtherNotAccepted();
    }

    // ═══════════════════════════ Admin ═══════════════════════════

    /// @notice Link SavingCore sau khi deploy (deploy ordering: VM trước SC).
    ///         Đặt {_savingCore != address(0)} một lần, gọi lại được nếu
    ///         remediation cần (yêu cầu owner).
    function setSavingCore(address _savingCore) external onlyOwner {
        if (_savingCore == address(0)) revert VM_ZeroAddress();
        savingCore = _savingCore;
        emit SavingCoreUpdated(_savingCore);
    }

    /// @notice Thay đổi địa chỉ nhận penalty.
    function setFeeReceiver(address _feeReceiver) external onlyOwner {
        if (_feeReceiver == address(0)) revert VM_ZeroAddress();
        feeReceiver = _feeReceiver;
        emit FeeReceiverUpdated(_feeReceiver);
    }

    /// @notice Admin nạp token vào vault để trả lãi.
    /// @dev Caller phải approve vault trước.
    function fundVault(uint256 amount) external onlyOwner {
        if (amount == 0) revert VM_ZeroAmount();
        token.safeTransferFrom(msg.sender, address(this), amount);
        emit VaultFunded(msg.sender, amount);
    }

    /// @notice Admin rút phần dư của vault.
    /// @dev C2 Solvency Guard: số dư còn lại SAU khi rút phải >= totalOwedInterest,
    ///      không thể "drain" tiền đã cam kết trả lãi cho deposit Active.
    ///      Thứ tự check: balance trước, solvency sau (message lỗi tách bạch).
    function withdrawVault(uint256 amount) external onlyOwner {
        if (amount == 0) revert VM_ZeroAmount();
        uint256 bal = token.balanceOf(address(this));
        if (bal < amount) revert VM_InsufficientBalance();
        if (bal - amount < totalOwedInterest) revert VM_Insolvent();
        token.safeTransfer(msg.sender, amount);
        emit VaultWithdrawn(msg.sender, amount);
    }

    /// @notice Emergency stop toàn hệ thống. Ghi thời điểm để C5 đếm 7 ngày.
    function pause() external onlyOwner {
        _pause();
        pausedAt = block.timestamp;
    }

    /// @notice Bỏ pause. Reset `pausedAt` = 0 (C5 không còn tính tiếp).
    function unpause() external onlyOwner {
        _unpause();
        pausedAt = 0;
    }

    // ═══════════════════════ Called by SavingCore ═══════════════════════

    /// @notice Trả lãi cho user từ pool của bank.
    /// @dev KHÔNG có `whenNotPaused` — nếu chặn thì C1 (claim lãi chậm) & C5
    ///      (emergency) sẽ bế tắc; pause được SavingCore enforce ở tầng luồng (D2).
    function payInterest(address to, uint256 amount) external onlySavingCore {
        if (amount == 0) return; // lãi 0 (rounding) không phải lỗi
        if (token.balanceOf(address(this)) < amount) revert VM_InsufficientBalance();
        token.safeTransfer(to, amount);
        emit InterestPaid(to, amount);
    }

    /// @notice Tiếp nhận penalty từ SavingCore ( SavingCore đã chuyển token
    ///         cho vault) rồi forward ngay cho feeReceiver.
    /// @dev Sử dụng 2 transfer thay vì chuyển thẳng từ user để giữ Token In/Out
    ///      xuyên suốt SavingCore — dễ audit.
    function receivePenalty(uint256 amount) external onlySavingCore {
        if (amount == 0) return;
        if (token.balanceOf(address(this)) < amount) revert VM_InsufficientBalance();
        token.safeTransfer(feeReceiver, amount);
        emit PenaltyForwarded(msg.sender, amount, feeReceiver);
    }

    /// @notice C2: cam kết thêm `amount` lãi (mở/top-up deposit).
    function increaseOwedInterest(uint256 amount) external onlySavingCore {
        totalOwedInterest += amount;
        emit OwedInterestIncreased(amount, totalOwedInterest);
    }

    /// @notice C2: thả commit khi deposit tất toán/renew/claim. Clamp về 0
    ///         để không âm nếu có lệch số (defensive).
    function decreaseOwedInterest(uint256 amount) external onlySavingCore {
        totalOwedInterest = amount >= totalOwedInterest ? 0 : totalOwedInterest - amount;
        emit OwedInterestDecreased(amount, totalOwedInterest);
    }

    // ═══════════════════════════ Views ═══════════════════════════

    /// @notice Trạng thái pause — NGUỒN SỰ THẬT cho toàn hệ thống (D2).
    ///         SavingCore và frontend đọc từ đây, không giữ trạng thái riêng.
    function isPaused() external view returns (bool) {
        return paused();
    }

    /// @notice Số dư token vault.
    function getVaultBalance() external view returns (uint256) {
        return token.balanceOf(address(this));
    }

    /// @notice Phần vault còn "free" = balance - totalOwedInterest (C2).
    function getAvailableBalance() external view returns (uint256) {
        uint256 bal = token.balanceOf(address(this));
        return bal > totalOwedInterest ? bal - totalOwedInterest : 0;
    }
}
