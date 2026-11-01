import {createPublicClient,createWalletClient,custom,http,keccak256,stringToHex,decodeEventLog,type Hex,type TransactionReceipt} from 'viem';
import {bsc} from 'viem/chains';
import type {Dataset,FitResult} from './science';
const address=process.env.NEXT_PUBLIC_REGISTRY_ADDRESS as `0x${string}`|undefined;
export const registryConfigured=Boolean(address && /^0x[0-9a-fA-F]{40}$/.test(address));
const rpc=process.env.NEXT_PUBLIC_BSC_RPC_URL||'https://bsc-dataseed.bnbchain.org';
const abi=[{type:'function',name:'getDiscoveryCount',stateMutability:'view',inputs:[],outputs:[{type:'uint256'}]},{type:'function',name:'getDiscovery',stateMutability:'view',inputs:[{name:'id',type:'uint256'}],outputs:[{type:'tuple',components:[{name:'creator',type:'address'},{name:'modelHash',type:'bytes32'},{name:'datasetHash',type:'bytes32'},{name:'metadataHash',type:'bytes32'},{name:'timestamp',type:'uint64'},{name:'parentId',type:'uint64'},{name:'verificationCount',type:'uint64'}]}]},{type:'function',name:'registerDiscovery',stateMutability:'nonpayable',inputs:[{name:'modelHash',type:'bytes32'},{name:'datasetHash',type:'bytes32'},{name:'metadataHash',type:'bytes32'}],outputs:[{type:'uint256'}]},{type:'event',name:'DiscoveryRegistered',inputs:[{name:'id',type:'uint256',indexed:true},{name:'creator',type:'address',indexed:true},{name:'parentId',type:'uint256',indexed:true},{name:'modelHash',type:'bytes32',indexed:false}]}] as const;
const client=createPublicClient({chain:bsc,transport:http(rpc,{retryCount:2})});
function provider(){const p=(window as Window&{ethereum?:any}).ethereum;if(!p)throw new Error('No EVM wallet found. Install MetaMask or a compatible wallet.');return p}
export async function connectWallet(){const p=provider();const accounts=await p.request({method:'eth_requestAccounts'});if(!accounts?.[0])throw new Error('Wallet returned no account.');return accounts[0] as string}
export function subscribeWallet(onAccounts:(accounts:string[])=>void,onChain:(chainId:number)=>void):()=>void{
  const p=(window as Window&{ethereum?:{on?:(event:string,listener:(value:any)=>void)=>void;removeListener?:(event:string,listener:(value:any)=>void)=>void}}).ethereum;
  if(!p?.on)return ()=>{};
  const accountsChanged=(accounts:string[])=>onAccounts(accounts);
  const chainChanged=(chainId:string)=>onChain(Number(chainId));
  p.on('accountsChanged',accountsChanged);
  p.on('chainChanged',chainChanged);
  return ()=>{p.removeListener?.('accountsChanged',accountsChanged);p.removeListener?.('chainChanged',chainChanged)};
}
export async function ensureBscMainnet(p: {request:(args:{method:string;params?:unknown[]})=>Promise<unknown>},onStatus:(s:string)=>void){let chainId=await p.request({method:'eth_chainId'});if(Number(chainId)!==56){onStatus('Requesting switch to BNB Smart Chain mainnet…');await p.request({method:'wallet_switchEthereumChain',params:[{chainId:'0x38'}]});chainId=await p.request({method:'eth_chainId'});if(Number(chainId)!==56)throw new Error('Wallet is not on BNB Smart Chain mainnet.')}}
export type ChainDiscovery={id:number;creator:string;modelHash:string;datasetHash:string;metadataHash:string;timestamp:number;parentId:number;verificationCount:number};
export async function readDiscoveries():Promise<ChainDiscovery[]>{if(!registryConfigured||!address)return [];const count=Number(await client.readContract({address,abi,functionName:'getDiscoveryCount'}));const ids=Array.from({length:Math.min(30,count)},(_,i)=>count-i);const result:ChainDiscovery[]=[];for(const id of ids){const d=await client.readContract({address,abi,functionName:'getDiscovery',args:[BigInt(id)]});result.push({id,creator:d.creator,modelHash:d.modelHash,datasetHash:d.datasetHash,metadataHash:d.metadataHash,timestamp:Number(d.timestamp),parentId:Number(d.parentId),verificationCount:Number(d.verificationCount)})}return result}
function stable(value:unknown):string{if(Array.isArray(value))return `[${value.map(stable).join(',')}]`;if(value&&typeof value==='object')return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${stable((value as Record<string,unknown>)[k])}`).join(',')}}`;return JSON.stringify(value)}
export function commitments(fit:FitResult,data:Dataset){return {modelHash:keccak256(stringToHex(stable({equations:fit.equations,coefficients:fit.coefficients,terms:fit.terms}))),datasetHash:keccak256(stringToHex(stable({columns:data.columns,rows:data.rows}))),metadataHash:keccak256(stringToHex(stable({version:'0.1.0',source:data.source,rmse:fit.rmse,r2:fit.r2,limitation:fit.limitation})))}}
export function discoveryIdFromReceipt(receipt:Pick<TransactionReceipt,'logs'>,registry:`0x${string}`):number{
  for(const log of receipt.logs){
    if(log.address.toLowerCase()!==registry.toLowerCase())continue;
    try{
      const event=decodeEventLog({abi,eventName:'DiscoveryRegistered',data:log.data,topics:log.topics});
      return Number(event.args.id);
    }catch{}
  }
  throw new Error('Confirmed transaction, but the registry event was not found in its receipt.');
}
export async function publishDiscovery(fit:FitResult,data:Dataset,onStatus:(s:string)=>void):Promise<{id:number;hash:Hex}>{if(!registryConfigured||!address)throw new Error('Registry is not deployed/configured. Set NEXT_PUBLIC_REGISTRY_ADDRESS to a confirmed BSC mainnet contract.');const p=provider();const accounts=await p.request({method:'eth_requestAccounts'});const account=accounts[0] as `0x${string}`;await ensureBscMainnet(p,onStatus);const hashes=commitments(fit,data);const wallet=createWalletClient({chain:bsc,transport:custom(p),account});onStatus('Confirm registration in your wallet. This spends BNB gas.');const hash=await wallet.writeContract({address,abi,functionName:'registerDiscovery',args:[hashes.modelHash,hashes.datasetHash,hashes.metadataHash]});onStatus(`Transaction submitted: ${hash}. Waiting for confirmation…`);const receipt=await client.waitForTransactionReceipt({hash});if(receipt.status!=='success')throw new Error(`Transaction reverted: ${hash}`);return {id:discoveryIdFromReceipt(receipt,address),hash}}

