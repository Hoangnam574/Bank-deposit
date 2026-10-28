// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IVaultManager
/// @notice Diện mặt API mà SavingCore gọi trên VaultManager.
/// @dev Chỉ khai báo hàm SavingCore cần, giúp keeping loose coupling:
///      SavingCore không import source của VaultManager (tránh import vòng),
///      và có thể mock interface này khi test.
interface IVaultManager {
    // ─────────────────────────── Trạng thái ───────────────────────────

    /// @notice Có đang pause toàn hệ thống không (nguồn sự thật duy nhất: D2).
    function isPaused() external view returns (bool);

    /// @notice Thời điểm bắt đầu pause (0 = không pause). C5 dùng để tính 7 ngày.
    function pausedAt() external view returns (uint256);

    /// @notice Lãi tổng đang "nợ" các deposit Active (C2 — Solvency Guard).
    function totalOwedInterest() external view returns (uint256);

    /// @notice Số dư token hiện có trong vault.
    function getVaultBalance() external view returns (uint256);

    // ────────────────────── Chỉ SavingCore gọi được ────────────────────

    /// @notice Chuyển lãi từ vault cho `to`. Vault phải đủ (C1 sẽ check trước).
    function payInterest(address to, uint256 amount) external;

    /// @notice Tiếp nhận penalty do early-withdraw, forward cho feeReceiver.
    function receivePenalty(uint256 amount) external;

    /// @notice C2: tăng số lãi được cam kết khi mở/top-up deposit.
    function increaseOwedInterest(uint256 amount) external;

    /// @notice C2: giảm cam kết khi deposit tất toán/renew/claim.
    function decreaseOwedInterest(uint256 amount) external;
}
