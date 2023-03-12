import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { PermitSigHelper } from "./PermitSigHelper";

const ONE = ethers.utils.parseEther("1");
const WEEK = 7 * 86400; 
const ONE_DAY = 86400; 
const MAXTIME = 4 * 365 * 86400;

describe("LightTeamVaultManager", function () {
    async function fixture() {
        const [owner, alice] = await ethers.getSigners();

        // prepare contracts
        let LT = await ethers.getContractFactory("LT");
        const LightTeamVault = await ethers.getContractFactory("LightTeamVault");
        const VeLT = await ethers.getContractFactory("VotingEscrow");
        const GombocController = await ethers.getContractFactory("GombocController");
        const Minter = await ethers.getContractFactory("Minter");
        const StakingHOPE = await ethers.getContractFactory("StakingHOPE");
        const HOPE = await ethers.getContractFactory("HOPE");
        const RestrictedList = await ethers.getContractFactory("RestrictedList");
        const FeeDistributor = await ethers.getContractFactory("FeeDistributor");
        const Admin = await ethers.getContractFactory("Admin");
        const GombocFeeDistributor = await ethers.getContractFactory("GombocFeeDistributor");
        const Permit2Contract = await ethers.getContractFactory("Permit2");
        const SmartWalletWhitelist = await ethers.getContractFactory("SmartWalletWhitelist");
        const VaultManager = await ethers.getContractFactory("LightTeamVaultManager");
        
        // deploye permit2
        const permit2 = await Permit2Contract.deploy();

        ///deploy LT contract
        const lt = await upgrades.deployProxy(LT, ['LT Dao Token', 'LT']);
        await lt.deployed();

        // deploye VeLT
        const veLT = await VeLT.deploy(lt.address, permit2.address);
        await veLT.deployed();

        ///deploy gombocController contract
        const gombocController = await GombocController.deploy(lt.address, veLT.address);
        await gombocController.deployed();

        ///delopy minter contract
        const minter = await Minter.deploy(lt.address, gombocController.address);
        await minter.deployed();

        // depoly HOPE
        const restrictedList = await RestrictedList.deploy();
        const hopeToken = await upgrades.deployProxy(HOPE, [restrictedList.address]);
        await hopeToken.deployed();

        // approve owner, alice
        await hopeToken.approve(permit2.address, ethers.constants.MaxUint256);
        await hopeToken.connect(alice).approve(permit2.address, ethers.constants.MaxUint256);

        ///grantAgnet admin  and mint hope
        const admin = await Admin.deploy(hopeToken.address);
        let MINT_AMOUNT = ethers.utils.parseEther("100000");
        const effectiveBlock = await ethers.provider.getBlockNumber();
        const expirationBlock = effectiveBlock + 1000;
        await hopeToken.grantAgent(admin.address, MINT_AMOUNT, effectiveBlock, expirationBlock, true, true);
        await admin.mint(alice.address, ethers.utils.parseEther("50000"));
        await admin.mint(owner.address, ethers.utils.parseEther("50000"));

        // deploye stHOPE
        const stakingHope = await StakingHOPE.deploy(hopeToken.address, minter.address, permit2.address);
        await stakingHope.deployed();

        // deploye FeeDistributor
        let startTime = await time.latest();
        const feeDistributor = await upgrades.deployProxy(FeeDistributor, [veLT.address, startTime, hopeToken.address, stakingHope.address, owner.address]);
        await feeDistributor.deployed();

        //deploy GombocFeeDistributor contract
        const gombocFeeDistributor = await upgrades.deployProxy(GombocFeeDistributor, [gombocController.address, startTime, hopeToken.address, stakingHope.address, owner.address]);
        await gombocFeeDistributor.deployed();

        ///add gomboc to gombocController
        let name = "Staking HOPE Type";
        let typeId = await gombocController.nGombocTypes();
        await gombocController.addType(name, ONE);
        const MockGomboc = await ethers.getContractFactory("MockGomboc");
        const mockGomboc = await MockGomboc.deploy();
        await mockGomboc.deployed();

        await gombocController.addGomboc(stakingHope.address, typeId, ONE);
        await gombocController.addGomboc(mockGomboc.address, typeId, ONE);

        // deploy LigthTeamVault and transfer 300 billion LT to LigthTeamVault
        const lightTeamVault = await upgrades.deployProxy(LightTeamVault, [lt.address]);
        await lightTeamVault.deployed();
        const LOCKED_AMOUNT = ONE.mul(300000000000);
        lt.transfer(lightTeamVault.address, LOCKED_AMOUNT);
        
        // deploye Manager
        const vaultManager = await upgrades.deployProxy(VaultManager, [owner.address, lightTeamVault.address, feeDistributor.address, gombocFeeDistributor.address, stakingHope.address]);
        await vaultManager.deployed();
        // transfer ownership
        await lightTeamVault.transferOwnership(vaultManager.address);

        // set whitelist
        const smartWalletWhitelist = await SmartWalletWhitelist.deploy();
        await veLT.setSmartWalletChecker(smartWalletWhitelist.address);
        await smartWalletWhitelist.approveWallet(vaultManager.address);
        
        return { owner, alice, vaultManager, lightTeamVault,  veLT, lt, hopeToken, stakingHope, 
            gombocController, permit2, gombocFeeDistributor, mockGomboc, feeDistributor, minter }
    }

    describe("lock and unlock when expired", async () => {
        it("Should holding a certain quantity of veLT after lock", async function () {
            const { vaultManager, veLT } = await loadFixture(fixture); 
            const claimTime = (await time.latest()) + ONE_DAY;
            await time.increaseTo(claimTime);
            await vaultManager.claimUnlockedLTAndLockForVeLT();
    
            // let veLTBalance = await veLT.balanceOf(vaultManager.address);
            let lockedAmount = (await veLT.locked(vaultManager.address)).amount;
            let unlockedLTPerDay = ONE.mul(300000000000).div(208*7);
            expect(lockedAmount).to.equal(unlockedLTPerDay);

            await time.increase(ONE_DAY);
            await vaultManager.claimUnlockedLTAndLockForVeLT();

            await time.increase(8 * ONE_DAY);
            await vaultManager.claimUnlockedLTAndLockForVeLT();
    
            // mintable amount of xlt
            let mintableXlt = await vaultManager.mintableXlt();
            lockedAmount = (await veLT.locked(vaultManager.address)).amount;
            expect(lockedAmount).to.equal(mintableXlt);
        });

        it("should revert if the interval less than 1 day ", async function () {
            const { owner, vaultManager } = await loadFixture(fixture);
            const claimTime = (await time.latest()) + ONE_DAY;
            await time.increaseTo(claimTime);
            await vaultManager.claimUnlockedLTAndLockForVeLT();

            await expect(vaultManager.claimUnlockedLTAndLockForVeLT())
            .to.be.revertedWith("LightTeamVault: claim interval must gt one day");
        }); 
    
        it("Mintalbe amount of XLT should be right, and can only mint by Owner", async function () {
            const { alice, vaultManager, veLT } = await loadFixture(fixture);
            
            const claimTime = (await time.latest()) + ONE_DAY;
            await time.increaseTo(claimTime);
            await vaultManager.claimUnlockedLTAndLockForVeLT();
    
            let lockedAmount = (await veLT.locked(vaultManager.address)).amount;
            // mintable amount of xlt
            let mintableXlt = await vaultManager.mintableXlt();
            expect(lockedAmount).to.equal(mintableXlt);
    
            await vaultManager.mintXLT(alice.address, mintableXlt);
            const xlt = await vaultManager.xlt();
            const Xlt = await ethers.getContractAt("XLT", xlt);
            let ba = await Xlt.balanceOf(alice.address);
            expect(lockedAmount).to.equal(ba);
    
            await expect(Xlt.mint(alice.address, mintableXlt)).to.be.revertedWith("Ownable: caller is not the owner");
            await expect(vaultManager.connect(alice).mintXLT(alice.address, mintableXlt)).to.be.revertedWith("Ownable: caller is not the owner");
            await expect(vaultManager.mintXLT(alice.address, mintableXlt.add(1))).to.be.revertedWith("LightTeamVaultManager: insufficient mintable amount");
        });
       
        it("when the lock expired, could withraw LT", async function () {
            const { vaultManager, veLT, lt } = await loadFixture(fixture);
            
            const claimTime = (await time.latest()) + ONE_DAY;
            await time.increaseTo(claimTime);
            await vaultManager.claimUnlockedLTAndLockForVeLT();
            let lockedAmount = (await veLT.locked(vaultManager.address)).amount;
    
            await time.increaseTo( (await time.latest()) + MAXTIME);
            await vaultManager.withdrawLTWhenExpired();
            let ba = await lt.balanceOf(vaultManager.address);
            
            expect(lockedAmount).to.equal(ba);
        });
    
        it("when the lock expired, could lock again", async function () {
            const { vaultManager, veLT } = await loadFixture(fixture);
            
            const claimTime = (await time.latest()) + ONE_DAY;
            await time.increaseTo(claimTime);
    
            await vaultManager.claimUnlockedLTAndLockForVeLT();
            let lockedAmount = (await veLT.locked(vaultManager.address)).amount;
    
            await time.increaseTo( (await time.latest()) + MAXTIME);
            await vaultManager.withdrawLTWhenExpired();
    
            // lock again
            await vaultManager.lockLT(lockedAmount, (await time.latest()) + MAXTIME);
            let lockedAmountNew = (await veLT.locked(vaultManager.address)).amount;
            expect(lockedAmountNew).to.equal(lockedAmount);
    
            // lock partial 
            await time.increaseTo( (await time.latest()) + MAXTIME);
            await vaultManager.withdrawLTWhenExpired();
            await vaultManager.lockLT(lockedAmount.sub(100), (await time.latest()) + MAXTIME);
            await vaultManager.lockLT(100, 0);
            let lockedAmountFinally = (await veLT.locked(vaultManager.address)).amount;
            expect(lockedAmountFinally).to.equal(lockedAmount);
            // increase endtime
            let end = (await veLT.locked(vaultManager.address)).end;
            await time.increase(WEEK);
            await vaultManager.increaseUnlockTime(end.add(WEEK));
            expect((await veLT.locked(vaultManager.address)).end).to.be.equal(end.add(WEEK));
        });
    
        it("the endtime should be right when extend the endtime", async function () {
            const { vaultManager, veLT } = await loadFixture(fixture);
            
            const claimTime = (await time.latest()) + ONE_DAY;
            await time.increaseTo(claimTime);
            await vaultManager.claimUnlockedLTAndLockForVeLT();
            let lockedAmount = (await veLT.locked(vaultManager.address)).amount;
    
            await time.increaseTo( (await time.latest()) + MAXTIME);
            await vaultManager.withdrawLTWhenExpired();
    
            // lock again and increase endtime
            let currentTime = await time.latest();
            await vaultManager.lockLT(lockedAmount, currentTime + MAXTIME/2);
            await vaultManager.increaseUnlockTime(currentTime + MAXTIME);
            let endTime = (await veLT.locked(vaultManager.address)).end;
            const WEEK = ethers.BigNumber.from(7 *24 *60 *60);
            const desiredTime = ethers.BigNumber.from(currentTime + MAXTIME);
            expect(endTime.div(WEEK)).to.equal(desiredTime.div(WEEK));
        });

        it("lock twice, the endtime should be MAXTIME", async function () {
            const { vaultManager, veLT, lt } = await loadFixture(fixture);
            
            const claimTime = (await time.latest()) + WEEK;
            await time.increaseTo(claimTime);
            await vaultManager.claimUnlockedLTAndLockForVeLT();
            await time.increase(10*WEEK);
            await vaultManager.claimUnlockedLTAndLockForVeLT();
            let lockedTime = (await veLT.locked(vaultManager.address)).end;
            let expectTime = ethers.BigNumber.from(await time.latest() + MAXTIME);
            expect(lockedTime.div(WEEK)).to.be.equal(expectTime.div(WEEK));
        }); 

        it("When the lock expired, after claimed, if the lock existed, unlockTime must be 0", async function () {
            const { vaultManager, veLT } = await loadFixture(fixture);
            
            const claimTime = (await time.latest()) + MAXTIME;
            await time.increaseTo(claimTime);
            await vaultManager.claimUnlockedLTAndLockForVeLT();
            await time.increase(MAXTIME);

            await vaultManager.withdrawLTWhenExpired();
            await vaultManager.lockLT(1, (await time.latest()) + 2*WEEK);

            await expect(vaultManager.lockLT(1, (await time.latest()) + WEEK))
            .to.be.revertedWith("LightTeamVaultManager: the lock existed, the unlockTime should be zero");
        
            await vaultManager.lockLT(1, 0);
            expect((await veLT.locked(vaultManager.address)).amount).to.be.equal(2); 
        }); 
    })

    describe("voteForGombocsWeights", async () => {
        it("should revert if the lenght does not match", async function () {
            const { vaultManager, stakingHope, mockGomboc } = await loadFixture(fixture);
            await expect(vaultManager.voteForGombocsWeights([stakingHope.address, mockGomboc.address], [1]))
            .to.be.revertedWith("LightTeamVaultManager: unmatched length");
            
        });

        it("vote percentage should have values", async function () {
            const { owner, alice, vaultManager, veLT, lt, stakingHope, 
                gombocController, permit2, gombocFeeDistributor, mockGomboc
            } = await loadFixture(fixture);
            
            const claimTime = (await time.latest()) + ONE_DAY;
            await time.increaseTo(claimTime);
            await vaultManager.claimUnlockedLTAndLockForVeLT();
    
            // prepre veLT data for alice
            let lockTime = (await time.latest()) + MAXTIME;
            let NONCE = ethers.BigNumber.from(ethers.utils.randomBytes(32));
            const DEADLINE = await time.latest() + MAXTIME;
            let value = ONE.mul(50000000000); 
            const sig = await PermitSigHelper.signature(owner, lt.address, permit2.address, veLT.address, value, NONCE, DEADLINE);
            await lt.approve(permit2.address, ethers.constants.MaxUint256);
            await veLT.createLockFor(alice.address, value, lockTime, NONCE, DEADLINE, sig);
        
            //voting stakingHope gomboc
            await vaultManager.voteForGombocsWeights([stakingHope.address, mockGomboc.address], [5000, 5000]);
            await gombocController.connect(alice).voteForGombocWeights(stakingHope.address, 5000);
    
            let timestamp = await time.latest() + WEEK;
            let percentage1 = await gombocFeeDistributor.vePrecentageForAt(stakingHope.address, vaultManager.address, timestamp);
            let percentage2 = await gombocFeeDistributor.vePrecentageForAt(stakingHope.address, alice.address, timestamp);
            // console.log(percentage1);
            // console.log(percentage2);   
        });
    })

    describe("Claim rewards", async () => {
        it("claim stHOPE from gombocFeeDistributor", async function () {
            const { vaultManager, hopeToken, stakingHope, gombocController, gombocFeeDistributor, mockGomboc } = await loadFixture(fixture);
            
            const claimTime = (await time.latest()) + ONE_DAY;
            await time.increaseTo(claimTime);
            await vaultManager.claimUnlockedLTAndLockForVeLT();
        
            //voting stakingHope gomboc
            await vaultManager.voteForGombocsWeights([stakingHope.address, mockGomboc.address], [5000, 5000]);
    
            await time.increase(WEEK);
            await gombocFeeDistributor.checkpointToken();
    
            ///transfer hope fee and checkpoint
            let amount = ethers.utils.parseEther("10000");
            await hopeToken.transfer(gombocFeeDistributor.address, amount);
            await gombocFeeDistributor.checkpointToken();
            await gombocController.checkpointGomboc(stakingHope.address);
            await time.increase(WEEK);
            await gombocFeeDistributor.checkpointToken();
    
            await vaultManager.claimFromGombocs([stakingHope.address]);
            let bal = await stakingHope.balanceOf(vaultManager.address);
            expect(bal > ethers.BigNumber.from(0)).to.be.true;

            let zero = "0x0000000000000000000000000000000000000000";
            await expect(vaultManager.claimFromGombocs([stakingHope.address, zero]))
            .to.be.revertedWith("LightTeamVaultManager: wrong gomboc address");
        });

        it("claim stHOPE from feeDistributor and withdraw stHOPE", async function () {
            const { owner, alice, vaultManager, hopeToken, stakingHope, feeDistributor } = await loadFixture(fixture);
            
            const claimTime = (await time.latest()) + ONE_DAY;
            await time.increaseTo(claimTime);
            await vaultManager.claimUnlockedLTAndLockForVeLT();
    
            await time.increase(WEEK);
            await feeDistributor.checkpointToken();
            let lastTokenTime = await feeDistributor.lastTokenTime();
    
            //transfer hope to feeDistributor
            let amount = ethers.utils.parseEther("10000");
            await hopeToken.transfer(feeDistributor.address, amount);
    
            await time.increase(WEEK);
            await feeDistributor.checkpointToken();
            await feeDistributor.checkpointTotalSupply();
            await feeDistributor.toggleAllowCheckpointToken();
    
            let tt = lastTokenTime.toNumber() - lastTokenTime.toNumber() % WEEK;
            let preWeekBalance = await feeDistributor.tokensPerWeek(tt);
            let preWeekBalance1 = await feeDistributor.tokensPerWeek(tt + WEEK);
    
            /// claim  fee
            await time.increase(WEEK);
            await vaultManager.claimFromFeeDistributor();
            let bal = await stakingHope.balanceOf(vaultManager.address);
            expect(bal).to.equal(preWeekBalance.add(preWeekBalance1));
        
            // withdraw stHOPE
            await vaultManager.withdrawStHOPE(alice.address, bal.sub(100));
            expect(bal.sub(100)).to.equal(await stakingHope.balanceOf(alice.address));

            let zero = "0x0000000000000000000000000000000000000000";
            let balanceBefore = await stakingHope.balanceOf(owner.address);
            await vaultManager.withdrawStHOPE(zero, 50);
            let newBalance = (await stakingHope.balanceOf(owner.address)).sub(balanceBefore);
            expect(newBalance).to.equal(50);

            await expect(vaultManager.withdrawStHOPE(zero, ethers.constants.MaxInt256))
            .to.be.revertedWith("LightTeamVaultManager: insufficient rewards to Withraw");
        });
    
        it("claim LT from stakingHOPE and withdraw", async function () {
            const { owner, alice, vaultManager, hopeToken, lt, stakingHope, feeDistributor, minter } = await loadFixture(fixture);
            //set minter for LT
            await lt.setMinter(minter.address);
            await expect(vaultManager.claimLT())
            .to.be.revertedWith("LightTeamVaultManager: insufficient rewards to claim");

            const claimTime = (await time.latest()) + ONE_DAY;
            await time.increaseTo(claimTime);
            await vaultManager.claimUnlockedLTAndLockForVeLT();
    
            await time.increase(WEEK);
            await feeDistributor.checkpointToken();
    
            //transfer hope to feeDistributor
            let amount = ethers.utils.parseEther("10000");
            await hopeToken.transfer(feeDistributor.address, amount);
    
            await time.increase(WEEK);
            await feeDistributor.checkpointToken();
            await feeDistributor.checkpointTotalSupply();
            await feeDistributor.toggleAllowCheckpointToken();
    
            // claim fee
            await time.increase(WEEK);
            await vaultManager.claimFromFeeDistributor();
            
            // here, we hold stHOPE now
            await time.increase(WEEK);
            
            let balanceBefore = await lt.balanceOf(vaultManager.address);
            await vaultManager.claimLT();
            let newBalance = (await lt.balanceOf(vaultManager.address)).sub(balanceBefore);
            expect(newBalance > 0).to.be.true;
    
            await vaultManager.withdrawLTRewards(alice.address, 100);
            expect(await lt.balanceOf(alice.address)).to.equal(100);

            await expect(vaultManager.withdrawLTRewards(alice.address, ethers.constants.MaxInt256))
            .to.be.revertedWith("LightTeamVaultManager: insufficient rewards to Withraw");

            let zero = "0x0000000000000000000000000000000000000000";
            balanceBefore = await lt.balanceOf(owner.address);
            await vaultManager.withdrawLTRewards(zero, 50);
            newBalance = (await lt.balanceOf(owner.address)).sub(balanceBefore);
            expect(newBalance).to.equal(50);
        });
    })

    describe("withdraw", async () => {
        it("should revert if caller is not owner", async function () {
            const { owner, alice, vaultManager, lt } = await loadFixture(fixture);
            
            const claimTime = (await time.latest()) + WEEK;
            await time.increaseTo(claimTime);
            await vaultManager.claimUnlockedLTAndLockForVeLT();
            await time.increase(MAXTIME);
            await vaultManager.withdrawLTWhenExpired();
            
            await expect(vaultManager.connect(alice).withdrawLT(alice.address, 100))
            .to.be.revertedWith("LightTeamVaultManager: caller is not the owner");
        });

        it("withdraw LT", async function () {
            const { owner, alice, vaultManager, lt } = await loadFixture(fixture);
            
            const claimTime = (await time.latest()) + WEEK;
            await time.increaseTo(claimTime);
            await vaultManager.claimUnlockedLTAndLockForVeLT();
    
            await time.increase(MAXTIME);
            
            await vaultManager.withdrawLTWhenExpired();
            let balance = await lt.balanceOf(vaultManager.address);
            await vaultManager.mintXLT(alice.address, balance.sub(100));
            await vaultManager.withdrawLT(alice.address, balance.sub(100));
            expect(await lt.balanceOf(alice.address)).to.equal(balance.sub(100));

            let zero = "0x0000000000000000000000000000000000000000";
            await expect(vaultManager.withdrawLT(zero, 50))
            .to.be.revertedWith("LightTeamVaultManager: insufficient XLT to burn");

            let balanceBefore = await lt.balanceOf(owner.address);
            await vaultManager.mintXLT(owner.address, 100);
            await vaultManager.withdrawLT(zero, 100);
            let newBalance = (await lt.balanceOf(owner.address)).sub(balanceBefore);
            expect(newBalance).to.equal(100);

            await expect(vaultManager.withdrawLT(zero, ethers.constants.MaxInt256))
            .to.be.revertedWith("LightTeamVaultManager: insufficient unlocked balances to Withraw");

        });

        it("withdraw LT by anyone", async function () {
            const { alice, vaultManager, lt } = await loadFixture(fixture);
            
            const claimTime = (await time.latest()) + WEEK;
            await time.increaseTo(claimTime);
            await vaultManager.claimUnlockedLTAndLockForVeLT();
    
            await time.increase(MAXTIME);
            
            await vaultManager.withdrawLTWhenExpired();
            let balance = await lt.balanceOf(vaultManager.address);

            await  vaultManager.setCanWithdrawByAnyone(true);
            await expect(vaultManager.connect(alice).withdrawLT(alice.address, balance)).to.be.revertedWith("LightTeamVaultManager: insufficient XLT to burn");
            
            await vaultManager.mintXLT(alice.address, balance);
            await vaultManager.connect(alice).withdrawLT(alice.address, balance);
            expect(await lt.balanceOf(alice.address)).to.be.equal(balance);
        }); 

        it("if the caller is not owner, 'to' must be msg.sender", async function () {
            const { owner, alice, vaultManager, lt } = await loadFixture(fixture);
            
            const claimTime = (await time.latest()) + WEEK;
            await time.increaseTo(claimTime);
            await vaultManager.claimUnlockedLTAndLockForVeLT();
    
            await time.increase(MAXTIME);
            await vaultManager.withdrawLTWhenExpired();

            let canWithdrawByAnyone = await vaultManager.canWithdrawByAnyone();
            expect(canWithdrawByAnyone).to.be.equal(false);
            await expect(vaultManager.setCanWithdrawByAnyone(false))
            .to.be.revertedWith("LightTeamVaultManager: wrong value to set");

            await vaultManager.setCanWithdrawByAnyone(true);
            expect(await vaultManager.canWithdrawByAnyone()).to.be.equal(true);
            await vaultManager.mintXLT(owner.address, 100);
            await expect(vaultManager.connect(alice).withdrawLT(owner.address, 100))
            .to.be.revertedWith("LightTeamVaultManager: invalid call");

            await vaultManager.mintXLT(alice.address, 100);
            const xlt = await vaultManager.xlt();
            const Xlt = await ethers.getContractAt("XLT", xlt);
            expect(await Xlt.balanceOf(alice.address)).to.be.equal(100);

            await expect(vaultManager.connect(alice).burnXLT(owner.address, 100))
            .to.be.revertedWith("Ownable: caller is not the owner");

            await vaultManager.connect(alice).withdrawLT(alice.address, 100);
            expect(await lt.balanceOf(alice.address)).to.be.equal(100);
        }); 
        
        it("withdraw LT when eight years later", async function () {
            const { alice, vaultManager, lt, veLT } = await loadFixture(fixture);
            
            const claimTime = (await time.latest()) + MAXTIME;
            await time.increaseTo(claimTime);
            await vaultManager.claimUnlockedLTAndLockForVeLT();
    
            await time.increase(MAXTIME);
            
            await vaultManager.withdrawLTWhenExpired();
            let balance = await lt.balanceOf(vaultManager.address);

            let end = (await time.latest()) + MAXTIME/2;
            await vaultManager.lockLT(balance, end);
            await vaultManager.increaseUnlockTime(await time.latest() + MAXTIME);
            let lockedTime = (await veLT.locked(vaultManager.address)).end;
            let expectTime = (await time.latest()) + MAXTIME;
            expect(lockedTime.div(WEEK)).to.be.equal(ethers.BigNumber.from(expectTime).div(WEEK));
        });
    })
    
    describe("perform", async () => {
        it("perform a transfer of LT token", async function () {
            const {vaultManager} = await loadFixture(fixture);
            let LT = await ethers.getContractFactory("LT");
            const lt = await upgrades.deployProxy(LT, ['LT Dao Token', 'LT']);
            await lt.deployed();
            await lt.transfer(vaultManager.address, 100);
            let [, otherAccount] = await ethers.getSigners();
            let data = lt.interface.encodeFunctionData("transfer", [otherAccount.address, 1]);
            await expect(vaultManager.perform([lt.address],[data],[0, 0]))
            .to.be.revertedWith("target length != values length");

            await expect(vaultManager.perform([lt.address, lt.address],[data],[0, 0]))
            .to.be.revertedWith("target length != data length");
            await vaultManager.perform([lt.address], [data], [0]);
            expect(await lt.balanceOf(otherAccount.address)).to.be.equal(1);
        });
    });

    describe("xlt mint and burn", async () => {
        it("should revert if caller is not owner when mint xlt", async function () {
            const { alice, vaultManager } = await loadFixture(fixture);
            const claimTime = (await time.latest()) + ONE_DAY;
            await time.increaseTo(claimTime);
            await vaultManager.claimUnlockedLTAndLockForVeLT();
    
            // mintable amount of xlt
            let mintableXlt = await vaultManager.mintableXlt();
            let [,,otherAccount] = await ethers.getSigners();
            await expect(vaultManager.connect(alice).mintXLT(otherAccount.address, mintableXlt))
            .to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("should revert if caller is not owner when burn xlt", async function () {
            const { alice, vaultManager } = await loadFixture(fixture);
            const claimTime = (await time.latest()) + ONE_DAY;
            await time.increaseTo(claimTime);
            await vaultManager.claimUnlockedLTAndLockForVeLT();
    
            // mintable amount of xlt
            let mintableXlt = await vaultManager.mintableXlt();
            await vaultManager.mintXLT(alice.address, mintableXlt);
            const xlt = await vaultManager.xlt();
            const Xlt = await ethers.getContractAt("XLT", xlt);
            let ba = await Xlt.balanceOf(alice.address);
            let [,,otherAccount] = await ethers.getSigners();
            await expect(vaultManager.connect(otherAccount).burnXLT(alice.address, 1))
            .to.be.revertedWith("Ownable: caller is not the owner");
            await vaultManager.burnXLT(alice.address, 1);
            expect(await Xlt.balanceOf(alice.address)).to.be.equal(mintableXlt.sub(1));
        });
    });
});
