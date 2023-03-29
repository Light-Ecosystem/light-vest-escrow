#!bin/sh

echo 'begin to deploy all lt dao contract...........\n\n'

_netwrok=$1

echo "deploy lightTeamVaultManager_______________"
yarn hardhat run scripts/lightTeamVaultManager/deploy_vaultManager.ts --network $_netwrok
echo "deploy deploy_vaultManager\n"


echo 'end to deploy all lt dao contract.............'