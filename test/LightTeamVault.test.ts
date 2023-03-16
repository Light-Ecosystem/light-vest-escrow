import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import LT from "./build/LT.json";

const ONE = ethers.utils.parseEther("1");
const ONE_DAY = 86400; 
const WEEK = 7 * ONE_DAY; 
const MAXTIME = 208 * WEEK;
const LOCKED_AMOUNT = ethers.utils.parseEther("300000000000");
const UNLOCK_PER_DAY = LOCKED_AMOUNT.div(208*7);

describe("LightTeamVault", function () {
    async function fixture() {
        const MockLT = await ethers.getContractFactory(LT.abi, LT.bytecode);
        const mockLT = await MockLT.deploy();
        await mockLT.deployed();
        await mockLT.initialize("LT", "LT");

        const LightTeamVault = await ethers.getContractFactory("LightTeamVault");
        const lightTeamVault = await upgrades.deployProxy(LightTeamVault, [mockLT.address]);
        await lightTeamVault.deployed();

        await mockLT.transfer(lightTeamVault.address, LOCKED_AMOUNT);
        const [owner, alice] = await ethers.getSigners();
        return { owner, alice, mockLT, lightTeamVault }
    }

    describe("claimTo", async () => {
        it("should be revert if caller is not owner", async function () {
            const { alice, lightTeamVault } = await loadFixture(fixture); 
            const claimTime = (await time.latest()) + ONE_DAY;
            await time.increaseTo(claimTime);

            await expect(lightTeamVault.connect(alice).claimTo(alice.address))
            .to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("should be revert if 'to' is address(0)", async function () {
            const { lightTeamVault } = await loadFixture(fixture); 
            const claimTime = (await time.latest()) + ONE_DAY;
            await time.increaseTo(claimTime);

            await expect(lightTeamVault.claimTo(ethers.constants.AddressZero))
            .to.be.revertedWith("LightTeamVault: zero address");
        });

        it("should be revert if claim interval less than 1 day", async function () {
            const { owner, lightTeamVault } = await loadFixture(fixture); 
            const claimTime = (await time.latest()) + ONE_DAY;
            await time.increaseTo(claimTime);

            await lightTeamVault.claimTo(owner.address);
            await time.increase(60 * 60);

            await expect(lightTeamVault.claimTo(ethers.constants.AddressZero))
            .to.be.revertedWith("LightTeamVault: zero address");
        });

        it("after claim, the balanceOf should be right ", async function () {
            const { owner, alice, lightTeamVault, mockLT } = await loadFixture(fixture); 
            const claimTime = (await time.latest()) + ONE_DAY;
            await time.increaseTo(claimTime);

            await lightTeamVault.claimTo(alice.address);
            expect(await mockLT.balanceOf(alice.address)).to.equal(UNLOCK_PER_DAY);

            await time.increase(ONE_DAY);
            await lightTeamVault.claimTo(alice.address);
            expect(await lightTeamVault.claimedAmount()).to.equal(UNLOCK_PER_DAY.mul(2));
            expect(await lightTeamVault.lastClaimedTime()).to.equal(await time.latest());
        });
    });

    describe("getTotalUnlockedAmount", async () => {
        it("within a day , the unlocked amount should zero", async function () {
            const { lightTeamVault } = await loadFixture(fixture); 
            const startTime = await lightTeamVault.startTime();
            await time.increaseTo(startTime.add(ONE_DAY).sub(1));

            expect(await lightTeamVault.getTotalUnlockedAmount()).to.equal(0);
        });

        it("the unlocked amount should right", async function () {
            const { lightTeamVault } = await loadFixture(fixture); 
            const claimTime = (await time.latest()) + ONE_DAY;
            await time.increaseTo(claimTime);
            
            expect(await lightTeamVault.getTotalUnlockedAmount()).to.equal(UNLOCK_PER_DAY);

            await time.increase(ONE_DAY);
            expect(await lightTeamVault.getTotalUnlockedAmount()).to.equal(UNLOCK_PER_DAY.mul(2));
        });

        it("208 weeks later, the unlocked amount should right", async function () {
            const { lightTeamVault } = await loadFixture(fixture); 
            const claimTime = (await time.latest()) + MAXTIME;
            await time.increaseTo(claimTime);
            
            expect((await lightTeamVault.getTotalUnlockedAmount()).div(ONE)).to.equal(LOCKED_AMOUNT.div(ONE).sub(1));
        });
    });

    describe("getClaimableAmount", async () => {
        it("if not claim, the claimable amount should be equal to unloced amount", async function () {
            const { lightTeamVault } = await loadFixture(fixture); 
            const claimTime = (await time.latest()) + ONE_DAY;
            await time.increaseTo(claimTime);

            // let claimedAmount = await lightTeamVault.claimedAmount();
            expect(await lightTeamVault.getClaimableAmount()).to.equal(UNLOCK_PER_DAY);
        });

        it("after claim, the claimedAmount amount should be right", async function () {
            const { owner, lightTeamVault } = await loadFixture(fixture); 
            const claimTime = (await time.latest()) + ONE_DAY;
            await time.increaseTo(claimTime);

            await lightTeamVault.claimTo(owner.address);
            let claimedAmount = await lightTeamVault.claimedAmount();
            expect(claimedAmount).to.equal(UNLOCK_PER_DAY);

            await time.increase(ONE_DAY);
            await lightTeamVault.claimTo(owner.address);
            claimedAmount = await lightTeamVault.claimedAmount();
            expect(claimedAmount).to.equal(UNLOCK_PER_DAY.mul(2));
        });
    });
});