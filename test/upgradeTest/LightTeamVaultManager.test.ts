import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import MockLT from "../build/LT.json";
import MockVotingEscrow from "../build/VotingEscrow.json";
import MockGaugeController from "../build/GaugeController.json";
import MockMinter from "../build/Minter.json";
import MockStakingHOPE from "../build/StakingHOPE.json";
import MockHOPE from "../build/HOPE.json";
import MockRestrictedList from "../build/RestrictedList.json";
import MockFeeDistributor from "../build/FeeDistributor.json";
import MockGaugeFeeDistributor from "../build/GaugeFeeDistributor.json";
import MockPermit2 from "../build/Permit2.json";
import MockSmartWalletWhitelist from "../build/SmartWalletWhitelist.json";

const ONE = ethers.utils.parseEther("1");
const ONE_DAY = 86400; 
const WEEK = 7 * ONE_DAY; 

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

        // upgrade vaultManager
        const VaultManagerV2 = await ethers.getContractFactory("LightTeamVaultManagerV2");
        const vaultManagerV2 = await upgrades.upgradeProxy(vaultManager.address, VaultManagerV2);
        // console.log(vaultManager.address);
        // console.log(vaultManagerV2.address);
        
        return { owner, alice, vaultManager, lightTeamVault,  veLT, lt, hopeToken, stakingHope, 
            gaugeController, permit2, gaugeFeeDistributor, feeDistributor, minter, vaultManagerV2 }
    }

    describe("claimUnlockedLTAndLockForVeLT", async () => {
        it("in V2, just increase the lock amount, do not increase end time", async function () {
            const { vaultManagerV2, veLT } = await loadFixture(fixture); 
            const claimTime = (await time.latest()) + ONE_DAY;
            await time.increaseTo(claimTime);
            await vaultManagerV2.claimUnlockedLTAndLockForVeLT();
            let end = (await veLT.locked(vaultManagerV2.address)).end;

            await time.increase(2*WEEK);
            await vaultManagerV2.claimUnlockedLTAndLockForVeLT();
            let endNew = (await veLT.locked(vaultManagerV2.address)).end;
            expect(end).to.be.equal(endNew);
        });
    });

    describe("setMockVaule", async () => {
        it("after set , new value should be right", async function () {
            const { vaultManagerV2 } = await loadFixture(fixture); 
            await vaultManagerV2.setMockVaule(1);
            expect(await vaultManagerV2.mockVaule()).to.equal(1);
        });
    });
});
