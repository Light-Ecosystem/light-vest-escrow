import {ethers, upgrades} from "hardhat";
import {Constants} from "../constant";
import {FileUtils} from "../file_utils";

async function main() {
    // important!!!,  set multiSig wallet first
    // todo
    const MultiSigWallet = "";

    let ltAddress = FileUtils.getContractAddress(Constants.LT_TOKEN);
    let feeDistributorAddress = FileUtils.getContractAddress(Constants.FeeDistributor);
    let gaugeFeeDistributorAddress = FileUtils.getContractAddress(Constants.GaugeFeeDistributor);
    let stakingHopeAddress = FileUtils.getContractAddress(Constants.STAKING_HOPE_GAUGE);

    // deploy TeamVault
    const LightTeamVault = await ethers.getContractFactory("LightTeamVault");
    const lightTeamVault = await upgrades.deployProxy(LightTeamVault, [ltAddress]);
    await lightTeamVault.deployed();
    await printLightTeamVault(lightTeamVault);
    FileUtils.saveFrontendFiles(lightTeamVault.address, "LightTeamVault", Constants.LIGHT_TEAM_VAULT);

    // deploy  Manager
    const VaultManager = await ethers.getContractFactory("LightTeamVaultManager");
    const vaultManager = await upgrades.deployProxy(VaultManager, [MultiSigWallet, lightTeamVault.address, feeDistributorAddress, gaugeFeeDistributorAddress, stakingHopeAddress]);
    await vaultManager.deployed()
    await printVaultManager(vaultManager)
    FileUtils.saveFrontendFiles(vaultManager.address, "LightTeamVaultManager", Constants.LIGHT_TEAM_VAULT_MANAGER);

    // print XLT address
    let manger = await VaultManager.attach(vaultManager.address);
    let xlt = await manger.xlt();
    console.log("XLT: ", xlt)
    FileUtils.saveFrontendFiles(xlt, "XLT", Constants.XLT);
}

async function printLightTeamVault(token: any) {
    console.log("TeamVault-ProxyAddress", token.address)
    console.log("TeamVault-LogicAddress", await upgrades.erc1967.getImplementationAddress(token.address))
    console.log("ProxyAdminAddress", await upgrades.erc1967.getAdminAddress(token.address))
}
async function printVaultManager(token: any) {
    console.log("VaultManager-ProxyAddress", token.address)
    console.log("VaultManager-LogicAddress", await upgrades.erc1967.getImplementationAddress(token.address))
    console.log("ProxyAdminAddress", await upgrades.erc1967.getAdminAddress(token.address))
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});