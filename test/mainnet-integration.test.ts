import { describe, expect, it } from 'vitest';
import { commitments, abi } from '../lib/chain';
import { datasetFor, fitSindy } from '../lib/science';
import artifact from '../lib/registry-deployment-artifact.json';

describe('mainnet registry integration', () => {
  it('uses the exact compiled contract ABI, including relationship and verification functions', () => {
    expect(abi).toEqual(artifact.abi);
    const names = abi.map(item => 'name' in item ? item.name : undefined);
    expect(names).toContain('registerDiscovery');
    expect(names).toContain('registerImprovement');
    expect(names).toContain('submitVerification');
    expect(names).toContain('getDiscovery');
    expect(names).toContain('getDiscoveryCount');
    expect(names).toContain('DiscoveryRegistered');
    expect(names).toContain('VerificationSubmitted');
  });

  it('commits to fitted model and full dataset without including raw rows in the commitment', () => {
    const data = datasetFor('logistic');
    const fit = fitSindy(data, 'time', ['population'], 2, .05);
    const first = commitments(fit, data);
    expect(commitments(fit, data)).toEqual(first);
    expect(Object.values(first).every(value => /^0x[0-9a-f]{64}$/.test(value))).toBe(true);
    const edited = { ...data, rows: data.rows.map(row => [...row]) };
    edited.rows[0][1] += .001;
    expect(commitments(fit, edited).datasetHash).not.toBe(first.datasetHash);
    expect(commitments(fit, edited).modelHash).toBe(first.modelHash);
  });
});
