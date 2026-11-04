import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { DEPLOYER_ADDRESS, deploymentGasLimit, deploymentReadiness, registryArtifact, validateArtifact } from '../lib/registry-deployment';

const ready = {
  walletAddress: DEPLOYER_ADDRESS,
  walletChainId: 56,
  rpcChainId: 56,
  balance: BigInt('586943231251754'),
  gasEstimate: BigInt(387510),
  gasPrice: BigInt(50000000),
};

describe('mainnet deployment preflight', () => {
  it('matches the tested artifact and has no constructor', () => {
    expect(validateArtifact()).toEqual([]);
    expect(registryArtifact.abi.some(item => item.type === 'constructor')).toBe(false);
    expect(registryArtifact.creationHash).toBe('0x6097483b6487b3b54dcd5b4afbed722719af71713b81ec269527eccc3674c854');
    const input = JSON.parse(readFileSync(new URL('../deployment/DiscoveryRegistry.standard-input.json', import.meta.url), 'utf8'));
    const solc = require('solc');
    const built = JSON.parse(solc.compile(JSON.stringify(input))).contracts['contracts/DiscoveryRegistry.sol'].DiscoveryRegistry;
    expect(registryArtifact.abi).toEqual(built.abi);
    expect(registryArtifact.bytecode).toBe(`0x${built.evm.bytecode.object}`);
    expect(registryArtifact.deployedBytecode).toBe(`0x${built.evm.deployedBytecode.object}`);
    const source = readFileSync(new URL('../contracts/DiscoveryRegistry.sol', import.meta.url));
    expect(registryArtifact.sourceSha256).toBe(createHash('sha256').update(source).digest('hex'));
  }, 20_000);

  it('enables deployment only when wallet, chains, balance, and gas checks pass', () => {
    expect(deploymentReadiness(ready)).toEqual([]);
    expect(deploymentReadiness({...ready,walletAddress:'0x1234567890123456789012345678901234567890'})).toContain('Connect the funded deployment wallet.');
    expect(deploymentReadiness({...ready,walletChainId:1})).toContain('MetaMask must be on BNB Smart Chain mainnet (chain ID 56).');
    expect(deploymentReadiness({...ready,rpcChainId:1})).toContain('Public RPC must report chain ID 56.');
    expect(deploymentReadiness({...ready,balance:BigInt(0)})).toContain('Insufficient BNB for the gas limit with a 20% margin.');
    expect(deploymentReadiness({...ready,gasEstimate:undefined})).toContain('A fresh deployment gas estimate is required.');
  });

  it('adds a 20% gas-limit margin', () => {
    expect(deploymentGasLimit(BigInt(387510))).toBe(BigInt(465012));
  });
});
