import {createPublicClient,createWalletClient,custom,http,keccak256,stringToHex,decodeEventLog,isAddress,isAddressEqual,formatEther,type Abi,type Address,type Hex,type TransactionReceipt} from 'viem';
import {bsc} from 'viem/chains';
import type {Dataset,FitResult} from './science';
import artifact from './registry-deployment-artifact.json';
import {EXPECTED_RUNTIME_HASH} from './registry-deployment';
export const MAINNET_REGISTRY_ADDRESS='0x017cf9f25d7dbb7eca7fe6d0f06f2598cb2bac54' as Address;
export const address=process.env.NEXT_PUBLIC_REGISTRY_ADDRESS as Address|undefined;
export const registryConfigured=Boolean(address && isAddress(address) && isAddressEqual(address,MAINNET_REGISTRY_ADDRESS));
const rpc=process.env.NEXT_PUBLIC_BSC_RPC_URL||'https://bsc-dataseed.bnbchain.org';
export const abi=artifact.abi as Abi;
const client=createPublicClient({chain:bsc,transport:http(rpc,{retryCount:2})});
function provider(){const p=(window as Window&{ethereum?:any}).ethereum;if(!p)throw new Error('No EVM wallet found. Install MetaMask or a compatible wallet.');return p}
export async function connectWallet(){const p=provider();const accounts=await p.request({method:'eth_requestAccounts'});if(!accounts?.[0]||!isAddress(accounts[0]))throw new Error('Wallet returned no valid account.');return accounts[0] as string}
export async function currentWallet():Promise<{account?:Address;chainId:number}>{const p=provider();const [accounts,chain]=await Promise.all([p.request({method:'eth_accounts'}),p.request({method:'eth_chainId'})]);const account=(accounts as string[])?.[0];return {account:account&&isAddress(account)?account as Address:undefined,chainId:Number(chain)}}
export function subscribeWallet(onAccounts:(accounts:string[])=>void,onChain:(chainId:number)=>void):()=>void{
  const p=(window as Window&{ethereum?:{on?:(event:string,listener:(value:any)=>void)=>void;removeListener?:(event:string,listener:(value:any)=>void)=>void}}).ethereum;
  if(!p?.on)return ()=>{};
  const accountsChanged=(accounts:string[])=>onAccounts(accounts);
  const chainChanged=(chainId:string)=>onChain(Number(chainId));
  p.on('accountsChanged',accountsChanged);
  p.on('chainChanged',chainChanged);
  return ()=>{p.removeListener?.('accountsChanged',accountsChanged);p.removeListener?.('chainChanged',chainChanged)};
}
export async function ensureBscMainnet(p: {request:(args:{method:string;params?:unknown[]})=>Promise<unknown>},onStatus:(s:string)=>void){let chainId=await p.request({method:'eth_chainId'});if(Number(chainId)!==56){onStatus('Requesting switch to BNB Smart Chain mainnet…');try{await p.request({method:'wallet_switchEthereumChain',params:[{chainId:'0x38'}]})}catch(cause){if((cause as {code?:number})?.code!==4902)throw cause;onStatus('BNB Smart Chain is missing from the wallet. Review its network details in MetaMask.');await p.request({method:'wallet_addEthereumChain',params:[{chainId:'0x38',chainName:'BNB Smart Chain Mainnet',nativeCurrency:{name:'BNB',symbol:'BNB',decimals:18},rpcUrls:['https://bsc-dataseed.bnbchain.org'],blockExplorerUrls:['https://bscscan.com']}]})}chainId=await p.request({method:'eth_chainId'});if(Number(chainId)!==56)throw new Error('Wallet is not on BNB Smart Chain mainnet.')}}
export async function switchToBscMainnet(onStatus:(s:string)=>void){await ensureBscMainnet(provider(),onStatus)}
export type ChainDiscovery={id:number;creator:string;modelHash:Hex;datasetHash:Hex;metadataHash:Hex;timestamp:number;parentId:number;verificationCount:number};
type RawDiscovery={creator:Address;modelHash:Hex;datasetHash:Hex;metadataHash:Hex;timestamp:bigint;parentId:bigint;verificationCount:bigint};
export async function verifyRegistry():Promise<void>{if(!registryConfigured||!address)throw new Error('Registry address is not configured.');if(await client.getChainId()!==56)throw new Error('Registry RPC is not BNB Smart Chain mainnet.');const code=await client.getBytecode({address});if(!code||keccak256(code)!==EXPECTED_RUNTIME_HASH)throw new Error('Registry runtime bytecode does not match the tested contract.')}
export async function readDiscovery(id:number):Promise<ChainDiscovery>{if(!registryConfigured||!address)throw new Error('Registry address is not configured.');const d=await client.readContract({address,abi,functionName:'getDiscovery',args:[BigInt(id)]}) as RawDiscovery;return {id,creator:d.creator,modelHash:d.modelHash,datasetHash:d.datasetHash,metadataHash:d.metadataHash,timestamp:Number(d.timestamp),parentId:Number(d.parentId),verificationCount:Number(d.verificationCount)}}
export async function readDiscoveries():Promise<ChainDiscovery[]>{if(!registryConfigured||!address)return [];await verifyRegistry();const count=Number(await client.readContract({address,abi,functionName:'getDiscoveryCount'}));const ids=Array.from({length:Math.min(30,count)},(_,i)=>count-i);return Promise.all(ids.map(readDiscovery))}
function stable(value:unknown):string{if(Array.isArray(value))return `[${value.map(stable).join(',')}]`;if(value&&typeof value==='object')return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${stable((value as Record<string,unknown>)[k])}`).join(',')}}`;return JSON.stringify(value)}
export function commitments(fit:FitResult,data:Dataset){return {modelHash:keccak256(stringToHex(stable({equations:fit.equations,coefficients:fit.coefficients,terms:fit.terms}))),datasetHash:keccak256(stringToHex(stable({columns:data.columns,rows:data.rows}))),metadataHash:keccak256(stringToHex(stable({version:'0.1.0',source:data.source,rmse:fit.rmse,r2:fit.r2,limitation:fit.limitation})))}}
export function discoveryIdFromReceipt(receipt:Pick<TransactionReceipt,'logs'>,registry:`0x${string}`):number{
  for(const log of receipt.logs){
    if(log.address.toLowerCase()!==registry.toLowerCase())continue;
    try{
      const event=decodeEventLog({abi,eventName:'DiscoveryRegistered',data:log.data,topics:log.topics});
      return Number((event.args as unknown as {id:bigint}).id);
    }catch{}
  }
  throw new Error('Confirmed transaction, but the registry event was not found in its receipt.');
}
export function walletError(cause:unknown):string{const e=cause as {code?:number;shortMessage?:string;message?:string};if(e?.code===4001||/user rejected|user denied/i.test(e?.message??''))return 'Request rejected in wallet. No transaction was submitted.';if(/insufficient funds/i.test(e?.message??''))return 'Insufficient BNB for network gas.';return e?.shortMessage||e?.message||String(cause)}
export type PublicationPlan={account:Address;parentId:number;hashes:ReturnType<typeof commitments>;gasEstimate:bigint;gasPrice:bigint;balance:bigint;estimatedCost:bigint};
export async function preparePublication(fit:FitResult,data:Dataset,account:Address,parentId=0):Promise<PublicationPlan>{
  if(!registryConfigured||!address)throw new Error('Registry is not configured.');
  if(!isAddress(account))throw new Error('Connect a valid EVM wallet.');
  if(!Number.isSafeInteger(parentId)||parentId<0)throw new Error('Invalid parent discovery.');
  const connected=await currentWallet();
  if(!connected.account||!isAddressEqual(connected.account,account))throw new Error('Connected wallet account changed.');
  if(connected.chainId!==56)throw new Error('Switch your wallet to BNB Smart Chain mainnet before preparing publication.');
  await verifyRegistry();
  const hashes=commitments(fit,data),functionName=parentId?'registerImprovement':'registerDiscovery';
  const args=parentId?[BigInt(parentId),hashes.modelHash,hashes.datasetHash,hashes.metadataHash]:[hashes.modelHash,hashes.datasetHash,hashes.metadataHash];
  const [gasEstimate,gasPrice,balance]=await Promise.all([client.estimateContractGas({address,abi,functionName,args,account}),client.getGasPrice(),client.getBalance({address:account})]);
  const estimatedCost=gasEstimate*gasPrice;
  if(balance<estimatedCost*BigInt(12)/BigInt(10))throw new Error(`Insufficient BNB. Estimated cost is ${formatEther(estimatedCost)} BNB, plus a gas margin.`);
  return {account,parentId,hashes,gasEstimate,gasPrice,balance,estimatedCost};
}
export async function publishPrepared(plan:PublicationPlan,onStatus:(s:string)=>void):Promise<{id:number;hash:Hex;record:ChainDiscovery}>{
  if(!registryConfigured||!address)throw new Error('Registry is not configured.');
  const p=provider();const accounts=await p.request({method:'eth_accounts'}) as Address[];const account=accounts?.[0];
  if(!account||!isAddress(account)||!isAddressEqual(account,plan.account))throw new Error('Wallet account changed. Prepare publication again.');
  if(Number(await p.request({method:'eth_chainId'}))!==56)throw new Error('Switch your wallet to BNB Smart Chain mainnet and prepare again.');
  await verifyRegistry();
  const functionName=plan.parentId?'registerImprovement':'registerDiscovery';
  const args=plan.parentId?[BigInt(plan.parentId),plan.hashes.modelHash,plan.hashes.datasetHash,plan.hashes.metadataHash]:[plan.hashes.modelHash,plan.hashes.datasetHash,plan.hashes.metadataHash];
  const wallet=createWalletClient({chain:bsc,transport:custom(p),account});
  onStatus('Review the registry address, zero BNB transfer value, and network gas in MetaMask.');
  const hash=await wallet.writeContract({address,abi,functionName,args,gas:plan.gasEstimate*BigInt(12)/BigInt(10)});
  onStatus(`Submitted on BSC mainnet: ${hash}. Waiting for confirmation…`);
  const receipt=await client.waitForTransactionReceipt({hash});
  if(receipt.status!=='success')throw new Error(`Transaction reverted: ${hash}`);
  const id=discoveryIdFromReceipt(receipt,address),record=await readDiscovery(id);
  if(!isAddressEqual(record.creator as Address,account)||record.modelHash!==plan.hashes.modelHash||record.datasetHash!==plan.hashes.datasetHash||record.metadataHash!==plan.hashes.metadataHash||record.parentId!==plan.parentId)throw new Error(`Confirmed transaction ${hash}, but stored commitments do not match the submitted discovery.`);
  return {id,hash,record};
}
export type VerificationPlan={account:Address;id:number;reportHash:Hex;previousCount:number;gasEstimate:bigint;gasPrice:bigint;estimatedCost:bigint};
export async function prepareVerification(id:number,reportHash:Hex,account:Address):Promise<VerificationPlan>{
  if(!registryConfigured||!address)throw new Error('Registry is not configured.');
  if(!isAddress(account))throw new Error('Connect a valid EVM wallet.');
  if(!/^0x[0-9a-fA-F]{64}$/.test(reportHash)||/^0x0+$/.test(reportHash))throw new Error('A nonzero 32-byte report commitment is required.');
  const connected=await currentWallet();
  if(!connected.account||!isAddressEqual(connected.account,account))throw new Error('Connected wallet account changed.');
  if(connected.chainId!==56)throw new Error('Switch your wallet to BNB Smart Chain mainnet before preparing verification.');
  await verifyRegistry();
  const record=await readDiscovery(id);
  const [gasEstimate,gasPrice,balance]=await Promise.all([client.estimateContractGas({address,abi,functionName:'submitVerification',args:[BigInt(id),reportHash],account}),client.getGasPrice(),client.getBalance({address:account})]);
  const estimatedCost=gasEstimate*gasPrice;
  if(balance<estimatedCost*BigInt(12)/BigInt(10))throw new Error(`Insufficient BNB. Estimated cost is ${formatEther(estimatedCost)} BNB, plus a gas margin.`);
  return {account,id,reportHash,previousCount:record.verificationCount,gasEstimate,gasPrice,estimatedCost};
}
export async function submitPreparedVerification(plan:VerificationPlan,onStatus:(s:string)=>void):Promise<Hex>{
  if(!registryConfigured||!address)throw new Error('Registry is not configured.');
  const p=provider(),accounts=await p.request({method:'eth_accounts'}) as Address[],account=accounts?.[0];
  if(!account||!isAddress(account)||!isAddressEqual(account,plan.account))throw new Error('Wallet account changed. Prepare verification again.');
  if(Number(await p.request({method:'eth_chainId'}))!==56)throw new Error('Switch your wallet to BNB Smart Chain mainnet and prepare again.');
  await verifyRegistry();
  const wallet=createWalletClient({chain:bsc,transport:custom(p),account});
  onStatus('Review verification gas in MetaMask. Only the report hash is submitted.');
  const hash=await wallet.writeContract({address,abi,functionName:'submitVerification',args:[BigInt(plan.id),plan.reportHash],gas:plan.gasEstimate*BigInt(12)/BigInt(10)});
  onStatus(`Submitted on BSC mainnet: ${hash}. Waiting for confirmation…`);
  const receipt=await client.waitForTransactionReceipt({hash});
  if(receipt.status!=='success')throw new Error(`Verification transaction reverted: ${hash}`);
  const eventFound=receipt.logs.some(log=>{if(!isAddressEqual(log.address,address))return false;try{const event=decodeEventLog({abi,eventName:'VerificationSubmitted',data:log.data,topics:log.topics});const args=event.args as unknown as {id:bigint;verifier:Address;reportHash:Hex};return Number(args.id)===plan.id&&isAddressEqual(args.verifier,account)&&args.reportHash===plan.reportHash}catch{return false}});
  if(!eventFound)throw new Error(`Confirmed transaction ${hash}, but the verification event did not match.`);
  const record=await readDiscovery(plan.id);
  if(record.verificationCount<=plan.previousCount)throw new Error(`Confirmed transaction ${hash}, but verification count did not advance.`);
  return hash;
}

