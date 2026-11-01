# DYNAMO mainnet deployment checklist

Source: `contracts/DiscoveryRegistry.sol` at commit `214823d2edb67f66c65592f5cec62ab14509c919`.
SHA-256: `E2502D10F0ED2650869F568647BE6FDFA35E0CE1BB306D2BE313C2E8CB7F2CD3`.
The contract has no imports or constructor arguments.

The reproducible compiler input is `DiscoveryRegistry.standard-input.json`. It recompiles to the same creation bytecode as the tested Hardhat artifact.
Expected creation bytecode Keccak-256: `0x6097483b6487b3b54dcd5b4afbed722719af71713b81ec269527eccc3674c854`.
Expected runtime bytecode Keccak-256: `0x60b732df4dd9d33e1df1584e1694cff699415e20fdb333b35f57ad7837a58b7e`.

In the official Remix IDE at `https://remix.ethereum.org/`:

1. Import the exact source file from this repository into the file explorer.
2. Select Solidity `0.8.26+commit.8a97fa7a`.
3. Enable optimization with **200 runs** and set EVM version to **Paris**.
4. Compile `DiscoveryRegistry.sol` and select `DiscoveryRegistry` in Deploy & Run.
5. Choose the browser wallet environment. Confirm **BNB Smart Chain mainnet, chain ID 56**, and account `0xd69D2db73D16fDA767C29219C27707A791B723DE` in MetaMask and Remix.
6. Confirm constructor arguments are empty and transaction value is **0 BNB**. Review Remix's fresh gas estimate and MetaMask's total fee before confirming.

**Do not broadcast until the user explicitly approves the specific transaction.** The user must review and confirm the MetaMask transaction themselves. No private key or recovery phrase belongs in Remix or this repository.

After deployment, save the contract address and transaction hash. Use BscScan's Solidity Standard JSON Input verification with the included JSON file, compiler `0.8.26`, optimization enabled, 200 runs, and EVM Paris. Compare deployed runtime bytecode, then read `getDiscoveryCount()` through BscScan or public BSC RPC before adding the address to the frontend.
