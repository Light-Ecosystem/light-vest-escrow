import { ethers, upgrades } from "hardhat";
import { Constants } from "../constant";
import { FileUtils } from "../file_utils";

async function main() {
    // important!!!,  set multiSig wallet first
    const MultiSigWallet = "0x6d78a6B8c32Bc4980bbE3b08e43F322235364670";
                            
    let ltAddress = FileUtils.getContractAddress(Constants.LT_TOKEN);
    let feeDistributorAddress = FileUtils.getContractAddress(Constants.FeeDistributor);
    let gaugeFeeDistributorAddress = FileUtils.getContractAddress(Constants.GaugeFeeDistributor);
    let stakingHopeAddress = FileUtils.getContractAddress(Constants.STAKING_HOPE_GAUGE);
    
    const LightTeamVault = await ethers.getContractFactory("LightTeamVault");
    const lightTeamVault = await upgrades.deployProxy(LightTeamVault, [ltAddress]);
    await lightTeamVault.deployed();
    console.log(`lightTeamVault deployed to ${lightTeamVault.address}`);

    // deploye Manager
    const VaultManager = await ethers.getContractFactory("LightTeamVaultManager");
    const vaultManager = await upgrades.deployProxy(VaultManager, [MultiSigWallet, lightTeamVault.address, feeDistributorAddress, gaugeFeeDistributorAddress, stakingHopeAddress]);
    await vaultManager.deployed();
    console.log(`vaultManager deployed to ${vaultManager.address}`);

    // transfer ownership from valut to manager

    // smartWalletWhitelist.approveWallet(vaultManager.address);

    // transfet 3000E LT to vault
}
  
// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });