import { ethers, upgrades } from "hardhat";
import { Constants } from "../constant";
import { FileUtils } from "../file_utils";

async function main() {
    // important!!!,  set multiSig wallet first
    // todo
    const MultiSigWallet = "";
                            
    let ltAddress = FileUtils.getContractAddress(Constants.LT_TOKEN);
    let feeDistributorAddress = FileUtils.getContractAddress(Constants.FeeDistributor);
    let gaugeFeeDistributorAddress = FileUtils.getContractAddress(Constants.GaugeFeeDistributor);
    let stakingHopeAddress = FileUtils.getContractAddress(Constants.STAKING_HOPE_GAUGE);
    
    const LightTeamVault = await ethers.getContractFactory("LightTeamVault");
    const lightTeamVault = await upgrades.deployProxy(LightTeamVault, [ltAddress]);
    await lightTeamVault.deployed();
    console.log(`lightTeamVault deployed to ${lightTeamVault.address}`);
    FileUtils.saveFrontendFiles(lightTeamVault.address, "LightTeamVault", Constants.LIGHT_TEAM_VAULT);


    // deploye Manager
    const VaultManager = await ethers.getContractFactory("LightTeamVaultManager");
    const vaultManager = await upgrades.deployProxy(VaultManager, [MultiSigWallet, lightTeamVault.address, feeDistributorAddress, gaugeFeeDistributorAddress, stakingHopeAddress]);
    await vaultManager.deployed();
    console.log(`vaultManager deployed to ${vaultManager.address}`);
    FileUtils.saveFrontendFiles(vaultManager.address, "LightTeamVaultManager", Constants.LIGHT_TEAM_VAULT_MANAGER);
}
  
// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });