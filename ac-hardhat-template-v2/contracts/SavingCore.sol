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
/// @notice ToÃ n bá»™ nghiá»‡p vá»¥ tiáº¿t kiá»‡m: táº¡o plan, má»Ÿ/Ä‘Ã¡o háº¡n/rÃºt sá»›m/tÃ¡i tá»¥c
///         (manual + auto) deposit, vÃ  cáº¥p "giáº¥y chá»©ng nháº­n gá»­i tiáº¿t kiá»‡m" dáº¡ng ERC721.
/// @dev  - Há»– PRINCIPAL ngÆ°á»i dÃ¹ng náº±m á»Ÿ Ä‘Ã¢y (tÃ¡ch biá»‡t vá»›i pool lÃ£i cá»§a bank).
///       - LÃ£i LUÃ”N Ä‘Æ°á»£c tráº£ tá»« VaultManager, khÃ´ng bao giá» láº¥y tá»« principal
///         cá»§a ngÆ°á»i dÃ¹ng khÃ¡c (Rule #1 cá»§a Ä‘á»).
///       - APR + penalty Ä‘Æ°á»£c SNAPSHOT vÃ o tá»«ng deposit khi má»Ÿ â€” admin sá»­a
///         plan sau Ä‘Ã³ khÃ´ng áº£nh hÆ°á»Ÿng cÃ¡c deposit cÅ© (ADR-002).
///       - Auto-renew giá»¯ nguyÃªn APR gá»‘c (ADR-003) vÃ  cÃ¹ng tenor.
///       - Pause Ä‘á»c tá»« VaultManager duy nháº¥t (ADR: D2) â€” SavingCore giá»¯ modifier
///         whenSystemRunning; payInterest trong vault váº«n cháº£y Ä‘á»ƒ phá»¥c vá»¥ C1/C5.
contract SavingCore is ERC721, ERC721Enumerable, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• Errors â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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

    // â”€â”€ Bonus C1/C5 (P3) â”€â”€
    /// @notice claimPendingInterest khi khÃ´ng cÃ³ lÃ£i chá».
    error SC_NothingPending();
    /// @notice emergencyWithdraw khi há»‡ thá»‘ng KHÃ”NG pause.
    error SC_SystemNotPaused();
    /// @notice emergencyWithdraw khi pause chÆ°a Ä‘á»§ 7 ngÃ y (C5).
    error SC_EmergencyNotReady();

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• Types â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    /// @notice Sáº£n pháº©m tiáº¿t kiá»‡m cá»§a ngÃ¢n hÃ ng (rate/tenor/min/max/penalty).
    struct Plan {
        uint256 tenorDays;
        uint256 aprBps;
        uint256 minDeposit;
        uint256 maxDeposit; // 0 = khÃ´ng giá»›i háº¡n trÃªn
        uint256 earlyWithdrawPenaltyBps;
        bool enabled;
    }

    /// @notice Tráº¡ng thÃ¡i sá»‘ng cá»§a deposit (theo Ä‘á»).
    enum DepositStatus {
        Active,
        Withdrawn,
        ManualRenewed,
        AutoRenewed
    }

    /// @notice Ghi sá»• má»™t deposit. Giá»¯ nguyÃªn cÃ¡c trÆ°á»ng khi táº¥t toÃ¡n Ä‘á»ƒ
    ///         phá»¥c vá»¥ truy váº¿t lá»‹ch sá»­ (chá»‰ `status` Ä‘á»•i).
    struct DepositInfo {
        uint256 planId;
        uint256 principal; // sá»‘ principal cÃ²n á»Ÿ há»£p Ä‘á»“ng (C3 sáº½ giáº£m)
        uint256 principalSeconds; // Î£ principal Ã— sá»‘ giÃ¢y cÃ²n láº¡i (C3/C4 dÃ¹ng)
        uint256 startAt;
        uint256 maturityAt;
        uint256 aprBpsAtOpen; // SNAPSHOT â€” khÃ´ng Ä‘á»•i (ADR-002)
        uint256 penaltyBpsAtOpen; // SNAPSHOT â€” khÃ´ng Ä‘á»•i (ADR-002)
        uint256 tenorDays;
        DepositStatus status;
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• Events â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    // â”€â”€ Báº¯t buá»™c theo Ä‘á» (5 sá»± kiá»‡n) â”€â”€
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

    // â”€â”€ Bá»• sung phá»¥c vá»¥ frontend/indexer â”€â”€
    event PlanEnabled(uint256 indexed planId, bool enabled);
    event PenaltyCharged(uint256 indexed depositId, address indexed user, uint256 penalty);

    // â”€â”€ Bonus C1: lÃ£i bá»‹ trÃ¬ hoÃ£n khi vault thiáº¿u â”€â”€
    event InterestDeferred(uint256 indexed depositId, address indexed user, uint256 interest);
    event PendingInterestClaimed(address indexed user, uint256 amount);

    // â”€â”€ Bonus C4: top-up â”€â”€
    event DepositToppedUp(
        uint256 indexed depositId,
        address indexed user,
        uint256 amount,
        uint256 newPrincipal
    );

    // â”€â”€ Bonus C5: emergency withdraw â”€â”€
    event EmergencyWithdrawn(uint256 indexed depositId, address indexed user, uint256 principal);

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• Constants â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    // â”€â”€ Biáº¿n thá»ƒ cÃ¡ nhÃ¢n AT190234: A=4, B=3 â”€â”€
    /// @notice Sá»‘ giÃ¢y trong 1 "ngÃ y" (máº·c Ä‘á»‹nh 86400, test 1).
    uint256 public immutable DAY_SECONDS;
    /// @notice Grace period cá»§a auto-renew: (A mod 3) + 2 = 3 ngÃ y.
    uint256 public immutable GRACE_PERIOD;
    /// @notice C5: cho phÃ©p emergency withdraw khi pause liÃªn tá»¥c quÃ¡ 7 ngÃ y.
    uint256 public immutable EMERGENCY_DELAY;

    /// @notice Máº«u sá»‘ cÃ´ng thá»©c lÃ£i: 365 Ã— DAY_SECONDS.
    uint256 public immutable YEAR_SECONDS;

    /// @notice 10_000 bps = 100%.
    uint256 public constant BPS_DIVISOR = 10_000;
    /// @notice Giá»›i háº¡n principal tá»‘i Ä‘a cháº·n overflow phi thá»±c táº¿ (1 tá»· USDC).
    uint256 public constant MAX_PRINCIPAL = 1_000_000_000_000_000 * 1_000_000; // 1e15 USDC

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• Storage â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    /// @notice USDC mÃ´ phá»ng (6 decimals). Immutable â€” chá»‘ng "fake token".
    IERC20 public immutable token;
    /// @notice Kho lÃ£i cá»§a ngÃ¢n hÃ ng. Immutable â€” Ä‘Ã£ link á»Ÿ constructor.
    IVaultManager public immutable vault;

    /// @notice Id káº¿ tiáº¿p: báº¯t Ä‘áº§u tá»« 1 (id 0 khÃ´ng tá»“n táº¡i).
    uint256 public nextPlanId;
    /// @notice Id káº¿ tiáº¿p táº¡o deposit: báº¯t Ä‘áº§u tá»« 1.
    uint256 public nextDepositId;

    mapping(uint256 planId => Plan) private _plans;
    mapping(uint256 depositId => DepositInfo) private _deposits;

    /// @notice C1: lÃ£i Ná»¢ ngÆ°á»i dÃ¹ng chÆ°a nháº­n Ä‘Æ°á»£c (vault thiáº¿u táº¡i maturity).
    ///         Khoáº£n nÃ y VáºªN Ä‘Æ°á»£c tÃ­nh vÃ o `totalOwedInterest` â€” bank khÃ´ng thoÃ¡i thÃ¡c.
    mapping(address user => uint256 amount) public pendingInterestOf;

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• Modifiers â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    /// @notice Cháº·n má»i LUá»’NG NGÆ¯á»œI DÃ™NG khi há»‡ thá»‘ng Ä‘ang pause (D2/D3).
    ///         Admin ops khÃ´ng bá»‹ cháº·n (cÃ³ thá»ƒ sá»­a cáº¥u hÃ¬nh khi pause).
    modifier whenSystemRunning() {
        if (vault.isPaused()) revert SC_SystemPaused();
        _;
    }

    /// @notice Deposit pháº£i cÃ²n NFT Ä‘ang sá»‘ng vÃ  msg.sender Ä‘ang giá»¯ nÃ³ (D13).
    modifier onlyDepositOwner(uint256 depositId) {
        if (ownerOf(depositId) != msg.sender) revert SC_NotDepositOwner();
        _;
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• Constructor â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    /// @param _token USDC test (6 decimals).
    /// @param _vault VaultManager Ä‘Ã£ deploy trÆ°á»›c (link theo thá»© tá»± deploy).
    /// @param _daySeconds Sá»‘ giÃ¢y trong 1 "ngÃ y" (86400 cho mainnet, 1 cho test).
    constructor(address _token, address _vault, uint256 _daySeconds)
        ERC721("Bank Deposit Certificate", "DEP")
        Ownable(msg.sender)
    {
        if (_token == address(0) || _vault == address(0)) revert SC_InvalidPlan();
        if (_daySeconds == 0 || _daySeconds > 1 days) revert SC_InvalidPlan();

        token = IERC20(_token);
        vault = IVaultManager(_vault);
        DAY_SECONDS = _daySeconds;
        GRACE_PERIOD = 3 * _daySeconds;
        EMERGENCY_DELAY = 7 * _daySeconds;
        YEAR_SECONDS = 365 * _daySeconds;

        nextPlanId = 1;
        nextDepositId = 1;
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• Admin â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    /// @notice Admin táº¡o má»™t saving plan má»›i.
    /// @dev Plan Ä‘Æ°á»£c táº¡o á»Ÿ tráº¡ng thÃ¡i enabled = true; admin cÃ³ thá»ƒ `disablePlan`.
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

    /// @notice Sá»­a APR cá»§a plan. Chá»‰ áº£nh hÆ°á»Ÿng deposit Má»šI â€” cÃ¡c deposit cÅ©
    ///         giá»¯ nguyÃªn snapshot (ADR-002).
    function updatePlan(uint256 planId, uint256 newAprBps) external onlyOwner {
        if (!_planExists(planId)) revert SC_PlanUnknown();
        if (newAprBps == 0 || newAprBps > BPS_DIVISOR) revert SC_InvalidPlan();
        _plans[planId].aprBps = newAprBps;

        emit PlanUpdated(planId, newAprBps);
    }

    /// @notice Báº­t/láº­t tráº¡ng thÃ¡i nháº­n deposit má»›i.
    /// @dev KHÃ”NG áº£nh hÆ°á»Ÿng ability rÃºt/t Renew cá»§a cÃ¡c deposit Active (Q6).
    function setPlanEnabled(uint256 planId, bool state) external onlyOwner {
        if (!_planExists(planId)) revert SC_PlanUnknown();
        _plans[planId].enabled = state;

        emit PlanEnabled(planId, state);
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• Plant info â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    /// @notice Sá»‘ plan Ä‘Ã£ táº¡o.
    function planCount() external view returns (uint256) {
        return nextPlanId - 1;
    }

    /// @notice Sá»‘ deposit Ä‘Ã£ má»Ÿ (ká»ƒ cáº£ Ä‘Ã£ káº¿t thÃºc).
    function depositCount() external view returns (uint256) {
        return nextDepositId - 1;
    }

    /// @notice Äá»c plan, revert náº¿u id vÃ´ danh.
    function getPlan(uint256 planId) external view returns (Plan memory) {
        if (!_planExists(planId)) revert SC_PlanUnknown();
        return _plans[planId];
    }

    /// @notice Äá»c deposit, revert náº¿u id vÃ´ danh. Tráº£ vá» status hiá»‡n thá»i.
    function getDeposit(uint256 depositId) external view returns (DepositInfo memory) {
        if (!_depositExists(depositId)) revert SC_UnknownDeposit();
        return _deposits[depositId];
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• User flow 1: openDeposit â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    /// @notice User má»Ÿ deposit: chomp USDC â†’ SNAPSHOT APR/penalty â†’ mint NFT â†’ cam káº¿t lÃ£i vá»›i vault (C2).
    /// @dev CEI + nonReentrant: má»i effect sá»• trÆ°á»›c_TRANSFER; external call sau cÃ¹ng.
    ///      reentrancy qua token transfer hoáº·c NFT safeMint Ä‘á»u bá»‹ `nonReentrant` cháº·n.
    /// @return depositId id cá»§a deposit má»›i vá»«a má»Ÿ.
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

        // l_snapshot trÆ°á»›c khi Ä‘á»¥ng vÃ o state khÃ¡c (thá»­ nghÄ©a APR/penalty)
        uint256 openingApr = plan.aprBps;
        uint256 openingPenalty = plan.earlyWithdrawPenaltyBps;
        uint256 tenorDays = plan.tenorDays;

        depositId = _newDeposit(msg.sender, planId, amount, openingApr, openingPenalty, tenorDays);

        // C2: cam káº¿t lÃ£i vá»›i vault (tÃ­nh theo toÃ n bá»™ tenor â€” Æ°á»›c lÆ°á»£ng)
        uint256 owed = _computeInterestBySeconds(amount * tenorDays * DAY_SECONDS, openingApr);
        token.safeTransferFrom(msg.sender, address(this), amount);
        vault.increaseOwedInterest(owed);
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• User flow 2: withdrawAtMaturity â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    /// @notice User rÃºt principal + lÃ£i (lÃ£i tráº£ tá»« vault) khi Ä‘á»§ maturityAt.
    /// @dev C1: náº¿u VAULT KHÃ”NG Äá»¦ LÃƒI â†’ tráº£ principal Ä‘áº§y Ä‘á»§, lÃ£i chuyá»ƒn vÃ o
    ///      `pendingInterestOf` Ä‘á»ƒ user claim sau (T3.1) â€” bank váº«n Ná»¢ (khÃ´ng giáº£m
    ///      `totalOwedInterest` khi defer). Náº¿u Ä‘á»§ â†’ tráº£ lÃ£i + giáº£m owed (C2).
    ///      CEI: set status + burn NFT TRÆ¯á»šC khi gá»i external (cháº·n reentrancy + double withdraw).
    /// @return paidInterest sá»‘ lÃ£i user thá»±c nháº­n NGAY (0 náº¿u defer â€” D9).
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

        d.status = DepositStatus.Withdrawn; // CEI: khÃ³ Ä‘á»™ng state tá»« ngoÃ i
        _burn(depositId); // D1: certificate Ä‘Ã£ táº¥t toÃ¡n â†’ burn

        if (interest != 0) {
            if (vault.getVaultBalance() >= interest) {
                // â”€â”€ Path A: vault Ä‘á»§ â†’ tráº£ lÃ£i ngay, giáº£i ngÃ¢n cam káº¿t (C2) â”€â”€
                vault.payInterest(depositor, interest);
                vault.decreaseOwedInterest(interest);
                paidInterest = interest;
            } else {
                // â”€â”€ Path B (C1): vault thiáº¿u â†’ PRINCIPAL váº«n tráº£ Ä‘á»§;
                //    lÃ£i ghi ná»£ vÃ o pending, owed GIá»® NGUYÃŠN (bank cÃ²n ná»£ user)
                pendingInterestOf[depositor] += interest;
                emit InterestDeferred(depositId, depositor, interest);
            }
        }
        token.safeTransfer(depositor, principal);

        emit Withdrawn(depositId, depositor, principal, interest, false);
        return paidInterest;
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• Bonus C1: claim lÃ£i bá»‹ trÃ¬ hoÃ£n â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    /// @notice User claim lÃ£i Ná»¢ Ä‘Ã£ ghi nháº­n tá»« `InterestDeferred` (C1).
    /// @dev CEI: zero pending TRÆ¯á»šC external call â€” náº¿u transfer revert thÃ¬ pending
    ///      cÅ©ng rollback vá» giÃ¡ trá»‹ cÅ©. Vault pháº£i Ä‘á»§; náº¿u khÃ´ng, payInterest revert
    ///      `VM_InsufficientBalance` vÃ  pending giá»¯ nguyÃªn (user thá»­ láº¡i sau).
    ///      Bá»‹ pause cháº·n (D3 â€” un-pause rá»“i má»›i claim).
    function claimPendingInterest() external nonReentrant whenSystemRunning {
        uint256 amount = pendingInterestOf[msg.sender];
        if (amount == 0) revert SC_NothingPending();

        pendingInterestOf[msg.sender] = 0; // CEI: zero-before-transfer
        vault.payInterest(msg.sender, amount);
        vault.decreaseOwedInterest(amount); // C2: giáº£i ngÃ¢n cam káº¿t cuá»‘i cÃ¹ng

        emit PendingInterestClaimed(msg.sender, amount);
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• User flow 3: earlyWithdraw â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    /// @notice RÃºt sá»›m: KHÃ”NG cÃ³ lÃ£i, bá»‹ trá»« penalty â†’ penalty vá» feeReceiver.
    /// @dev Durations: status sau cÃ¹ng Withdrawn; penalty Ä‘Æ°á»£c chuyá»ƒn vÃ o vault rá»“i
    ///      VM forward cho feeReceiver. totalOwedInterest giáº£m FULL cÃ²n láº¡i (C2).
    /// @return refunded sá»‘ user nháº­n = principal - penalty.
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

        // principal gá»‘c á»Ÿ Ä‘Ã¢y Ä‘á»ƒ lÃ m lá»‹ch sá»­; theo spec event - interest = 0 vá»›i early
        emit Withdrawn(depositId, depositor, principal - penalty, 0, true);
        return (principal - penalty, penalty);
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• Bonus C3: partial early withdraw â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    /// @notice RÃºt Má»˜T PHáº¦N principal sá»›m: rÃºt `amount` (bá»‹ penalty trÃªn chÃ­nh amount),
    ///         pháº§n cÃ²n láº¡i GIá»® deposit Active vÃ  SINH LÃƒI ÄÃšNG nhÆ° cÅ© Ä‘áº¿n maturity.
    /// @dev D4 (weighted accrual): gá»¡ `amount Ã— (maturityAt - now)` khá»i `principalSeconds`
    ///      â€” NFT vÃ  status giá»¯ nguyÃªn (khÃ´ng burn). amount == principal â†’ pháº£i dÃ¹ng
    ///      `earlyWithdraw` (revert `SC_AmountTooHigh`).
    /// @return refunded = amount - penalty, penalty trÃªn chÃ­nh `amount`.
    function partialEarlyWithdraw(uint256 depositId, uint256 amount)
        external
        nonReentrant
        whenSystemRunning
        onlyDepositOwner(depositId)
        returns (uint256 refunded, uint256 penalty)
    {
        DepositInfo storage d = _deposits[depositId];
        if (d.status != DepositStatus.Active) revert SC_DepositNotActive();
        if (block.timestamp >= d.maturityAt) revert SC_TooLate();
        if (amount == 0) revert SC_AmountZero();
        if (amount >= d.principal) revert SC_AmountTooHigh(d.principal);

        uint256 remaining = d.maturityAt - block.timestamp;
        penalty = _earlyPenalty(amount, d.penaltyBpsAtOpen);
        // lÃ£i cÃ³ liÃªn quan chunk Ä‘ang bá» Ä‘i (weighted accrual, D4)
        uint256 owedOnChunk = _computeInterestBySeconds(amount * remaining, d.aprBpsAtOpen);

        d.principal -= amount;
        d.principalSeconds -= amount * remaining;

        vault.decreaseOwedInterest(owedOnChunk); // C2: chunk thu háº¹p â†’ cam káº¿t giáº£m Ä‘Ãºng

        token.safeTransfer(msg.sender, amount - penalty);
        if (penalty != 0) {
            token.safeTransfer(address(vault), penalty);
            vault.receivePenalty(penalty);
            emit PenaltyCharged(depositId, msg.sender, penalty);
        }

        refunded = amount - penalty;
        emit Withdrawn(depositId, msg.sender, refunded, 0, true);
        return (refunded, penalty);
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• Bonus C4: top-up â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    /// @notice Náº¡p thÃªm `amount` vÃ o deposit Active TRÆ¯á»šC maturity. LÃ£i cá»™ng dá»“n
    ///         theo weighted accrual (D4): `principalSeconds += amount Ã— (maturityAt - now)`.
    /// @dev owed tÄƒng Ä‘Ãºng lÃ£i chunk má»›i sáº½ sinh; plan min/max KHÃ”NG Ã¡p dá»¥ng top-up
    ///      (chá»‰ cáº­n MAX_PRINCIPAL chá»‘ng overflow). LÆ°u Ã½ cÅ©ng bá»‹ pause cháº·n (D3).
    function topUpDeposit(uint256 depositId, uint256 amount) external nonReentrant whenSystemRunning onlyDepositOwner(depositId) {
        DepositInfo storage d = _deposits[depositId];
        if (d.status != DepositStatus.Active) revert SC_DepositNotActive();
        if (block.timestamp >= d.maturityAt) revert SC_TooLate();
        if (amount == 0) revert SC_AmountZero();
        if (d.principal + amount > MAX_PRINCIPAL) revert SC_AmountTooLarge();

        uint256 remaining = d.maturityAt - block.timestamp;
        uint256 owedOnChunk = _computeInterestBySeconds(amount * remaining, d.aprBpsAtOpen);

        d.principal += amount;
        d.principalSeconds += amount * remaining;

        token.safeTransferFrom(msg.sender, address(this), amount);
        vault.increaseOwedInterest(owedOnChunk); // C2: chunk má»›i â†’ cam káº¿t tÄƒng Ä‘Ãºng

        emit DepositToppedUp(depositId, msg.sender, amount, d.principal);
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• Bonus C5: emergency withdraw â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    /// @notice KÃ©o tiá»n principal ra khi há»‡ thá»‘ng pause kÃ©o dÃ i â‰¥ 7 ngÃ y (EMERGENCY_DELAY).
    /// @dev LÃ€ Cá»¬A THOÃT DUY NHáº¤T khi paused (D3) â†’ KHÃ”NG dÃ¹ng `whenSystemRunning`,
    ///      ngÆ°á»£c láº¡i require Ä‘ang pause. Tráº£ CHá»ˆ principal (khÃ´ng lÃ£i, khÃ´ng penalty).
    ///      status â†’ Withdrawn + burn NFT + giáº£m owed FULL (C2).
    function emergencyWithdraw(uint256 depositId)
        external
        nonReentrant
        onlyDepositOwner(depositId)
        returns (uint256 principal_)
    {
        if (!vault.isPaused()) revert SC_SystemNotPaused();
        if (block.timestamp < vault.pausedAt() + EMERGENCY_DELAY) revert SC_EmergencyNotReady();

        DepositInfo storage d = _deposits[depositId];
        if (d.status != DepositStatus.Active) revert SC_DepositNotActive();

        address depositor = ownerOf(depositId);
        uint256 principal = d.principal;
        uint256 owedInterest = _computeInterestBySeconds(d.principalSeconds, d.aprBpsAtOpen);

        d.status = DepositStatus.Withdrawn;
        _burn(depositId);

        vault.decreaseOwedInterest(owedInterest); // C2: deposit biáº¿n máº¥t â†’ cam káº¿t xÃ³a
        token.safeTransfer(depositor, principal);

        emit EmergencyWithdrawn(depositId, depositor, principal);
        return principal;
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• User flow 4: renewDeposit (manual) â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    /// @notice TÃ¡i tá»¥c thá»§ cÃ´ng: lÃ£i cÅ© compound vÃ o principal, má»Ÿ báº±ng plan Má»šI (rate má»›i).
    /// @dev oldDeposit status â†’ ManualRenewed + burn NFT cÅ©; deposit má»›i mint NFT.
    ///      Khoan: trong renew, lÃ£i chuyá»ƒn vault â†’ SC (chá»©a principal pool) â€”
    ///      do Ä‘Ã³ mint/payInterest tá»« vault sang SC contract address (msg.sender cá»§a VM lÃ  SC).
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
        // â”€â”€â”€ láº¥y giÃ¡ trá»‹ vÃ o memory Ä‘á»ƒ khÃ´ng rÆ¡i vÃ´ ráº» khi mutate status â”€â”€â”€
        uint256 oldOwed = _computeInterestBySeconds(d.principalSeconds, d.aprBpsAtOpen);
        uint256 newPrincipal = d.principal + oldOwed;
        uint256 newApr = newPlan.aprBps;
        uint256 newPenalty = newPlan.earlyWithdrawPenaltyBps;
        uint256 newTenor = newPlan.tenorDays;
        uint256 newOwed = _computeInterestBySeconds(newPrincipal * newTenor * DAY_SECONDS, newApr);

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

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• User flow 5: autoRenewDeposit (bot) â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    /// @notice Bot (hoáº·c AI nÃ o) gá»i sau khi háº¿t grace period = maturityAt + 3 ngÃ y (biáº¿n thá»ƒ).
    /// @dev Rule #4 cá»§a Ä‘á»: lock Original APR + same tenor (khÃ´ng Ä‘á»•i theo plan).
    ///      Plan bá»‹ disable cÅ©ng ok â€” dÃ¹ng dá»¯ liá»‡u SNAPSHOT tá»« deposit (Q6,ADR).
    ///      ÄÃ³ lÃ  lÃ½ do khÃ´ng check plan.enabled.
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
        uint256 oldApr = d.aprBpsAtOpen; // lock nÄƒm nguyÃªn ADR-003
        uint256 oldOwed = _computeInterestBySeconds(d.principalSeconds, d.aprBpsAtOpen);
        uint256 newPrincipal = d.principal + oldOwed;
        uint256 newOwed = _computeInterestBySeconds(newPrincipal * d.tenorDays * DAY_SECONDS, oldApr);
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

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• Views â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    /// @notice LÃ£i Æ°á»›c tÃ­nh hiá»‡n táº¡i cá»§a má»™t deposit (rounding down, D9).
    function previewInterest(uint256 depositId) external view returns (uint256 interest) {
        if (!_depositExists(depositId)) revert SC_UnknownDeposit();
        DepositInfo storage d = _deposits[depositId];
        return _computeInterestBySeconds(d.principalSeconds, d.aprBpsAtOpen);
    }

    /// @notice Preview Ä‘á»§ thÃ´ng tin khi rÃºt/t Renew Ä‘á»ƒ frontend hiá»ƒn thá»‹.
    /// @return principal principal cÃ²n láº¡i, maturityAt thá»i Ä‘iá»ƒm Ä‘Ã¡o háº¡n,
    ///         interest lÃ£i náº¿u rÃºt á»Ÿ maturityAt (0 náº¿u chÆ°a), penalty lÃ£i sáº½ bá»‹ trá»« náº¿u rÃºt Early,
    ///         status tráº¡ng thÃ¡i hiá»‡n táº¡i.
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

    /// @notice ÄÃ£ qua grace period & chÆ°a autoRenew hay chÆ°a? Bot dÃ¹ng Ä‘á»ƒ quÃ©t.
    function canAutoRenew(uint256 depositId) external view returns (bool) {
        if (!_depositExists(depositId)) return false;
        DepositInfo storage d = _deposits[depositId];
        return d.status == DepositStatus.Active && block.timestamp >= d.maturityAt + GRACE_PERIOD;
    }

    /// @notice Deposit Active Ä‘Ã£ Ä‘áº¿n háº¡n (kÃ¨m chá»‰ thá»‹ hiá»ƒn thá»‹ cho frontend).
    function isMatured(uint256 depositId) external view returns (bool) {
        if (!_depositExists(depositId)) revert SC_UnknownDeposit();
        DepositInfo storage d = _deposits[depositId];
        return d.status == DepositStatus.Active && block.timestamp >= d.maturityAt;
    }

    /// @notice Danh sÃ¡ch CÃC deposit (NFT) ngÆ°á»i dÃ¹ng Ä‘ang sá»Ÿ há»¯u â€” dÃ¹ng ERC721Enumerable.
    /// @dev OZ v5 khÃ´ng cÃ³ `tokensOfOwner` â†’ tá»± quÃ©t `tokenOfOwnerByIndex`.
    ///      NFT bá»‹ burn khi deposit táº¥t toÃ¡n (D1) nÃªn káº¿t quáº£ chá»‰ chá»©a deposit "sá»‘ng".
    function getUserDepositIds(address user) external view returns (uint256[] memory ids) {
        uint256 count = balanceOf(user);
        ids = new uint256[](count);
        for (uint256 i = 0; i < count; ++i) {
            ids[i] = tokenOfOwnerByIndex(user, i);
        }
        return ids;
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• Internal helpers â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    function _computeInterestBySeconds(uint256 principalSeconds, uint256 aprBps)
        internal
        view
        returns (uint256)
    {
        // Q4/D9: multiply-before-divide giá»¯ precision; dust (< 1 unit) rÆ¡i vá» vault.
        unchecked {
            // Safe: MAX_PRINCIPAL cháº·n overflow (D10)
            return (principalSeconds * aprBps) / (YEAR_SECONDS * BPS_DIVISOR);
        }
    }

    function _earlyPenalty(uint256 principal, uint256 penaltyBps) internal pure returns (uint256) {
        if (penaltyBps == 0 || principal == 0) return 0;
        unchecked {
            return (principal * penaltyBps) / BPS_DIVISOR;
        }
    }

    /// @notice Äiá»u kiá»‡n tá»“n táº¡i cá»§a plan (báº¯t Ä‘áº§u tá»« 1).
    function _planExists(uint256 planId) internal view returns (bool) {
        return planId != 0 && planId < nextPlanId;
    }

    function _depositExists(uint256 depositId) internal view returns (bool) {
        return depositId != 0 && depositId < nextDepositId;
    }

    /// @notice Táº¡o DepositInfo vÃ  mint NFT (cÃ¡i nhÃ©: chÆ°a GHI cam káº¿t owe â€” caller tá»± tÃ­nh).
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
        d.principalSeconds = principal * tenorDays * DAY_SECONDS;
        d.startAt = block.timestamp;
        d.maturityAt = block.timestamp + tenorDays * DAY_SECONDS;
        d.aprBpsAtOpen = aprBps;
        d.penaltyBpsAtOpen = penaltyBps;
        d.tenorDays = tenorDays;
        d.status = DepositStatus.Active;

        _safeMint(depositor, depositId);

        emit DepositOpened(depositId, depositor, planId, principal, d.maturityAt, aprBps);
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• ERC721Enumerable plumbing (OZ v5) â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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

