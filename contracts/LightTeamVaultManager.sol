// SPDX-License-Identifier: LGPL-3.0
pragma solidity 0.8.17;

import "./XLT.sol";
import "../interfaces/IMinter.sol";
import "../interfaces/IVotingEscrow.sol";
import "../interfaces/IGombocController.sol";
import "../interfaces/IFeeDistributor.sol";
import "../interfaces/IGombocFeeDistributor.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { TransferHelper } from "light-lib/contracts/TransferHelper.sol";

interface IXlt {
    function mint(address account, uint256 amount) external;
    function burn(address account, uint256 amount) external;
}

interface ILightTeamVault {
    function claimTo(address to) external;
}

interface IExtendVotingEscrow is IVotingEscrow {
    function locked(address user) external returns (LockedBalance memory);
}

interface ILightGomboc {
    function minter() external returns (address);
    function ltToken() external returns (address);
    function controller() external returns (address);
    function votingEscrow() external returns (address);
    function claimableTokens(address addr) external returns (uint256);
}

contract LightTeamVaultManager is OwnableUpgradeable {
    address public lightTeamVault;
    address public feeDistributor;
    address public gombocFeeDistributor;
    address public stHopeGomboc; // this is both a Gomboc and a token 
    address public votingEscrow;

    address public xlt;
    address public token; // LT

    uint256 public mintableXlt; // amount of XLT can be minted by Manager
    uint256 public stHopeTotalClaimed;  // total claimed amount of stHOPE rewards 
    uint256 public stHopeWithdrew;   // the stHOPE had withrew
    uint256 public ltTotalClaimed;  // total claimed amount of LT rewards
    uint256 public ltRewardsWithdrew; // the LT amount had withrew , only for the partial of rewards
    uint256 public ltWithdrew; // the LT amount had withrew , only for the partial of unlocded
    uint256 constant public LOCK_TIME = 4 * 365 * 86400; // 4 years

    // if true, withdrawLT(to,amount) can by called by anyone
    // equivalent amount of XLT will be burn from "to"
    bool public canWithdrawByAnyone; 

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    receive() external payable {}

    function initialize(
        address _owner, // muitiSig
        address _lightTeamVault, 
        address _feeDistributor,
        address _gombocFeeDistributor,
        address _stHopeGomboc
    ) public initializer {
        require(_owner != address(0), "LightTeamVaultManager: invalid owner address");
        require(_lightTeamVault != address(0), "LightTeamVaultManager: invalid lightTeamVault address");
        require(_feeDistributor != address(0), "LightTeamVaultManager: invalid feeDistributor address");
        require(_gombocFeeDistributor != address(0), "LightTeamVaultManager: invalid gombocFeeDistributor address");
        require(_stHopeGomboc != address(0), "LightTeamVaultManager: invalid stHopeGomboc address");

        _transferOwnership(_owner);
        votingEscrow = ILightGomboc(_stHopeGomboc).votingEscrow();
        token = ILightGomboc(_stHopeGomboc).ltToken();
        stHopeGomboc = _stHopeGomboc;
    
        lightTeamVault = _lightTeamVault;
        feeDistributor = _feeDistributor;
        gombocFeeDistributor = _gombocFeeDistributor;
        
        IERC20 _xlt = new XLT(address(this));
        xlt = address(_xlt);
    }

    /***
     * @dev if set true, withdrawLT(to,amount) can by called by anyone
     */
    function setCanWithdrawByAnyone(bool _canWithdrawByAnyone) external onlyOwner {
        require(canWithdrawByAnyone != _canWithdrawByAnyone, "LightTeamVaultManager: wrong value to set");
        canWithdrawByAnyone = _canWithdrawByAnyone;
    }
    
    /***
     * @dev Claim unlocked LT token from LightTeamVault, then lock them to VoteEscrow for 4 years ,
     *      and record mintable XLT amount, it can be called every 24h by anyone
     * @return amount amount of locked
     */
    function claimUnlockedLTAndLockForVeLT() external returns (uint256) {
        uint256 balanceBefore = IERC20(token).balanceOf(address(this));
        ILightTeamVault(lightTeamVault).claimTo(address(this));
        uint256 claimAmount = IERC20(token).balanceOf(address(this)) - balanceBefore;
        require(claimAmount > 0, "LightTeamVaultManager: insufficient balance to lock");
        mintableXlt += claimAmount; 

        // lock LT to VoteEscrow,  must add Manager to whitelist of VoteEscrow first
        IExtendVotingEscrow _votingEscrow = IExtendVotingEscrow(votingEscrow);
        // approve for votingEscrow
        IERC20(token).approve(votingEscrow, claimAmount);

        uint256 endTime = block.timestamp + LOCK_TIME;
        if (_votingEscrow.locked(address(this)).amount == 0) {
            _votingEscrow.createLock(claimAmount, endTime, 0, 0, bytes(""));
        } else {
            _votingEscrow.increaseAmount(claimAmount, 0, 0, bytes(""));
            _votingEscrow.increaseUnlockTime(endTime);
        }

        return claimAmount;
    }

    /***
     * @dev Mint amount XLT to "to"
     * @param to Address of the receiver 
     * @param amount amount of XLT 
     */
    function mintXLT(address to, uint amount) external onlyOwner {
        require(mintableXlt >= amount, "LightTeamVaultManager: insufficient mintable amount");
        mintableXlt -= amount;
        IXlt(xlt).mint(to, amount);
    }

    /***
     * @dev Burn amount XLT from "from"
     * @param from Address of the holder 
     * @param amount amount of XLT 
     */
    function burnXLT(address from, uint amount) external onlyOwner {
        require(IERC20(xlt).balanceOf(from) >= amount, "LightTeamVaultManager: insufficient XLT to burn");
        IXlt(xlt).burn(from, amount);
    }

    /***
     * @dev When locked LT expired, withdraw it form VoteEscrow to Manager. can be called by anyone
     */
    function withdrawLTWhenExpired() external {
        IVotingEscrow(votingEscrow).withdraw();
    }

    /***
     * @dev When the lock expired, after claimed, it can be lock again
     * @param amount amount of LT to lock 
     * @param unlockTime end time to unlock , if the lock existed, unlockTime must be 0
     */
    function lockLT(uint amount, uint unlockTime) external onlyOwner {
        // lock LT to VoteEscrow,  must add Manager to whitelist of VoteEscrow first
        IExtendVotingEscrow _votingEscrow = IExtendVotingEscrow(votingEscrow);
        // approve for votingEscrow
        IERC20(token).approve(votingEscrow, amount);

        if (_votingEscrow.locked(address(this)).amount == 0) {
            _votingEscrow.createLock(amount, unlockTime, 0, 0, bytes(""));
        } else {
            require(unlockTime == 0, "LightTeamVaultManager: the lock existed, the unlockTime should be zero");
            _votingEscrow.increaseAmount(amount, 0, 0, bytes(""));
        }
    }

    /***
     * @dev Extend the unlock time
     * @param unlockTime  
     */
    function increaseUnlockTime(uint unlockTime) external onlyOwner {
        IVotingEscrow(votingEscrow).increaseUnlockTime(unlockTime);
    }

    /***
     * @dev  Allocate voting power for changing multiple pool weights
     * @param gombocAddress array of gombocAddress
     * @param userWeights array of userWeight
     */
    function voteForGombocsWeights(
        address[] calldata gombocAddresses, 
        uint256[] calldata userWeights
    ) external onlyOwner {
        require(gombocAddresses.length < 128, "LightTeamVaultManager: length must less than 128");
        require(gombocAddresses.length == userWeights.length, "LightTeamVaultManager: unmatched length");
        
        address _gombocController = ILightGomboc(stHopeGomboc).controller();
        IGombocController gombocController = IGombocController(_gombocController);
        for (uint i; i < gombocAddresses.length; ++i) {
            gombocController.voteForGombocWeights(gombocAddresses[i], userWeights[i]);
        }
    }

    /***
     * @dev  Claim the stHOPE from multi gombocs to Manager, it is the benefit from voting
     * @param gomboc address of gombocAddress
     * @return Amount amount of stHOPE claimed in the call
     */
    function claimFromGombocs(address[] calldata gombocAddresses) external {
        require(gombocAddresses.length < 32, "LightTeamVaultManager: length must less than 32");
        for (uint i; i < gombocAddresses.length; ++i) {
            require(gombocAddresses[i] != address(0), "LightTeamVaultManager: wrong gomboc address");
            uint256 fee = IGombocFeeDistributor(gombocFeeDistributor).claim(gombocAddresses[i], address(this));
            stHopeTotalClaimed += fee;
        }  
    }

    /***
     * @dev  Claim the stHOPE from feeDistributor to Manager
     * @return Amount amount of stHOPE claimed in the call
     */
    function claimFromFeeDistributor() external returns (uint256) {
        uint256 fee = IFeeDistributor(feeDistributor).claim(address(this));
        stHopeTotalClaimed += fee;
        return fee;
    }

    /***
     * @dev  Claim the LT to Manager, it is the benefit from hoding veLT
     * @return Amount of LT claimed in the call
     */
    function claimLT() external returns (uint256) {
        uint256 claimableTokens = ILightGomboc(stHopeGomboc).claimableTokens(address(this));
        require(claimableTokens > 0, "LightTeamVaultManager: insufficient rewards to claim");

        address _minter = ILightGomboc(stHopeGomboc).minter();
        uint256 balanceBefore = IERC20(token).balanceOf(address(this));
        IMinter(_minter).mint(stHopeGomboc);
        uint256 claimAmount = IERC20(token).balanceOf(address(this)) - balanceBefore;
        ltTotalClaimed += claimAmount;
        return claimAmount;
    }

    /***
     * @dev  withdraw LT that comes from rewarding, if "to" is address(0), it will be withdraw to msg.sender
     * @param to the address withrwaw to
     * @param amount the amount to withrwaw
     */
    function withdrawLTRewards(address to, uint amount) external onlyOwner {
        if (to == address(0)) to = msg.sender;
        require(amount <= ltTotalClaimed - ltRewardsWithdrew, "LightTeamVaultManager: insufficient rewards to Withraw");
        ltRewardsWithdrew += amount;
        TransferHelper.doTransferOut(token, to, amount);
    }

    /***
     * @dev  withdraw LT that unlocked, if "to" is address(0), it will be withdraw to msg.sender
     * @param to the address withrwaw to
     * @param amount the amount to withrwaw
     */
    function withdrawLT(address to, uint amount) external {
        require(msg.sender == owner() || canWithdrawByAnyone, "LightTeamVaultManager: caller is not the owner");
        uint256 remainingRewards = ltTotalClaimed - ltRewardsWithdrew;
        uint256 totalBalanceOf = IERC20(token).balanceOf(address(this));
        require(amount <= totalBalanceOf - remainingRewards, "LightTeamVaultManager: insufficient unlocked balances to Withraw");
        ltWithdrew += amount;
        if (to == address(0)) to = msg.sender;

        if (msg.sender != owner())
            require(msg.sender == to, "LightTeamVaultManager: invalid call");
    
        require(IERC20(xlt).balanceOf(to) >= amount, "LightTeamVaultManager: insufficient XLT to burn");
        IXlt(xlt).burn(to, amount);

        TransferHelper.doTransferOut(token, to, amount);     
    }

    /***
     * @dev  withdraw stHLPE that comes from rewarding, if "to" is address(0), it will be withdraw to msg.sender
     * @param to the address withrwaw to
     * @param amount the amount to withrwaw 
     */
    function withdrawStHOPE(address to, uint amount) external onlyOwner {
        if (to == address(0)) to = msg.sender;
        require(amount <= stHopeTotalClaimed - stHopeWithdrew, "LightTeamVaultManager: insufficient rewards to Withraw");
        stHopeWithdrew += amount;
        TransferHelper.doTransferOut(stHopeGomboc, to, amount);
    }

    /***
     * @dev  Perform with call
     * @param targets the address the transactions send to
     * @param data payload
     * @param values wei send with transaction
     * @return bytes bytes array of returned data
     */
    function perform(
        address[] calldata targets, 
        bytes[] calldata data,
        uint[] calldata values
    ) external payable onlyOwner returns (bytes[] memory) {
        require(targets.length == data.length, "target length != data length");
        require(targets.length == values.length, "target length != values length");

        bytes[] memory results = new bytes[](data.length);

        for (uint i; i < targets.length; i++) {
            results[i] = AddressUpgradeable.functionCallWithValue(targets[i], data[i], values[i]);
        }

        return results;
    }
}
