import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectWallet, ensureBscMainnet, registryConfigured } from '../lib/chain';

afterEach(() => vi.unstubAllGlobals());

describe('wallet adapter with a mocked EIP-1193 provider', () => {
  it('keeps publishing unavailable without a real registry address', () => {
    expect(registryConfigured).toBe(false);
  });

  it('connects an account and reports rejected requests', async () => {
    const account = '0x1234567890123456789012345678901234567890';
    vi.stubGlobal('window', { ethereum: { request: vi.fn().mockResolvedValue([account]) } });
    expect(await connectWallet()).toBe(account);
    vi.stubGlobal('window', { ethereum: { request: vi.fn().mockRejectedValue(new Error('User rejected request')) } });
    await expect(connectWallet()).rejects.toThrow('User rejected request');
    vi.stubGlobal('window', {});
    await expect(connectWallet()).rejects.toThrow('No EVM wallet found');
  });

  it('detects the wrong chain and requests BSC mainnet switching', async () => {
    let chain = '0x1';
    const request = vi.fn(async ({method}: {method:string}) => {
      if (method === 'eth_chainId') return chain;
      if (method === 'wallet_switchEthereumChain') { chain = '0x38'; return null; }
      throw new Error('Unexpected wallet method');
    });
    const status = vi.fn();
    await ensureBscMainnet({request}, status);
    expect(request).toHaveBeenCalledWith({method:'wallet_switchEthereumChain',params:[{chainId:'0x38'}]});
    expect(status).toHaveBeenCalledOnce();
  });

  it('rejects a switch that leaves the wallet on the wrong chain', async () => {
    const request = vi.fn(async ({method}: {method:string}) => method === 'eth_chainId' ? '0x1' : null);
    await expect(ensureBscMainnet({request}, vi.fn())).rejects.toThrow('not on BNB Smart Chain');
  });
});
