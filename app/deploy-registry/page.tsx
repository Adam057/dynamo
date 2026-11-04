import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import RegistryDeployer from './RegistryDeployer';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'DYNAMO registry deployment', robots: { index: false, follow: false } };

export default function DeploymentPage() {
  if (process.env.ENABLE_REGISTRY_DEPLOYMENT !== 'true') notFound();
  return <RegistryDeployer />;
}
