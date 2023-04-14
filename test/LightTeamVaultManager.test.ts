import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import MockLT from "./build/LT.json";
import MockVotingEscrow from "./build/VotingEscrow.json";
import MockGaugeController from "./build/GaugeController.json";
import MockMinter from "./build/Minter.json";
import MockStakingHOPE from "./build/StakingHOPE.json";
import MockHOPE from "./build/HOPE.json";
import MockRestrictedList from "./build/RestrictedList.json";
import MockFeeDistributor from "./build/FeeDistributor.json";
import MockAdmin from "./build/Admin.json";
import MockGaugeFeeDistributor from "./build/GaugeFeeDistributor.json";
import MockPermit2 from "./build/Permit2.json";
import MockSmartWalletWhitelist from "./build/SmartWalletWhitelist.json";
import Mock_Gauge from "./build/MockGauge.json";

const ONE = ethers.utils.parseEther("1");
const ONE_DAY = 86400;
const WEEK = 7 * ONE_DAY;
const MAXTIME = 208 * WEEK;
const UNLOCK_PER_DAY = ONE.mul(300000000000).div(208 * 7);

describe("LightTeamVaultManager", function () {
    async function fixture() {
        const [owner, alice] = await ethers.getSigners();

        // prepare contracts
        let LT = await ethers.getContractFactory(MockLT.abi, MockLT.bytecode);
        const LightTeamVault = await ethers.getContractFactory("LightTeamVault");
        const VeLT = await ethers.getContractFactory(MockVotingEscrow.abi, MockVotingEscrow.bytecode);
        const GaugeController = await ethers.getContractFactory(MockGaugeController.abi, MockGaugeController.bytecode);
        const Minter = await ethers.getContractFactory(MockMinter.abi, MockMinter.bytecode);
        const StakingHOPE = await ethers.getContractFactory(MockStakingHOPE.abi, MockStakingHOPE.bytecode);
        const HOPE = await ethers.getContractFactory(MockHOPE.abi, MockHOPE.bytecode);
        const RestrictedList = await ethers.getContractFactory(MockRestrictedList.abi, MockRestrictedList.bytecode);
        const FeeDistributor = await ethers.getContractFactory(MockFeeDistributor.abi, MockFeeDistributor.bytecode);
        const Admin = await ethers.getContractFactory(MockAdmin.abi, MockAdmin.bytecode);
        const GaugeFeeDistributor = await ethers.getContractFactory(MockGaugeFeeDistributor.abi, MockGaugeFeeDistributor.bytecode);
        const Permit2Contract = await ethers.getContractFactory(MockPermit2.abi, MockPermit2.bytecode);
        const SmartWalletWhitelist = await ethers.getContractFactory(MockSmartWalletWhitelist.abi, MockSmartWalletWhitelist.bytecode);
        const VaultManager = await ethers.getContractFactory("LightTeamVaultManager");

        // deploye permit2
        const permit2 = await Permit2Contract.deploy();

        ///deploy LT contract
        const lt = await LT.deploy();
        await lt.deployed();
        await lt.initialize("Light Token", "LT");

        // deploye VeLT
        const veLT = await VeLT.deploy(lt.address, permit2.address);
        await veLT.deployed();

        ///deploy gaugeController contract
        const gaugeController = await GaugeController.deploy(lt.address, veLT.address);
        await gaugeController.deployed();

        ///delopy minter contract
        const minter = await Minter.deploy(lt.address, gaugeController.address);
        await minter.deployed();

        // depoly HOPE
        const restrictedList = await RestrictedList.deploy();
        const hopeToken = await HOPE.deploy();
        await hopeToken.deployed();
        await hopeToken.initialize(restrictedList.address);

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
        const feeDistributor = await FeeDistributor.deploy();
        await feeDistributor.deployed();
        await feeDistributor.initialize(veLT.address, startTime, hopeToken.address, stakingHope.address, owner.address);

        //deploy GaugeFeeDistributor contract
        const gaugeFeeDistributor = await GaugeFeeDistributor.deploy();
        await gaugeFeeDistributor.deployed();
        await gaugeFeeDistributor.initialize(gaugeController.address, startTime, hopeToken.address, stakingHope.address, owner.address);

        // deploy LigthTeamVault and transfer 300 billion LT to LigthTeamVault
        const lightTeamVault = await upgrades.deployProxy(LightTeamVault, [lt.address]);
        await lightTeamVault.deployed();
        const LOCKED_AMOUNT = ONE.mul(300000000000);
        lt.transfer(lightTeamVault.address, LOCKED_AMOUNT);

        // deploye Manager
        const vaultManager = await upgrades.deployProxy(VaultManager, [owner.address, lightTeamVault.address, feeDistributor.address, gaugeFeeDistributor.address, stakingHope.address]);
        await vaultManager.deployed();
        // transfer ownership
        await lightTeamVault.transferOwnership(vaultManager.address);

        // set whitelist
        const smartWalletWhitelist = await SmartWalletWhitelist.deploy();
        await veLT.setSmartWalletChecker(smartWalletWhitelist.address);
        await smartWalletWhitelist.approveWallet(vaultManager.address);

        return {
            owner, alice, vaultManager, lightTeamVault, veLT, lt, hopeToken, stakingHope,
            gaugeController, permit2, gaugeFeeDistributor, feeDistributor, minter
        }
    }

    describe("claimUnlockedLTAndLockForVeLT", async () => {
        it("should be revert if caller is not owner", async () => {
            const { alice, vaultManager } = await loadFixture(fixture);
            await expect(vaultManager.connect(alice).claimUnlockedLTAndLockForVeLT())
                .to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("after the first claim, the locked amount and end time should be right", async function () {
            const { vaultManager, veLT } = await loadFixture(fixture);
            const claimTime = (await time.latest()) + ONE_DAY;
            await time.increaseTo(claimTime);
            await vaultManager.claimUnlockedLTAndLockForVeLT();

            let lockedAmount = (await veLT.locked(vaultManager.address)).amount;
            expect(lockedAmount).to.equal(UNLOCK_PER_DAY.mul(2));

            let end = (await veLT.locked(vaultManager.address)).end;
            let exptetEnd = ethers.BigNumber.from(((await time.latest()) + MAXTIME)).div(WEEK).mul(WEEK);
            expect(end).to.be.equal(exptetEnd);
        });

        it("after the second or third claim, the locked amount and end time should be right", async function () {
            const { vaultManager, veLT } = await loadFixture(fixture);
            const claimTime = (await time.latest()) + ONE_DAY;
            await time.increaseTo(claimTime);
            await vaultManager.claimUnlockedLTAndLockForVeLT();

            await time.increase(WEEK);
            await vaultManager.claimUnlockedLTAndLockForVeLT();
            let lockedAmount = (await veLT.locked(vaultManager.address)).amount;
            expect(lockedAmount).to.be.equal(UNLOCK_PER_DAY.mul(9));
            let end = (await veLT.locked(vaultManager.address)).end;
            let timeRounded = ethers.BigNumber.from((await time.latest() + MAXTIME)).div(WEEK).mul(WEEK);
            expect(end).to.be.equal(timeRounded);
        });

        it("four years later, after claim, the locked amount and end time should be right", async function () {
            const { vaultManager, veLT } = await loadFixture(fixture);
            const claimTime = (await time.latest()) + MAXTIME;
            await time.increaseTo(claimTime);
            await vaultManager.claimUnlockedLTAndLockForVeLT();

            let lockedAmount = (await veLT.locked(vaultManager.address)).amount;
            expect(lockedAmount).to.be.equal(UNLOCK_PER_DAY.mul(208 * 7));
            let end = (await veLT.locked(vaultManager.address)).end;
            let timeRounded = ethers.BigNumber.from((await time.latest() + MAXTIME)).div(WEEK).mul(WEEK);
            expect(end).to.be.equal(timeRounded);
        });

        it("after claim, the mintableXlt should be right", async function () {
            const { vaultManager, veLT } = await loadFixture(fixture);
            const claimTime = (await time.latest()) + ONE_DAY;
            await time.increaseTo(claimTime);
            await vaultManager.claimUnlockedLTAndLockForVeLT();

            let lockedAmount = (await veLT.locked(vaultManager.address)).amount;
            let currentMintableXlt = await vaultManager.mintableXlt();
            expect(lockedAmount).to.equal(currentMintableXlt);

            await time.increase(WEEK);
            await vaultManager.claimUnlockedLTAndLockForVeLT();
            lockedAmount = (await veLT.locked(vaultManager.address)).amount;
            currentMintableXlt = await vaultManager.mintableXlt();
            expect(lockedAmount).to.equal(currentMintableXlt);
        });
    });

    describe("claimUnlockedLT", async () => {
        it("should be revert if caller is not owner", async () => {
            const { alice, vaultManager } = await loadFixture(fixture);
            await expect(vaultManager.connect(alice).claimUnlockedLT())
                .to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("after the claim, the balance should be right", async function () {
            const { vaultManager, lt } = await loadFixture(fixture);
            const claimTime = (await time.latest()) + ONE_DAY;
            await time.increaseTo(claimTime);
            await vaultManager.claimUnlockedLT();

            let balance = await lt.balanceOf(vaultManager.address);
            expect(balance).to.be.equal(UNLOCK_PER_DAY.mul(2));
        });

        it("after the claim, the mintableXlt should be right", async function () {
            const { vaultManager, lt } = await loadFixture(fixture);
            const claimTime = (await time.latest()) + ONE_DAY;
            await time.increaseTo(claimTime);
            await vaultManager.claimUnlockedLT();

            let mintableXlt = await vaultManager.mintableXlt();
            expect(mintableXlt).to.be.equal(UNLOCK_PER_DAY.mul(2));
        });
    });

    describe("setCanWithdrawByAnyone", async () => {
        it("should be revert if caller is not owner", async () => {
            const { alice, vaultManager } = await loadFixture(fixture);
            await expect(vaultManager.connect(alice).setCanWithdrawByAnyone(true))
                .to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("should be revert when set the same value", async () => {
            const { vaultManager } = await loadFixture(fixture);
            let value = await vaultManager.canWithdrawByAnyone();
            await expect(vaultManager.setCanWithdrawByAnyone(value))
                .to.be.revertedWith("LightTeamVaultManager: wrong value to set");
        });

        it("after set, the value should be set right", async () => {
            const { vaultManager } = await loadFixture(fixture);
            let value = await vaultManager.canWithdrawByAnyone();
            await vaultManager.setCanWithdrawByAnyone(!value);
            expect(await vaultManager.canWithdrawByAnyone()).to.be.equal(!value);
        });

    });

    describe("mintXLT", async () => {
        it("should be revert if caller is not owner", async () => {
            const { alice, vaultManager } = await loadFixture(fixture);
            let mintableAmount = await vaultManager.mintableXlt();
            await expect(vaultManager.connect(alice).mintXLT(alice.address, mintableAmount))
                .to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("should be revert if mintable amount is insufficient", async () => {
            const { owner, vaultManager } = await loadFixture(fixture);
            let mintableAmount = await vaultManager.mintableXlt();
            await expect(vaultManager.mintXLT(owner.address, mintableAmount.add(1)))
                .to.be.revertedWith("LightTeamVaultManager: insufficient mintable amount");
        });

        it("after minted, the mintableXlt should be right", async () => {
            const { owner, vaultManager } = await loadFixture(fixture);
            const claimTime = (await time.latest()) + ONE_DAY;
            await time.increaseTo(claimTime);
            await vaultManager.claimUnlockedLTAndLockForVeLT();

            let mintableAmount = await vaultManager.mintableXlt();
            await vaultManager.mintXLT(owner.address, mintableAmount.sub(1))
            expect(await vaultManager.mintableXlt()).to.be.equal(1);
        });

        it("after minted, the balance of 'to' should be right", async () => {
            const { owner, vaultManager } = await loadFixture(fixture);
            const claimTime = (await time.latest()) + ONE_DAY;
            await time.increaseTo(claimTime);
            await vaultManager.claimUnlockedLTAndLockForVeLT();

            let mintableAmount = await vaultManager.mintableXlt();
            const XLT = await vaultManager.xlt();
            const xlt = await ethers.getContractAt("XLT", XLT);
            await vaultManager.mintXLT(owner.address, mintableAmount)
            expect(await xlt.balanceOf(owner.address)).to.be.equal(mintableAmount);
        });
    });

    describe("withdrawLTWhenExpired", async () => {
        it("withdraw LT When expired, the amount withdrew should be right", async function () {
            const { vaultManager, lt } = await loadFixture(fixture);
            const claimTime = (await time.latest()) + MAXTIME;
            await time.increaseTo(claimTime);
            await vaultManager.claimUnlockedLTAndLockForVeLT();

            await time.increase(MAXTIME);
            await vaultManager.withdrawLTWhenExpired();
            expect((await lt.balanceOf(vaultManager.address)).div(ONE)).to.equal(ethers.BigNumber.from(300000000000).sub(1));
        });
    });

    describe("lockLT", async () => {
        it("withdraw LT When expired, then lock again, should be revert if caller is not owner", async function () {
            const { alice, vaultManager } = await loadFixture(fixture);
            const claimTime = (await time.latest()) + MAXTIME;
            await time.increaseTo(claimTime);
            await vaultManager.claimUnlockedLTAndLockForVeLT();
            await time.increase(MAXTIME);
            await vaultManager.withdrawLTWhenExpired();

            await expect(vaultManager.connect(alice).lockLT(1, MAXTIME))
                .to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("withdraw LT When expired, then lock again, after the first lock, the lock amount and end time should be right", async function () {
            const { vaultManager, veLT, lt } = await loadFixture(fixture);
            const claimTime = await time.latest() + MAXTIME;
            await time.increaseTo(claimTime);
            await vaultManager.claimUnlockedLTAndLockForVeLT();
            await time.increase(MAXTIME);
            await vaultManager.withdrawLTWhenExpired();

            let endTime = await time.latest() + MAXTIME;
            await vaultManager.lockLT(100, endTime);
            let lockedAmount = (await veLT.locked(vaultManager.address)).amount;
            expect(lockedAmount).to.equal(100);

            let end = (await veLT.locked(vaultManager.address)).end;
            let exptetEnd = ethers.BigNumber.from(endTime).div(WEEK).mul(WEEK);
            expect(end).to.be.equal(exptetEnd);
        });

        it("withdraw LT When expired, then lock again, after the seconde or third lock, the lock amount and end time should be right", async function () {
            const { vaultManager, veLT, lt } = await loadFixture(fixture);
            const claimTime = await time.latest() + MAXTIME;
            await time.increaseTo(claimTime);
            await vaultManager.claimUnlockedLTAndLockForVeLT();
            await time.increase(MAXTIME);
            await vaultManager.withdrawLTWhenExpired();

            let endTime = await time.latest() + MAXTIME;
            await vaultManager.lockLT(100, endTime);
            await vaultManager.lockLT(100, 0);

            let lockedAmount = (await veLT.locked(vaultManager.address)).amount;
            expect(lockedAmount).to.equal(200);

            let end = (await veLT.locked(vaultManager.address)).end;
            let exptetEnd = ethers.BigNumber.from(endTime).div(WEEK).mul(WEEK);
            expect(end).to.be.equal(exptetEnd);
        });

        it("withdraw LT When expired, then lock again, if not the first lock, should revert if the end time is not zero", async function () {
            const { vaultManager } = await loadFixture(fixture);
            const claimTime = await time.latest() + MAXTIME;
            await time.increaseTo(claimTime);
            await vaultManager.claimUnlockedLTAndLockForVeLT();
            await time.increase(MAXTIME);
            await vaultManager.withdrawLTWhenExpired();

            let endTime = await time.latest() + MAXTIME;
            await vaultManager.lockLT(100, endTime);

            await expect(vaultManager.lockLT(100, endTime))
                .to.be.revertedWith("LightTeamVaultManager: the lock existed, the unlockTime should be zero");
        });
    });

    describe("increaseUnlockTime", async () => {
        it("should be revert if caller is not owner", async function () {
            const { alice, vaultManager, veLT } = await loadFixture(fixture);
            const claimTime = (await time.latest()) + MAXTIME;
            await time.increaseTo(claimTime);
            await vaultManager.claimUnlockedLTAndLockForVeLT();
            await time.increase(MAXTIME);
            await vaultManager.withdrawLTWhenExpired();

            let lockTime = await time.latest() + MAXTIME;
            await vaultManager.lockLT(100, lockTime);
            await expect(vaultManager.connect(alice).increaseUnlockTime(lockTime + 2 * WEEK))
                .to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("after increase unlock time, the end time should be right", async function () {
            const { vaultManager, veLT } = await loadFixture(fixture);
            const claimTime = (await time.latest()) + MAXTIME;
            await time.increaseTo(claimTime);
            await vaultManager.claimUnlockedLTAndLockForVeLT();
            await time.increase(MAXTIME);
            await vaultManager.withdrawLTWhenExpired();

            await vaultManager.lockLT(100, (await time.latest()) + 2 * WEEK);
            let endTimeBefore = (await veLT.locked(vaultManager.address)).end;
            await vaultManager.increaseUnlockTime(endTimeBefore.add(2 * WEEK));
            let endTimeNew = (await veLT.locked(vaultManager.address)).end;
            expect(endTimeNew).to.be.equal(endTimeBefore.add(2 * WEEK));
        });
    });

    describe("voteForGaugesWeights", async () => {
        it("should revert if the lenght does not match", async function () {
            const { vaultManager, stakingHope } = await loadFixture(fixture);
            await expect(vaultManager.voteForGaugesWeights([stakingHope.address], [1, 2]))
                .to.be.revertedWith("LightTeamVaultManager: unmatched length");

        });

        it("voteForGaugeWeights with two type and two gauge", async function () {
            const { vaultManager, veLT, stakingHope, gaugeController } = await loadFixture(fixture);

            //add gauge to gaugeController
            let name = "Staking HOPE Type";
            let weight = ethers.utils.parseEther("1");
            let typeId = await gaugeController.nGaugeTypes();
            await gaugeController.addType(name, weight);
            let name1 = "Mock Gauge";
            let typeId1 = await gaugeController.nGaugeTypes();
            await gaugeController.addType(name1, weight);
            const MockGauge = await ethers.getContractFactory(Mock_Gauge.abi, Mock_Gauge.bytecode);
            const mockGauge = await MockGauge.deploy();
            await mockGauge.deployed();

            await gaugeController.addGauge(stakingHope.address, typeId, 0);
            await gaugeController.addGauge(mockGauge.address, typeId1, 0);

            // lock lt from manager
            const claimTime = (await time.latest()) + ONE_DAY;
            await time.increaseTo(claimTime);
            await vaultManager.claimUnlockedLTAndLockForVeLT();

            //voting stakingHope gauge
            let userWeight = 5000;
            await vaultManager.voteForGaugesWeights([stakingHope.address, mockGauge.address], [userWeight, userWeight]);

            let blcoTime = await time.latest();
            let lockEnd = await veLT.lockedEnd(vaultManager.address);
            let nextTime = blcoTime + WEEK;
            nextTime = nextTime - nextTime % WEEK;
            let slope = await veLT.getLastUserSlope(vaultManager.address);
            let gSlope = slope.mul(userWeight).div(10000);
            let Wg = gSlope.mul((lockEnd.toNumber() - nextTime));
            // console.log(Wg.toString());
            expect(await gaugeController.getGaugeWeight(mockGauge.address)).to.equal(Wg);
            expect(await gaugeController.getGaugeWeight(stakingHope.address)).to.equal(Wg);
            expect(await gaugeController.getWeightsSumPreType(typeId)).to.equal(Wg);
            expect(await gaugeController.getWeightsSumPreType(typeId1)).to.equal(Wg);
            expect(await gaugeController.getTotalWeight()).to.equal(Wg.mul(weight).mul(2));
        });
    });

    describe("claimFromGauges", async () => {
        it("should revert if the some Gauge address is zero", async function () {
            const { vaultManager, stakingHope } = await loadFixture(fixture);
            await expect(vaultManager.claimFromGauges([stakingHope.address, ethers.constants.AddressZero]))
                .to.be.revertedWith("LightTeamVaultManager: wrong gauge address");
        });

        it("after claim, the balance and stHopeTotalClaimed should be right", async function () {
            const { vaultManager, hopeToken, stakingHope, gaugeController, gaugeFeeDistributor } = await loadFixture(fixture);
            const claimTime = (await time.latest()) + ONE_DAY;
            await time.increaseTo(claimTime);
            await vaultManager.claimUnlockedLTAndLockForVeLT();

            //add gauge to gaugeController
            let name = "Staking HOPE Type";
            let weight = ethers.utils.parseEther("1");
            let typeId = await gaugeController.nGaugeTypes();
            await gaugeController.addType(name, weight);
            let name1 = "Mock Gauge";
            let typeId1 = await gaugeController.nGaugeTypes();
            await gaugeController.addType(name1, weight);
            const MockGauge = await ethers.getContractFactory(Mock_Gauge.abi, Mock_Gauge.bytecode);
            const mockGauge = await MockGauge.deploy();
            await mockGauge.deployed();

            await gaugeController.addGauge(stakingHope.address, typeId, weight);
            await gaugeController.addGauge(mockGauge.address, typeId1, weight);

            //voting stakingHope gauge
            await vaultManager.voteForGaugesWeights([stakingHope.address, mockGauge.address], [5000, 5000]);
            await time.increase(WEEK);
            await gaugeFeeDistributor.checkpointToken();

            ///transfer hope fee and checkpoint
            let amount = ethers.utils.parseEther("1000");
            await hopeToken.transfer(gaugeFeeDistributor.address, amount);
            await gaugeFeeDistributor.checkpointToken();
            await gaugeController.checkpointGauge(stakingHope.address);

            await time.increase(WEEK);
            await gaugeFeeDistributor.checkpointToken();

            let balanceLast = await gaugeFeeDistributor.tokenLastBalance();
            await vaultManager.claimFromGauges([stakingHope.address]);
            let balanceNow = await gaugeFeeDistributor.tokenLastBalance();
            let totalClaimedAmount = balanceLast.sub(balanceNow);
            expect(totalClaimedAmount).to.be.equal(await stakingHope.balanceOf(vaultManager.address));
            expect(totalClaimedAmount).to.be.equal(await vaultManager.stHopeTotalClaimed());
        });
    });

    describe("claimFromFeeDistributor", async () => {
        it("after claim, the balance and stHopeTotalClaimed should be right", async function () {
            const { vaultManager, hopeToken, stakingHope, feeDistributor } = await loadFixture(fixture);

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
            expect(bal).to.be.equal(await vaultManager.stHopeTotalClaimed());
        });
    });

    describe("claimLT", async () => {
        it("should revert if claimable amount is zero", async function () {
            const { owner, alice, vaultManager, hopeToken, lt, stakingHope, feeDistributor, minter } = await loadFixture(fixture);
            //set minter for LT
            await lt.setMinter(minter.address);
            await expect(vaultManager.claimLT())
                .to.be.revertedWith("LightTeamVaultManager: insufficient rewards to claim");
        });

        it("claim LT from stakingHOPE", async function () {
            const { vaultManager, hopeToken, lt, stakingHope, feeDistributor, gaugeController, minter } = await loadFixture(fixture);
            //set minter for LT
            await lt.setMinter(minter.address);
            ///add gauge to gaugeController
            let name = "stHopeGauge";
            let typeId = await gaugeController.nGaugeTypes();
            let weight = ethers.utils.parseEther("1");
            await gaugeController.addType(name, weight);
            await gaugeController.addGauge(stakingHope.address, typeId, weight);

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

            await vaultManager.claimLT();
            let mintedAmount = await minter.minted(vaultManager.address, stakingHope.address);
            expect(mintedAmount).to.be.equal(await lt.balanceOf(vaultManager.address));
            expect(await vaultManager.ltTotalClaimed()).to.be.equal(mintedAmount);
        });
    });

    describe("withdrawLTRewards", async () => {
        it("should be revert if caller is not owner", async function () {
            const { alice, vaultManager } = await loadFixture(fixture);

            await expect(vaultManager.connect(alice).withdrawLTRewards(alice.address, 100))
                .to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("should be revert if claimabel amount is insufficient", async function () {
            const { owner, vaultManager } = await loadFixture(fixture);

            await expect(vaultManager.withdrawLTRewards(owner.address, 100))
                .to.be.revertedWith("LightTeamVaultManager: insufficient rewards to Withraw");
        });

        it("withraw LT reward to 'to', and check 'ltRewardsWithdrew'", async function () {
            const { owner, alice, vaultManager, hopeToken, lt, stakingHope, feeDistributor, gaugeController, minter } = await loadFixture(fixture);
            //set minter for LT
            await lt.setMinter(minter.address);
            ///add gauge to gaugeController
            let name = "stHopeGauge";
            let typeId = await gaugeController.nGaugeTypes();
            let weight = ethers.utils.parseEther("1");
            await gaugeController.addType(name, weight);
            await gaugeController.addGauge(stakingHope.address, typeId, weight);

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

            await vaultManager.claimLT();

            // if 'to' is address(0), withrew to msg.sender
            let balanceBefore = await lt.balanceOf(owner.address);
            await vaultManager.withdrawLTRewards(ethers.constants.AddressZero, 100);
            expect(((await lt.balanceOf(owner.address))).sub(balanceBefore)).to.be.equal(100);

            await vaultManager.withdrawLTRewards(alice.address, 100);
            expect(await lt.balanceOf(alice.address)).to.be.equal(100);
            expect(await vaultManager.ltRewardsWithdrew()).to.be.equal(200);
        });
    });

    describe("withdrawLT", async () => {
        it("should be revert if caller is not owner", async function () {
            const { alice, vaultManager } = await loadFixture(fixture);
            const claimTime = (await time.latest()) + MAXTIME;
            await time.increaseTo(claimTime);
            await vaultManager.claimUnlockedLTAndLockForVeLT();
            await time.increase(MAXTIME);
            await vaultManager.withdrawLTWhenExpired();

            await expect(vaultManager.connect(alice).withdrawLT(alice.address, 100))
                .to.be.revertedWith("LightTeamVaultManager: caller is not the owner");
        });

        it("should be revert if 'to' does not hoding certain XLT", async function () {
            const { alice, vaultManager } = await loadFixture(fixture);
            const claimTime = (await time.latest()) + MAXTIME;
            await time.increaseTo(claimTime);
            await vaultManager.claimUnlockedLTAndLockForVeLT();
            await time.increase(MAXTIME);
            await vaultManager.withdrawLTWhenExpired();

            await expect(vaultManager.withdrawLT(alice.address, 100))
                .to.be.revertedWith("LightTeamVaultManager: insufficient XLT to burn");
        });

        it("when 'canWithdrawByAnyone' is true, if the caller is not owner, 'to' must be msg.sender", async function () {
            const { owner, alice, vaultManager } = await loadFixture(fixture);
            const claimTime = (await time.latest()) + MAXTIME;
            await time.increaseTo(claimTime);
            await vaultManager.claimUnlockedLTAndLockForVeLT();
            await time.increase(MAXTIME);
            await vaultManager.withdrawLTWhenExpired();

            await vaultManager.setCanWithdrawByAnyone(true);
            await vaultManager.mintXLT(alice.address, 100);
            await expect(vaultManager.connect(alice).withdrawLT(owner.address, 100))
                .to.be.revertedWith("LightTeamVaultManager: invalid call");
        });

        it("withraw LT to 'to', and check 'ltWithdrew'", async function () {
            const { owner, alice, vaultManager, lt } = await loadFixture(fixture);
            const claimTime = (await time.latest()) + MAXTIME;
            await time.increaseTo(claimTime);
            await vaultManager.claimUnlockedLTAndLockForVeLT();
            await time.increase(MAXTIME);
            await vaultManager.withdrawLTWhenExpired();

            // if 'to' is address(0), withrew to msg.sender
            // first mint XLT to msg.sender and alice
            await vaultManager.mintXLT(owner.address, 100);
            await vaultManager.mintXLT(alice.address, 100);
            let balanceBefore = await lt.balanceOf(owner.address);
            await vaultManager.withdrawLT(ethers.constants.AddressZero, 100);
            expect(((await lt.balanceOf(owner.address))).sub(balanceBefore)).to.be.equal(100);

            await vaultManager.withdrawLT(alice.address, 100);
            expect(await lt.balanceOf(alice.address)).to.be.equal(100);
            expect(await vaultManager.ltWithdrew()).to.be.equal(200);
        });

        it("when 'canWithdrawByAnyone' is true, anyone can withdraw LT by burning certain XLT", async function () {
            const { alice, vaultManager, lt } = await loadFixture(fixture);
            const claimTime = (await time.latest()) + MAXTIME;
            await time.increaseTo(claimTime);
            await vaultManager.claimUnlockedLTAndLockForVeLT();
            await time.increase(MAXTIME);
            await vaultManager.withdrawLTWhenExpired();

            await vaultManager.setCanWithdrawByAnyone(true);
            await vaultManager.mintXLT(alice.address, 100);
            await vaultManager.connect(alice).withdrawLT(alice.address, 100);
            expect(await lt.balanceOf(alice.address)).to.be.equal(100);
        });
    });

    describe("withdrawStHOPE", async () => {
        async function prepareStHope() {
            const { owner, alice, vaultManager, hopeToken, feeDistributor, stakingHope } = await loadFixture(fixture);

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

            /// claim  fee
            await time.increase(WEEK);
            await vaultManager.claimFromFeeDistributor();
            return { owner, alice, vaultManager, stakingHope }
        }

        it("should be revert if caller is not owner", async function () {
            const { owner, alice, vaultManager, stakingHope } = await prepareStHope();
            // console.log(await stakingHope.balanceOf(vaultManager.address));

            await expect(vaultManager.connect(alice).withdrawStHOPE(alice.address, 100))
                .to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("should be revert if amount exceed withdrawable", async function () {
            const { owner, vaultManager, stakingHope } = await prepareStHope();
            let stHopeTotalClaimed = await vaultManager.stHopeTotalClaimed();
            let stHopeWithdrew = await vaultManager.stHopeWithdrew();
            let canWithdraw = stHopeTotalClaimed.sub(stHopeWithdrew);

            await expect(vaultManager.withdrawStHOPE(owner.address, canWithdraw.add(1)))
                .to.be.revertedWith("LightTeamVaultManager: insufficient rewards to Withraw");
        });

        it("withraw stHOPE to 'to', and check 'stHopeWithdrew'", async function () {
            const { owner, alice, vaultManager, stakingHope } = await prepareStHope();

            // if 'to' is address(0), withrew to msg.sender
            let balanceBefore = await stakingHope.balanceOf(owner.address);
            await vaultManager.withdrawStHOPE(ethers.constants.AddressZero, 100);
            expect(((await stakingHope.balanceOf(owner.address))).sub(balanceBefore)).to.be.equal(100);

            await vaultManager.withdrawStHOPE(alice.address, 100);
            expect(await stakingHope.balanceOf(alice.address)).to.be.equal(100);
            expect(await vaultManager.stHopeWithdrew()).to.be.equal(200);
        });
    });
});
