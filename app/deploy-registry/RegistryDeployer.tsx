'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPublicClient, createWalletClient, custom, formatEther, formatGwei, http, isAddressEqual, keccak256, type Abi, type Address, type EIP1193Provider, type Hex } from 'viem';
import { bsc } from 'viem/chains';
import { BSC_MAINNET_RPC, DEPLOYER_ADDRESS, EXPECTED_RUNTIME_HASH, deploymentGasLimit, deploymentReadiness, registryArtifact, type DeploymentChecks } from '@/lib/registry-deployment';
import styles from './deploy.module.css';

type BrowserProvider = EIP1193Provider & {
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
};

const publicClient = createPublicClient({chain: bsc, transport: http(BSC_MAINNET_RPC, {retryCount: 2})});
const abi = registryArtifact.abi as Abi;
const bytecode = registryArtifact.bytecode as Hex;

function provider(): BrowserProvider | undefined {
  return (window as Window & {ethereum?: BrowserProvider}).ethereum;
}

function describeError(error: unknown): string {
  const candidate = error as {code?: number; shortMessage?: string; message?: string};
  if (candidate?.code === 4001 || /user rejected|user denied/i.test(candidate?.message ?? '')) return 'MetaMask request rejected. No transaction was sent.';
  if (/insufficient funds/i.test(candidate?.message ?? '')) return 'Insufficient BNB for deployment gas. No transaction was sent.';
  return candidate?.shortMessage ?? candidate?.message ?? String(error);
}

export default function RegistryDeployer() {
  const [hasProvider, setHasProvider] = useState(false);
  const [checks, setChecks] = useState<DeploymentChecks>({});
  const [checking, setChecking] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [hash, setHash] = useState<Hex>();
  const [deployedAddress, setDeployedAddress] = useState<Address>();
  const [gasUsed, setGasUsed] = useState<bigint>();

  const refresh = useCallback(async (): Promise<DeploymentChecks> => {
    const p = provider();
    setHasProvider(Boolean(p));
    if (!p) { setChecks({}); return {}; }
    setChecking(true);
    setError('');
    try {
      const [rawAccounts, rawChainId, rpcChainId] = await Promise.all([
        p.request({method: 'eth_accounts'}),
        p.request({method: 'eth_chainId'}),
        publicClient.getChainId(),
      ]);
      const walletAddress = (rawAccounts as Address[])[0];
      const walletChainId = Number(rawChainId);
      const next: DeploymentChecks = {walletAddress, walletChainId, rpcChainId};
      if (walletAddress && isAddressEqual(walletAddress, DEPLOYER_ADDRESS) && walletChainId === 56 && rpcChainId === 56) {
        const [balance, gasEstimate, gasPrice] = await Promise.all([
          publicClient.getBalance({address: walletAddress}),
          publicClient.estimateGas({account: walletAddress, data: bytecode}),
          publicClient.getGasPrice(),
        ]);
        Object.assign(next, {balance, gasEstimate, gasPrice});
      }
      setChecks(next);
      return next;
    } catch (cause) {
      setChecks({});
      setError(`Preflight failed: ${describeError(cause)}`);
      return {};
    } finally { setChecking(false); }
  }, []);

  useEffect(() => {
    void refresh();
    const p = provider();
    if (!p?.on) return;
    const changed = () => { setChecks({}); void refresh(); };
    p.on('accountsChanged', changed);
    p.on('chainChanged', changed);
    return () => { p.removeListener?.('accountsChanged', changed); p.removeListener?.('chainChanged', changed); };
  }, [refresh]);

  async function connect() {
    const p = provider();
    if (!p) { setError('MetaMask or a compatible browser wallet is not available.'); return; }
    setError('');
    try { await p.request({method: 'eth_requestAccounts'}); await refresh(); }
    catch (cause) { setError(describeError(cause)); }
  }

  async function switchToBsc() {
    const p = provider();
    if (!p) return;
    setError('');
    try { await p.request({method: 'wallet_switchEthereumChain', params: [{chainId: '0x38'}]}); await refresh(); }
    catch (cause) { setError(`Network switch failed: ${describeError(cause)}`); }
  }

  async function deploy() {
    if (sending || deployedAddress) return;
    setSending(true);
    setError('');
    setStatus('Rechecking wallet, chain, balance, bytecode, and gas…');
    try {
      const latest = await refresh();
      const problems = deploymentReadiness(latest);
      if (problems.length) throw new Error(problems.join(' '));
      const p = provider();
      if (!p || !latest.walletAddress || !latest.gasEstimate) throw new Error('Wallet disconnected before deployment.');
      const wallet = createWalletClient({chain: bsc, transport: custom(p), account: latest.walletAddress});
      setStatus('Waiting for your explicit MetaMask review and confirmation.');
      const transactionHash = await wallet.deployContract({abi, bytecode, gas: deploymentGasLimit(latest.gasEstimate)});
      setHash(transactionHash);
      try { localStorage.setItem('dynamo-registry-deployment-hash', transactionHash); } catch {}
      setStatus('Transaction submitted. Waiting for a BSC mainnet receipt…');
      const receipt = await publicClient.waitForTransactionReceipt({hash: transactionHash, confirmations: 2});
      if (receipt.status !== 'success') throw new Error('Deployment transaction reverted on BSC mainnet.');
      if (!receipt.contractAddress) throw new Error('Confirmed receipt has no contract address.');
      if (!isAddressEqual(receipt.from, DEPLOYER_ADDRESS)) throw new Error('Receipt sender differs from the funded deployment wallet.');
      const runtime = await publicClient.getBytecode({address: receipt.contractAddress});
      if (!runtime || runtime === '0x') throw new Error('Receipt succeeded but no contract bytecode was found at the address.');
      if (keccak256(runtime) !== EXPECTED_RUNTIME_HASH) throw new Error('Deployed runtime bytecode does not match the tested artifact.');
      setDeployedAddress(receipt.contractAddress);
      setGasUsed(receipt.gasUsed);
      try { localStorage.setItem('dynamo-registry-deployment-result', JSON.stringify({hash: transactionHash, address: receipt.contractAddress, gasUsed: receipt.gasUsed.toString()})); } catch {}
      setStatus('Deployment confirmed and runtime bytecode verified on BSC mainnet.');
    } catch (cause) {
      setError(describeError(cause));
      setStatus('');
    } finally { setSending(false); }
  }

  const problems = deploymentReadiness(checks);
  const canDeploy = hasProvider && !checking && !sending && !hash && !deployedAddress && !error && problems.length === 0;
  const estimatedCost = checks.gasEstimate && checks.gasPrice ? checks.gasEstimate * checks.gasPrice : undefined;
  const maximumCost = checks.gasEstimate && checks.gasPrice ? deploymentGasLimit(checks.gasEstimate) * checks.gasPrice : undefined;

  return <main className={styles.shell}>
    <div className={styles.card}>
      <p className={styles.kicker}>DYNAMO · Developer deployment</p>
      <h1>DiscoveryRegistry mainnet deployment</h1>
      <p>This temporary page deploys only the tested registry contract. It cannot access wallet secrets or deploy automatically.</p>
      <dl className={styles.facts}>
        <div><dt>Contract</dt><dd>{registryArtifact.contractName}</dd></div>
        <div><dt>Compiler</dt><dd>{registryArtifact.compiler}</dd></div>
        <div><dt>Settings</dt><dd>Optimizer 200 runs · EVM Paris · no constructor arguments</dd></div>
        <div><dt>Creation bytecode hash</dt><dd className={styles.mono}>{registryArtifact.creationHash}</dd></div>
        <div><dt>Expected deployer</dt><dd className={styles.mono}>{DEPLOYER_ADDRESS}</dd></div>
        <div><dt>Connected wallet</dt><dd className={styles.mono}>{checks.walletAddress ?? 'Not connected'}</dd></div>
        <div><dt>Network</dt><dd>{checks.walletChainId === 56 ? 'BNB Smart Chain mainnet (56)' : checks.walletChainId ? `Wrong chain (${checks.walletChainId})` : 'Not connected'} · RPC {checks.rpcChainId ?? 'unchecked'}</dd></div>
        <div><dt>Available balance</dt><dd>{checks.balance === undefined ? 'Unchecked' : `${formatEther(checks.balance)} BNB`}</dd></div>
        <div><dt>Estimated deployment gas</dt><dd>{checks.gasEstimate?.toString() ?? 'Unchecked'}</dd></div>
        <div><dt>Gas price</dt><dd>{checks.gasPrice === undefined ? 'Unchecked' : `${formatGwei(checks.gasPrice)} gwei`}</dd></div>
        <div><dt>Estimated cost</dt><dd>{estimatedCost === undefined ? 'Unchecked' : `${formatEther(estimatedCost)} BNB`}</dd></div>
        <div><dt>Maximum at 20% gas margin</dt><dd>{maximumCost === undefined ? 'Unchecked' : `${formatEther(maximumCost)} BNB`}</dd></div>
      </dl>
      <div className={styles.actions}>
        <button type="button" onClick={connect} disabled={!hasProvider || sending}>Connect MetaMask</button>
        <button type="button" onClick={switchToBsc} disabled={!hasProvider || sending || !checks.walletAddress}>Switch to BSC mainnet</button>
        <button type="button" onClick={() => void refresh()} disabled={checking || sending}>Refresh checks</button>
      </div>
      {!hasProvider && <p role="status">No injected EVM wallet detected. Open this page in the browser with MetaMask.</p>}
      {problems.length > 0 && <ul className={styles.checks}>{problems.map(problem => <li key={problem}>{problem}</li>)}</ul>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {status && <p role="status">{status}</p>}
      <button type="button" className={styles.deploy} onClick={deploy} disabled={!canDeploy}>Deploy DiscoveryRegistry on BSC mainnet</button>
      <p className={styles.note}>Clicking Deploy asks MetaMask to show the transaction. You must review and confirm it in MetaMask. Contract value: 0 BNB; network gas is paid in BNB.</p>
      {hash && <p>Transaction: <a href={`https://bscscan.com/tx/${hash}`} target="_blank" rel="noreferrer" className={styles.mono}>{hash}</a></p>}
      {deployedAddress && <p>Verified contract: <a href={`https://bscscan.com/address/${deployedAddress}`} target="_blank" rel="noreferrer" className={styles.mono}>{deployedAddress}</a>{gasUsed && ` · ${gasUsed} gas used`}</p>}
    </div>
  </main>;
}
