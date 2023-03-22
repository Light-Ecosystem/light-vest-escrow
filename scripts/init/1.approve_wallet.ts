import { ethers } from "hardhat";
import { Constants } from "../constant";
import { FileUtils } from "../file_utils";

async function main() {

    const  vaultManagerAddr =  FileUtils.getContractAddress(Constants.LIGHT_TEAM_VAULT_MANAGER);
    const teamVault = await ethers.getContractAt("LightTeamVault", FileUtils.getContractAddress(Constants.LIGHT_TEAM_VAULT));
    await teamVault.transferOwnership(vaultManagerAddr);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});