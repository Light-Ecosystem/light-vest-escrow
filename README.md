# Overview

The allocation ratio of LT Token is as follows:

- 60% to community liquidity providers
- 30% to shareholders (team and investors) with 1 year cliff and 4 years vesting
- 5% to the treasury reserve
- 5% to HOPE Foundation (grants)

Except for the part used for mining, the rest are all mined at one time when the LT Token contract is released, and transferred to specific contracts for asset management. The management contract methods are as follows:

- Treasury Reserve: Managed by CA, the early management authority is managed by the founding team, and the authority is transferred to the community governance contract for management before the second quarter of 2023. The rules for the use of funds are also clearly stipulated through the governance contract.
- Grants: Managed by CA, the early management rights are managed by the founding team and transferred to the HOPE Foundation for management before the third quarter of 2023. This part of the funds is mainly used for the incentive of the ecological external cooperation team.
- Shareholders (team and investors): The private key of the relevant management contract is held by the founding team in the early stage, and will be transferred to the relevant control contract after product packaging before Q4 2023.

## Team and Investors

Some Light Tokens held by Shareholders (team and investors) are mined to the corresponding management contract (Light Team Vault) at one time after the contract is deployed. Light Team Vault has the following functions:

- The initial lock-in time is 208 weeks.
- Unlock a fixed number of Light Tokens at zero point per day (UTC). The calculation formula for the daily unlocking quantity is: $$$$\frac{Total Locked Amount}{208 *7} $$$$, substitute the Total Locked Amount data 300 billion, and the specific unlocking quantity per day is about 206,043,956.044 Light Tokens.
- Unlocked LT can only be extracted by an authorized Light Team Vault Manager (CA)
    - Only one Light Team Vault Manager can exist
    - Subsequent processing rules for extracted LT are defined by Light Team Vault Manager
    - The interval between each withdrawal cannot be less than 1 day, and the first withdrawal is not limited by this rule (that is, the first withdrawal can be carried out at 0:00 UTC the day after the contract is deployed).

### Lighting Team Vault Manager

The unlocked LT operation defined by the Vault Manager can be initiated by anyone (but usually the team periodically initiates the operation), and the behavior remains consistent regardless of who initiates the operation.

The key elements of Vault Manager are as follows:

- Each time the LT is withdrawn, it will be immediately stored in the Voting Escrow contract for locking, and the length of each locking is 4 years (both increase the number and increase the time)
- After each LT extraction, the Vault Manager publishes the same number of XLT tokens, and the allocation of XLT is determined by a centralized decision-making mechanism .
- Ownership and usage of veLT are vested in the Vault Manager contract (owner control).
- Vault Manager holds veLT and the income obtained is owned by the operating company, which does not belong to the holder of XLT .
- The LT Token obtained by Vault Manager holding stHOPE does not participate in hedging, and the operating company decides the allocation mechanism.

## Treasury Reserve

Some of the Light Token contracts held by Treasury Reserve will be mined to the corresponding management contract (Light Treasury Vault) at one time after deployment. In the early days, the Light Treasury Vault was managed by the founding team using multi-signature contracts, and it will be managed by the community governance contract before Q3 2023.

### Treasury treatment rules

Voted by the community

## Grants

Some Light Token contracts held by Grants are mined to the corresponding management contract (Hope Foundation Vault) at one time after deployment. In the early days, Hope Foundation Vault was managed by the founding team using multi-signature contracts.

### Rules of Handling Grants

After the community publicity, the Hope Foundation decides the right to use it.

# Testing and Development

## Dependencies

1. **[Node.js](****https://github.com/nodejs/release#release-schedule****)**
2. **[Yarn](****https://github.com/yarnpkg/yarn****)**
3. **Git**

## Setup

To get started, make sure you have installed git, node, yarn and other dependent packages. Next, clone the repo and install the developer dependencies:

```TypeScript
git clone https://github.com/Light-Ecosystem/light-dao.git
cd light-dao
# copy and update .env.ts file
cp .env.example .env
yarn
```

### Running the Tests

To run the entire tests

```TypeScript
yarn hardhat test
```

### Deployment

```TypeScript
 # sepolia, goerli or others
 sh ./scripts/deploy.sh sepolia xxx
```

# Audits and Security

Light DAO contracts have been audited by  SlowMist and Certic. These audit reports are made available on the [Audit](https://github.com/Light-Ecosystem/light-dao/tree/main/audit).

There is also an active [bug bounty](https://static.hope.money/bug-bounty.html) for issues which can lead to substantial loss of money, critical bugs such as a broken live-ness condition, or irreversible loss of funds.

# Community

If you have any questions about this project, or wish to engage with us:

- [Websites](https://hope.money/)
- [Medium](https://hope-ecosystem.medium.com/)
- [Twitter](https://twitter.com/hope_ecosystem)
- [Discord](https://discord.com/invite/hope-ecosystem)

# License

This project is licensed under the [AGPL-3.0]](LICENSE) license.