// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

// ════════════════════════════════════════════════════════════════════
//  MaliciousDepositor — hợp đồng tấn công dùng CHỈ cho Security.test.ts (T-A18).
//  Nhét hook NFT khi được mint certificate rồi TÁI NHẬP sc qua withdraw/early/
//  topUp NGAY TRONG lúc đó — `nonReentrant` phải chặn hết các luồng này.
// ════════════════════════════════════════════════════════════════════

/// @dev Diện mặt hẹp của SavingCore — tránh import vòng.
interface ISavingCoreAttack {
    function openDeposit(uint256 planId, uint256 amount) external returns (uint256);
    function withdrawAtMaturity(uint256 depositId) external returns (uint256);
    function earlyWithdraw(uint256 depositId) external returns (uint256, uint256);
    function topUpDeposit(uint256 depositId, uint256 amount) external;
    function depositCount() external view returns (uint256);
}
contract MaliciousDepositor is IERC721Receiver {
    enum Mode { None, TryWithdraw, TryEarly, TryTopUp }

    ISavingCoreAttack public immutable sc;
    IERC20 public immutable token;

    Mode public mode;
    /// @notice Số lượt TÁI VÀO THÀNH CÔNG — mong đợi: luôn = 0.
    uint256 public attackCount;
    uint256 public myDepositId;

    constructor(address _sc, address _token) {
        sc = ISavingCoreAttack(_sc);
        token = IERC20(_token);
    }

    function setMode(uint8 m) external {
        mode = Mode(m);
    }

    /// @notice Ngoài hoàn cảnh bình thường: deposit chính chủ.
    function openDeposit(uint256 planId, uint256 amount) external {
        token.approve(address(sc), amount);
        myDepositId = sc.openDeposit(planId, amount);
    }

    /// @notice Gọi withdraw NGƯỜI THƯỜNG (không reenter) — để chứng minh deposit vẫn lành.
    function normalWithdraw() external returns (uint256 paid) {
        return sc.withdrawAtMaturity(myDepositId);
    }

    /// @notice Hook được gọi vì _safeMint lần vào — đây là điểm tấn công.
    function onERC721Received(
        address, /* operator */
        address, /* from */
        uint256 tokenId,
        bytes calldata /* data */
    ) external returns (bytes4) {
        myDepositId = tokenId;
        Mode m = mode;
        if (m == Mode.None) return IERC721Receiver.onERC721Received.selector;
        if (m == Mode.TryWithdraw) {
            // deposit vẫn Active tuy đã _safeMint... nhưng REENTRANCY bị chặn
            try sc.withdrawAtMaturity(tokenId) {
                attackCount++;
            } catch {}
        } else if (m == Mode.TryEarly) {
            try sc.earlyWithdraw(tokenId) {
                attackCount++;
            } catch {}
        }
        mode = Mode.None;
        return IERC721Receiver.onERC721Received.selector;
    }
}
