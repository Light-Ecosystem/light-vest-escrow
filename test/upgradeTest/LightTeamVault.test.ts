import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import LT from "../build/LT.json";

const ONE = ethers.utils.parseEther("1");
const ONE_DAY = 86400; 
const WEEK = 7 * ONE_DAY; 
const MAXTIME = 208 * WEEK;
const LOCKED_AMOUNT = ethers.utils.parseEther("300000000000");
const UNLOCKED_PER_SECONDE = LOCKED_AMOUNT.div(208*7*86400);

describe("LightTeamVault", function () {
    async function fixture() {
        const [owner, alice] = await ethers.getSigners();
        const MockLT = await ethers.getContractFactory(LT.abi, LT.bytecode);
        const mockLT = await MockLT.deploy();
        await mockLT.deployed();
        await mockLT.initialize("LT", "LT");

        const LightTeamVault = await ethers.getContractFactory("LightTeamVault");
        const lightTeamVault = await upgrades.deployProxy(LightTeamVault, [mockLT.address]);
        await lightTeamVault.deployed();

        await mockLT.transfer(lightTeamVault.address, LOCKED_AMOUNT);
        await time.increase(WEEK);
        await lightTeamVault.claimTo(alice.address);

        // upgrade to V2
        const LightTeamVaultV2 = await ethers.getContractFactory("LightTeamVaultV2");
        const lightTeamVaultV2 = await upgrades.upgradeProxy(lightTeamVault.address, LightTeamVaultV2);

        // console.log(lightTeamVaultV2.address);
        // console.log(lightTeamVault.address);
        return { owner, alice, mockLT, lightTeamVaultV2 }
    }

    describe("getTotalUnlockedAmount", async () => {
        it("in V2, release token per seconds, can claim everytime", async function () {
            const { alice, mockLT, lightTeamVaultV2 } = await loadFixture(fixture); 
            expect(await lightTeamVaultV2.claimedAmount()).to.be.equal(await mockLT.balanceOf(alice.address));

            let amountBefore = await lightTeamVaultV2.getClaimableAmount();
            await time.increase(100);
            let amountNew = await lightTeamVaultV2.getClaimableAmount()
            expect(amountNew.sub(amountBefore)).to.equal(UNLOCKED_PER_SECONDE.mul(100));
        });
    });

    describe("setMockVaule", async () => {
        it("after set , new value should be right", async function () {
            const { lightTeamVaultV2 } = await loadFixture(fixture); 
            await lightTeamVaultV2.setMockVaule(1);
            expect(await lightTeamVaultV2.mockVaule()).to.equal(1);
        });
    });
});