import { afterEach, describe, expect, it, vi } from 'vitest';
import { encodeAbiParameters, encodeEventTopics, parseAbiItem } from 'viem';
import { connectWallet, discoveryIdFromReceipt, ensureBscMainnet, registryConfigured, subscribeWallet } from '../lib/chain';

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

  it('tracks account and chain changes and removes listeners on disconnect', () => {
    const listeners = new Map<string,(value:any)=>void>();
    const removeListener=vi.fn((event:string) => listeners.delete(event));
    vi.stubGlobal('window', {ethereum:{on:(event:string,handler:(value:any)=>void)=>listeners.set(event,handler),removeListener}});
    const accounts=vi.fn(),chain=vi.fn();
    const unsubscribe=subscribeWallet(accounts,chain);
    listeners.get('accountsChanged')?.(['0x1234']);
    listeners.get('accountsChanged')?.([]);
    listeners.get('chainChanged')?.('0x38');
    expect(accounts).toHaveBeenNthCalledWith(1,['0x1234']);
    expect(accounts).toHaveBeenNthCalledWith(2,[]);
    expect(chain).toHaveBeenCalledWith(56);
    unsubscribe();
    expect(removeListener).toHaveBeenCalledTimes(2);
    expect(listeners.size).toBe(0);
  });

  it('decodes registration from receipt logs without eth_getLogs', () => {
    const registry='0x1234567890123456789012345678901234567890' as const;
    const creator='0x9876543210987654321098765432109876543210' as const;
    const event=parseAbiItem('event DiscoveryRegistered(uint256 indexed id, address indexed creator, uint256 indexed parentId, bytes32 modelHash)');
    const topics=encodeEventTopics({abi:[event],eventName:'DiscoveryRegistered',args:{id:BigInt(7),creator,parentId:BigInt(0)}});
    const data=encodeAbiParameters([{type:'bytes32'}],['0x'+'ab'.repeat(32) as `0x${string}`]);
    expect(discoveryIdFromReceipt({logs:[{address:registry,topics,data} as any]},registry)).toBe(7);
    expect(()=>discoveryIdFromReceipt({logs:[]},registry)).toThrow('event was not found');
  });
});
