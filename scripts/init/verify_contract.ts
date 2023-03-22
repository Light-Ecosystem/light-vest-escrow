import {ethers, run, upgrades} from "hardhat";
import {FileUtils} from "../file_utils";
import {Constants} from "../constant";

async function main() {

  const lightTeamVaultAddr = FileUtils.getContractAddress(Constants.LIGHT_TEAM_VAULT);
  const vaultManagerAddr =  FileUtils.getContractAddress(Constants.LIGHT_TEAM_VAULT_MANAGER);
  await verifyContract(await upgrades.erc1967.getImplementationAddress(lightTeamVaultAddr), []);
  await verifyContract(await upgrades.erc1967.getImplementationAddress(vaultManagerAddr), []);
}

async function verifyContract(address: string, args: any) {
  try {
    console.log("Verifying contract...   ", address);
    await run("verify:verify", {
      address: address,
      constructorArguments: args
    });
  } catch (err: any) {
    if (err.toString().includes("Contract source code already verified")) {
      console.log(" Contract source code already verified");
    } else {
      console.log(err);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});