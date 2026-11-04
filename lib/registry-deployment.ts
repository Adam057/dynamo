import { isAddressEqual, keccak256, type Address, type Hex } from 'viem';
import artifact from './registry-deployment-artifact.json';

export const DEPLOYER_ADDRESS = '0xd69D2db73D16fDA767C29219C27707A791B723DE' as Address;
export const BSC_MAINNET_RPC = 'https://bsc-dataseed.bnbchain.org';
export const registryArtifact = artifact;
export const EXPECTED_CREATION_HASH = '0x6097483b6487b3b54dcd5b4afbed722719af71713b81ec269527eccc3674c854';
export const EXPECTED_RUNTIME_HASH = '0x60b732df4dd9d33e1df1584e1694cff699415e20fdb333b35f57ad7837a58b7e';

export function validateArtifact(): string[] {
  const problems: string[] = [];
  if (artifact.contractName !== 'DiscoveryRegistry') problems.push('Unexpected contract name.');
  if (artifact.compiler !== '0.8.26+commit.8a97fa7a.Emscripten.clang') problems.push('Compiler version does not match the tested build.');
  if (!artifact.optimizer.enabled || artifact.optimizer.runs !== 200 || artifact.evmVersion !== 'paris') problems.push('Compiler settings do not match the tested build.');
  if (artifact.abi.some(item => item.type === 'constructor')) problems.push('Unexpected constructor arguments.');
  if (keccak256(artifact.bytecode as Hex) !== EXPECTED_CREATION_HASH) problems.push('Creation bytecode does not match the tested artifact.');
  if (keccak256(artifact.deployedBytecode as Hex) !== EXPECTED_RUNTIME_HASH) problems.push('Runtime bytecode does not match the tested artifact.');
  return problems;
}

export type DeploymentChecks = {
  walletAddress?: Address;
  walletChainId?: number;
  rpcChainId?: number;
  balance?: bigint;
  gasEstimate?: bigint;
  gasPrice?: bigint;
};

export function deploymentReadiness(checks: DeploymentChecks): string[] {
  const problems = validateArtifact();
  if (!checks.walletAddress || !isAddressEqual(checks.walletAddress, DEPLOYER_ADDRESS)) problems.push('Connect the funded deployment wallet.');
  if (checks.walletChainId !== 56) problems.push('MetaMask must be on BNB Smart Chain mainnet (chain ID 56).');
  if (checks.rpcChainId !== 56) problems.push('Public RPC must report chain ID 56.');
  if (!checks.gasEstimate || checks.gasEstimate <= BigInt(0)) problems.push('A fresh deployment gas estimate is required.');
  if (!checks.gasPrice || checks.gasPrice <= BigInt(0)) problems.push('A fresh gas price is required.');
  if (checks.balance === undefined) problems.push('A fresh BNB balance is required.');
  if (checks.balance !== undefined && checks.gasEstimate && checks.gasPrice && checks.balance < deploymentGasLimit(checks.gasEstimate) * checks.gasPrice) problems.push('Insufficient BNB for the gas limit with a 20% margin.');
  return problems;
}

export function deploymentGasLimit(estimate: bigint): bigint {
  return estimate + (estimate + BigInt(4)) / BigInt(5);
}
