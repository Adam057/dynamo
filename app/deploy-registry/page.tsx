import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import RegistryDeployer from './RegistryDeployer';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'DYNAMO registry deployment', robots: { index: false, follow: false } };

export default function DeploymentPage() {
  const deployedAddress = process.env.NEXT_PUBLIC_REGISTRY_ADDRESS;
  if (deployedAddress?.toLowerCase() === '0x017cf9f25d7dbb7eca7fe6d0f06f2598cb2bac54') return <main style={{maxWidth:760,margin:'8vh auto',padding:'32px',background:'#fffcf6',borderRadius:24}}><p>DYNAMO · Mainnet deployment record</p><h1>DiscoveryRegistry is deployed</h1><p>The registry is already deployed on BNB Smart Chain mainnet. Deployment controls are disabled to prevent a duplicate contract.</p><p>Contract: <a href={`https://bscscan.com/address/${deployedAddress}`}>{deployedAddress}</a></p><p>Transaction: <a href="https://bscscan.com/tx/0x37022a0a218c83a10474d5083f9664194a02704f537c546c378232ca4436c3bb">0x37022a0a218c83a10474d5083f9664194a02704f537c546c378232ca4436c3bb</a></p><a href="/">Return to DYNAMO</a></main>;
  if (process.env.ENABLE_REGISTRY_DEPLOYMENT !== 'true') notFound();
  return <RegistryDeployer />;
}
