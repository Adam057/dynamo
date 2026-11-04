# DiscoveryRegistry BscScan source publication

Mainnet address: `0x017cf9f25d7dbb7eca7fe6d0f06f2598cb2bac54`

Deployment transaction: `0x37022a0a218c83a10474d5083f9664194a02704f537c546c378232ca4436c3bb`

The public BSC RPC confirms chain ID 56, a successful deployment receipt, the exact creation input hash `0x6097483b6487b3b54dcd5b4afbed722719af71713b81ec269527eccc3674c854`, and the deployed runtime hash `0x60b732df4dd9d33e1df1584e1694cff699415e20fdb333b35f57ad7837a58b7e`.

These bytecode checks do **not** publish or verify source on BscScan. The compiler input to submit is [`DiscoveryRegistry.standard-input.json`](./DiscoveryRegistry.standard-input.json). Use BscScan's Solidity Standard JSON Input verification with:

- Compiler: `v0.8.26+commit.8a97fa7a`
- Optimization: enabled, 200 runs
- EVM version: Paris
- Contract: `contracts/DiscoveryRegistry.sol:DiscoveryRegistry`
- Constructor arguments: none
- License: MIT

After submission, confirm that BscScan explicitly displays verified source for this address. Keep this status separate from the independently verified bytecode match.
