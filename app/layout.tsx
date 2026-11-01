import './globals.css';
import type { Metadata } from 'next';
export const metadata:Metadata={title:'DYNAMO — Discover the equations behind reality',description:'A scientific discovery laboratory with numerical experiments and an onchain registry.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
