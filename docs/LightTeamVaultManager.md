# LigthTeamVaultManager
abbre: Manager

first of all, Manager can claim the unlocked LT from LigthTeamValut per day,
within the claiming, Manager will lock the claimed LT to VotingEscrow for 4 years.
By the way, equivalent amount of mitable XLT will be recorded.
After claiming, Manager got the veLT,  so there is some benefits that Manager can claim.

benefit one: stHOPE, comes from protocol fee, Manager should interact with FeeDsitributor , and   GombocFeeDistributor if Manager had voted for some proposals 

benefit two: LT token, Manager should interact with Minter to claim LT token

see below for more details

## Function
```solidity
function claimUnlockedLTAndLockForVeLT() external returns (uint256)
```
Claim unlocked LT token from LightTeamVault, then lock them to VoteEscrow for 4 years ,
and record mintable XLT amount, it can be called every 24h by anyone

```solidity
function setCanWithdrawByAnyone(bool _canWithdrawByAnyone) external onlyOwner
```
if set true, withdrawLT(to,amount) can by called by anyone

```solidity
function mintXLT(address to, uint amount) external onlyOwner
```
Mint amount XLT to "to"

```solidity
function burnXLT(address from, uint amount) external onlyOwner 
```
Burn amount XLT from "from"

```solidity
function withdrawLTWhenExpired() external 
```
When locked LT expired, withdraw it form VoteEscrow to Manager.

```solidity
function lockLT(uint amount, uint unlockTime) external onlyOwner 
```
When the lock expired, after claimed, it can be lock again, 
if the lock already existed, unlockTime must be zero

```solidity
function increaseUnlockTime(uint unlockTime) external onlyOwner 
```
Extend the unlock time

```solidity
function voteForGombocsWeight(address[] calldata gombocAddresses, uint256[] calldata userWeights) 
external onlyOwner 
```
 Allocate voting power for changing multiple pool weights

```solidity
function claimFromGombocs(address[] calldata gombocAddresses) external
```
Claim the stHOPE from multi gomboc to Manager, it is the benefit from voting, return amount of fee

```solidity
function claimFromFeeDistributor() external returns (uint256)
```
Claim the stHOPE from feeDistributor to Manager, it is the benefit from veLT, return amount of fee 

```solidity
function claimLT() external returns (uint256)
```
Claim the LT token to Manager, it is the benefit from hoding stHOPE 

```solidity
function withdrawLT(address to, uint amount) external onlyOwner
```
withdraw LT unlocked, if "to" is address(0), it will be withdraw to msg.sender

```solidity
function withdrawLTRewards(address to, uint amount) external onlyOwner
```
withdraw LT comes from rewarding, if "to" is address(0), it will be withdraw to msg.sender

```solidity
function withdrawStHOPE(address to, uint amount) external onlyOwner
```
withdraw stHOPE, if "to" is address(0), it will be withdraw to msg.sender