import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

const ONE_ETHER = ethers.utils.parseEther("1");
const LOCKED_AMOUNT = ethers.utils.parseEther("300000000000");
const UNLOCKE_AMOUNT_PER_DAY = LOCKED_AMOUNT.div(208*7).div(ONE_ETHER);
const DAY = 24 * 60 * 60;

describe("LightTeamVault", function () {
    async function fixture() {
        const MockLT = await ethers.getContractFactory("MyToken");
        const mockLT = await upgrades.deployProxy(MockLT, ["Mock LT", "MockLT", LOCKED_AMOUNT, 18]);

        const LightTeamVault = await ethers.getContractFactory("LightTeamVault");
        const lightTeamVault = await upgrades.deployProxy(LightTeamVault, [mockLT.address]);
        await lightTeamVault.deployed();

        await mockLT.transfer(lightTeamVault.address, LOCKED_AMOUNT);
        return {mockLT, lightTeamVault}
    }

    it("Should holding a certain quantity of LT", async function () {
        const { mockLT, lightTeamVault } = await loadFixture(fixture);
        expect(await mockLT.balanceOf(lightTeamVault.address)).to.equal(LOCKED_AMOUNT);
    });

    it("within a day, the claimable amount should be right", async function () {
        const { lightTeamVault } = await loadFixture(fixture);
        const claimTime = (await time.latest()) + DAY;
        await time.increaseTo(claimTime);

        const claimableAmount = await lightTeamVault.getClaimableAmount();
        expect(claimableAmount.div(ONE_ETHER)).to.equal(UNLOCKE_AMOUNT_PER_DAY);
    })

    it("11 days later , the claimable amount should be right", async function () {
        const { lightTeamVault } = await loadFixture(fixture);
        const HOURS_IN_SECONDES = 11 * DAY;
        const claimTime = (await time.latest()) + HOURS_IN_SECONDES;
        await time.increaseTo(claimTime);

        const claimableAmount = await lightTeamVault.getClaimableAmount();
        expect(claimableAmount.div(ONE_ETHER)).to.equal(UNLOCKE_AMOUNT_PER_DAY.mul(11));
    })

    it("208 weeks later, the unlocked amount should be right", async function () {
        const { lightTeamVault } = await loadFixture(fixture);
        const claimTime = (await time.latest()) + 208 * 7 * DAY;
        await time.increaseTo(claimTime);
        const claimableAmount = await lightTeamVault.getClaimableAmount();
        expect(claimableAmount.div(ONE_ETHER)).to.equal(LOCKED_AMOUNT.div(ONE_ETHER).sub(1));
    })

    it("after claim, claimed amount and balaceOf 'to' should be right", async function () {
        const { mockLT, lightTeamVault } = await loadFixture(fixture);
        const claimTime = (await time.latest()) + 2 * DAY;
        await time.increaseTo(claimTime);

        const otherAccount = (await ethers.getSigners())[1];
        await lightTeamVault.claimTo(otherAccount.address);
        let bal = (await mockLT.balanceOf(otherAccount.address)).div(ONE_ETHER);
        expect(bal).to.equal(UNLOCKE_AMOUNT_PER_DAY.mul(2));
        expect((await lightTeamVault.claimedAmount()).div(ONE_ETHER)).to.equal(bal);
    })

    it("should revert if caller was not owner", async function () {
        const { lightTeamVault } = await loadFixture(fixture);
        const claimTime = (await time.latest()) + DAY;
        await time.increaseTo(claimTime);

        const otherAccount = (await ethers.getSigners())[1];
        await expect(lightTeamVault.connect(otherAccount)
            .claimTo(otherAccount.address)).to.be.revertedWith(
            "Ownable: caller is not the owner")
    });

    it("should revert if the claim interval less than 1 day", async function () {
        const { lightTeamVault } = await loadFixture(fixture);
        const claimTime = (await time.latest()) + DAY;
        await time.increaseTo(claimTime);
        const [owner,] = await ethers.getSigners();
        await lightTeamVault.claimTo(owner.address);
        await time.increase(DAY - 4);
        await expect(lightTeamVault.claimTo(owner.address))
            .to.be.revertedWith("LightTeamVault: claim interval must gt one day");
    });
});