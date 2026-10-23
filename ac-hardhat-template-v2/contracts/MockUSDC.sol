// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockUSDC
/// @notice Fake USDC dùng cho test/demo. Mô phỏng đúng độ chính xác thập phân 6
///         của USDC thật để phát hiện bug sai số sớm (đề bài yêu cầu).
/// @dev Ai cũng mint được — chỉ phục vụ môi trường test, không dùng token thật.
contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") {}

    /// @notice USDC thật dùng 6 decimals, KHÔNG phải 18.
    /// @return uint8 Số chữ số thập phân (luôn là 6).
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Mint công khai cho testing: faucet, user demo, deployer.
    /// @param to   Người nhận token.
    /// @param amount Số lượng ở đơn vị nhỏ nhất (1 USDC = 1_000_000 units).
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
