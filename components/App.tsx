'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatEther, keccak256, stringToHex, type Address, type Hex } from 'viem';
import { datasetFor, fitSindy, parseCsv, simulate, systems, type Dataset, type FitResult, type SystemId } from '@/lib/science';
import { simulationCsv, discoveryPackage } from '@/lib/export';
import { address as registryAddress, connectWallet, currentWallet, preparePublication, prepareVerification, publishPrepared, readDiscoveries, registryConfigured, submitPreparedVerification, subscribeWallet, switchToBscMainnet, walletError, type ChainDiscovery, type PublicationPlan, type VerificationPlan } from '@/lib/chain';
import Plot from './Plot';
import FitPlot from './FitPlot';

const ids: SystemId[] = ['lorenz', 'oscillator', 'logistic', 'predator'];
type SavedModel = { fit: FitResult; data?: Dataset };

function download(name: string, content: string, type = 'application/json') {
  const a = document.createElement('a');
  const url = URL.createObjectURL(new Blob([content], { type }));
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function App() {
  const [id, setId] = useState<SystemId>('lorenz');
  const [params, setParams] = useState(systems.lorenz.defaults);
  const [initial, setInitial] = useState(systems.lorenz.initial);
  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(.2);
  const [speed, setSpeed] = useState(1);
  const [menu, setMenu] = useState(false);
  const [data, setData] = useState<Dataset>(() => datasetFor('lorenz'));
  const [timeCol, setTimeCol] = useState('time');
  const [stateCols, setStateCols] = useState<string[]>(['x', 'y', 'z']);
  const [degree, setDegree] = useState<1 | 2>(2);
  const [threshold, setThreshold] = useState(.05);
  const [fit, setFit] = useState<FitResult | null>(null);
  const [fitData, setFitData] = useState<Dataset | null>(null);
  const [error, setError] = useState('');
  const [wallet, setWallet] = useState('');
  const [walletChainId, setWalletChainId] = useState<number>();
  const [chainStatus, setChainStatus] = useState('');
  const [discoveries, setDiscoveries] = useState<ChainDiscovery[]>([]);
  const [registryError, setRegistryError] = useState('');
  const [comparison, setComparison] = useState<ReturnType<typeof simulate>>();
  const [saved, setSaved] = useState<SavedModel[]>([]);
  const [parentId, setParentId] = useState(0);
  const [plan, setPlan] = useState<PublicationPlan | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publicationHash, setPublicationHash] = useState<Hex>();
  const [reportText, setReportText] = useState<Record<number, string>>({});
  const [verificationPlan, setVerificationPlan] = useState<VerificationPlan | null>(null);
  const [verificationHash, setVerificationHash] = useState<Hex>();
  const [verifying, setVerifying] = useState(false);

  const system = systems[id];
  const points = useMemo(() => { try { return simulate(system, params, initial); } catch { return []; } }, [system, params, initial]);

  useEffect(() => {
    let frame = 0, last = 0;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const tick = (now: number) => {
      if (playing && !reduced.matches && document.visibilityState === 'visible') {
        if (last && now - last > 33) {
          const delta = Math.max(0, Math.min((now - last) / 1000 * .16 * speed, .05));
          setProgress(v => v + delta >= 1 ? 0 : v + delta);
          last = now;
        } else if (!last) last = now;
      } else last = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, speed]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('dynamo-models');
      if (raw) setSaved((JSON.parse(raw) as Array<SavedModel | FitResult>).map(x => 'fit' in x ? x : { fit: x }));
    } catch { /* Browser storage is optional. */ }
  }, []);
  useEffect(() => { if (registryConfigured) readDiscoveries().then(setDiscoveries).catch(e => setRegistryError(walletError(e))); }, []);
  useEffect(() => subscribeWallet(
    accounts => { setWallet(accounts[0] || ''); setPlan(null); setVerificationPlan(null); setChainStatus(accounts[0] ? 'Wallet account changed. Prepare publication again.' : 'Wallet disconnected.'); },
    chainId => { setWalletChainId(chainId); setPlan(null); setVerificationPlan(null); setChainStatus(chainId === 56 ? 'Wallet on BNB Smart Chain mainnet.' : 'Wrong network. Switch to BNB Smart Chain mainnet before publishing.'); },
  ), []);

  function select(next: SystemId) {
    setId(next); setParams({ ...systems[next].defaults }); setInitial([...systems[next].initial]);
    setData(datasetFor(next)); setTimeCol('time'); setStateCols([...systems[next].variables]);
    setFit(null); setFitData(null); setPlan(null); setComparison(undefined); setProgress(0); setError('');
  }
  function runFit() {
    setError(''); setPlan(null);
    try { setFit(fitSindy(data, timeCol, stateCols, degree, threshold)); setFitData(data); setTimeout(() => document.getElementById('result')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50); }
    catch (cause) { setError(walletError(cause)); }
  }
  async function upload(file?: File) {
    if (!file) return; setError(''); setPlan(null);
    try { if (!file.name.toLowerCase().endsWith('.csv')) throw new Error('Please select a CSV file.'); const parsed = parseCsv(await file.text(), file.name); setData(parsed); setTimeCol(parsed.columns[0]); setStateCols(parsed.columns.slice(1)); setFit(null); setFitData(null); }
    catch (cause) { setError(walletError(cause)); }
  }
  function save() {
    if (!fit || !fitData) return;
    const next = [{ fit, data: fitData }, ...saved].slice(0, 30);
    try { localStorage.setItem('dynamo-models', JSON.stringify(next)); setSaved(next); setChainStatus('Model and dataset saved in this browser. Download a package for a portable copy.'); }
    catch { setChainStatus('Browser storage is full. Download the discovery package instead.'); }
  }
  async function connect() {
    if (wallet) { setWallet(''); setWalletChainId(undefined); setPlan(null); setChainStatus('Wallet hidden in DYNAMO. Revoke this site in your wallet to remove its permission.'); return; }
    try { const account = await connectWallet(); setWallet(account); const connection = await currentWallet(); setWalletChainId(connection.chainId); setChainStatus(connection.chainId === 56 ? 'Wallet connected on BSC mainnet. Publishing requires separate confirmation.' : 'Wallet connected on another network. Switch to BSC mainnet before publishing.'); }
    catch (cause) { setChainStatus(walletError(cause)); }
  }
  async function switchNetwork() { try { await switchToBscMainnet(setChainStatus); setWalletChainId(56); setChainStatus('Wallet switched to BNB Smart Chain mainnet.'); } catch (cause) { setChainStatus(walletError(cause)); } }
  async function prepare() {
    if (!fit || !fitData || !wallet) return;
    setPreparing(true); setPlan(null); setPublicationHash(undefined); setChainStatus('Checking registry code, account balance, and estimated gas…');
    try { const next = await preparePublication(fit, fitData, wallet as Address, parentId); setPlan(next); setChainStatus('Ready for your review. No transaction has been submitted.'); }
    catch (cause) { setChainStatus(walletError(cause)); }
    finally { setPreparing(false); }
  }
  async function publish() {
    if (!plan || publishing) return;
    setPublishing(true); setPublicationHash(undefined);
    try {
      const result = await publishPrepared(plan, status => {
        setChainStatus(status);
        const match = status.match(/0x[a-fA-F0-9]{64}/);
        if (match) setPublicationHash(match[0] as Hex);
      });
      setPublicationHash(result.hash); setPlan(null);
      setChainStatus(`Confirmed on BSC mainnet as discovery #${result.id}. Stored commitments matched the submitted model and dataset.`);
      setDiscoveries(await readDiscoveries());
    } catch (cause) { setChainStatus(walletError(cause)); }
    finally { setPublishing(false); }
  }
  async function prepareReport(id: number) {
    const text = reportText[id]?.trim();
    if (!wallet || !text) { setChainStatus('Connect a wallet and enter a verification report first.'); return; }
    setVerifying(true); setVerificationPlan(null); setVerificationHash(undefined);
    try { const reportHash = keccak256(stringToHex(text)); setVerificationPlan(await prepareVerification(id, reportHash, wallet as Address)); setChainStatus('Verification prepared. The report text stays in this browser; only its hash can be submitted.'); }
    catch (cause) { setChainStatus(walletError(cause)); }
    finally { setVerifying(false); }
  }
  async function submitReport() {
    if (!verificationPlan || verifying) return;
    setVerifying(true);
    try { const hash = await submitPreparedVerification(verificationPlan, status => { setChainStatus(status); const match = status.match(/0x[a-fA-F0-9]{64}/); if (match) setVerificationHash(match[0] as Hex); }); setVerificationHash(hash); setVerificationPlan(null); setChainStatus(`Verification submission confirmed for discovery #${verificationPlan.id}. This is a recorded submission, not proof of scientific correctness.`); setDiscoveries(await readDiscoveries()); }
    catch (cause) { setChainStatus(walletError(cause)); }
    finally { setVerifying(false); }
  }

  const nav = [['Lab', '#lab'], ['Discoveries', '#discoveries'], ['Explorer', '#explorer'], ['Map', '#map']];
  return <>
    <header className="header"><div className="container header-inner">
      <a className="brand" href="#top"><span className="brand-mark" aria-hidden="true">∿</span>DYNAMO</a>
      <nav className="nav" aria-label="Main navigation">{nav.map(([label, href]) => <a href={href} key={href}>{label}</a>)}</nav>
      <button type="button" className="wallet" onClick={connect}>{wallet ? `${wallet.slice(0, 6)}…${wallet.slice(-4)} · Disconnect` : 'Connect Wallet'}</button>
      <button type="button" className="menu" aria-label={menu ? 'Close navigation' : 'Open navigation'} aria-expanded={menu} onClick={() => setMenu(!menu)}>{menu ? 'Close' : 'Menu'}</button>
    </div>{menu && <nav className="mobile-nav" aria-label="Mobile navigation">{nav.map(([label, href]) => <a href={href} key={href} onClick={() => setMenu(false)}>{label}</a>)}<button type="button" className="wallet" onClick={() => { setMenu(false); void connect(); }}>{wallet ? 'Disconnect wallet' : 'Connect Wallet'}</button></nav>}</header>

    <main id="top"><section className="hero"><div className="container">
      <div className="hero-grid"><div className="hero-copy"><div className="eyebrow">An onchain scientific discovery laboratory</div><h1>Discover the equations behind reality.</h1><p>Explore physical systems, fit candidate equations to data, and keep a verifiable record of what you found.</p><div className="actions"><a className="primary" href="#lab">Enter the lab</a><a className="outline" href="#how-it-works">How it works</a></div><span className="hero-caption">Four real systems · Numerical integration · Local first</span></div>
      <div className="monitor" id="hero-monitor"><div className="monitor-top"><span className="live">{system.name}</span><small>Live numerical simulation</small></div><Plot points={points} id={id} progress={progress}/><div className="monitor-bottom"><button type="button" className="icon-button" aria-label={playing ? 'Pause' : 'Resume'} onClick={() => setPlaying(!playing)}>{playing ? 'Pause' : 'Play'}</button><input aria-label="Simulation position" type="range" min="0" max="1" step=".001" value={progress} onChange={e => setProgress(Number(e.target.value))}/><small>t = {(progress * system.duration).toFixed(1)}s</small><select aria-label="Simulation speed" value={speed} onChange={e => setSpeed(Number(e.target.value))}><option value="0.5">0.5×</option><option value="1">1×</option><option value="2">2×</option></select><button type="button" className="icon-button" onClick={() => setProgress(0)}>Reset</button></div></div>
      <aside className="model-card"><span className="eyebrow">Inside the instrument</span><h3>Predefined mathematical model</h3><div className="equation">{system.equations.map(x => <div key={x}>{x}</div>)}</div><div className="meta"><span>Source</span><strong>Built-in simulation</strong></div><div className="meta"><span>Fit accuracy</span><strong>Not fitted</strong></div><a className="primary" href="#lab">Inspect this system</a></aside></div>
      <div className="experiment-strip" role="group" aria-label="Select experiment">{ids.map((x, i) => <button type="button" key={x} aria-pressed={id === x} className={id === x ? 'selected' : ''} onClick={() => select(x)}><span className="experiment-number">0{i + 1}</span><strong>{systems[x].name}</strong><small>{systems[x].equations[0]}</small></button>)}</div>
    </div></section>

    <section id="how-it-works" className="journey"><div className="container journey-inner"><span className="eyebrow">Your research path</span><p>Choose a system <span>→</span> tune parameters <span>→</span> fit a candidate <span>→</span> inspect evidence <span>→</span> save locally or publish a commitment.</p><details><summary>New to DYNAMO? Start here</summary><p>Begin with a built-in experiment, then adjust its controls and watch the calculated trajectory. The fitting tool finds candidate equations from numerical data or your CSV. You can export everything without a wallet. Publishing stores only hashes on BNB Chain and does not prove scientific correctness.</p></details></div></section>

    <section id="lab" className="section"><div className="container"><div className="section-head"><div><span className="eyebrow">Scientific workspace</span><h2>Discovery Lab</h2><p className="muted">Simulate a system or upload measurements, then fit candidate differential equations.</p></div><span className="lab-badge">Experiment {String(ids.indexOf(id) + 1).padStart(2, '0')} / 04</span></div>
      <div className="lab-grid"><aside className="panel setup-panel"><span className="panel-kicker">01 / Configure</span><h3>Experiment setup</h3><label className="field">System<select value={id} onChange={e => select(e.target.value as SystemId)}>{ids.map(x => <option value={x} key={x}>{systems[x].name}</option>)}</select></label>{system.controls.map(c => <label className="field" key={c.key}>{c.label}: <output>{params[c.key].toFixed(c.step < .01 ? 3 : 2)}</output><input type="range" min={c.min} max={c.max} step={c.step} value={params[c.key]} onChange={e => { setParams({ ...params, [c.key]: Number(e.target.value) }); setProgress(0); }}/></label>)}{initial.map((v, i) => <label className="field" key={i}>Initial {system.variables[i]}<input type="number" step="any" value={v} onChange={e => setInitial(initial.map((n, j) => j === i ? Number(e.target.value) : n))}/></label>)}<div className="stack"><button type="button" className="outline" onClick={() => { setParams({ ...system.defaults }); setInitial([...system.initial]); setProgress(0); }}>Reset defaults</button><button type="button" className="outline" onClick={() => setComparison(points)}>Compare current run</button><button type="button" className="outline" onClick={() => download(`${id}-simulation.csv`, simulationCsv(system, points), 'text/csv')}>Export simulation CSV</button></div></aside>
      <div className="stack"><div className="panel trajectory-panel"><div className="panel-heading"><div><span className="panel-kicker">02 / Observe</span><h3>Computed trajectory</h3></div><span className="live-indicator">Numerical output</span></div><div className="chart-card"><Plot points={points} id={id} comparison={comparison}/></div><p className="muted">RK4 integration · {points.length.toLocaleString()} computed samples{comparison ? ' · Amber line shows saved comparison' : ''}</p></div>
      <div className="panel fitting-panel"><span className="panel-kicker">03 / Discover</span><h3>Dataset & fitting</h3><label className="field">Upload numerical CSV (max 2 MB)<input type="file" accept=".csv,text/csv" onChange={e => upload(e.target.files?.[0])}/></label><div className="status">{data.source} · {data.rows.length} samples</div><label className="field">Time column<select value={timeCol} onChange={e => setTimeCol(e.target.value)}>{data.columns.map(c => <option key={c}>{c}</option>)}</select></label><div className="field">State variables{data.columns.filter(c => c !== timeCol).map(c => <label className="check-label" key={c}><input type="checkbox" checked={stateCols.includes(c)} onChange={e => setStateCols(e.target.checked ? [...stateCols, c] : stateCols.filter(x => x !== c))}/> {c}</label>)}</div><label className="field">Polynomial degree<select value={degree} onChange={e => setDegree(Number(e.target.value) as 1 | 2)}><option value="1">Linear</option><option value="2">Quadratic</option></select></label><label className="field">Sparsity threshold: <output>{threshold.toFixed(3)}</output><input type="range" min="0" max="1" step=".005" value={threshold} onChange={e => setThreshold(Number(e.target.value))}/></label><button type="button" className="primary" onClick={runFit}>Fit candidate equations</button>{error && <p className="error" role="alert">{error}</p>}<h4>Data preview</h4><div className="data-table"><table><thead><tr>{data.columns.map(c => <th key={c}>{c}</th>)}</tr></thead><tbody>{data.rows.slice(0, 8).map((row, i) => <tr key={i}>{row.map((v, j) => <td key={j}>{v.toFixed(4)}</td>)}</tr>)}</tbody></table></div></div></div>
      <aside className="panel result-panel" id="result"><span className="panel-kicker">04 / Evaluate</span><h3>Candidate model</h3>{fit ? <><div className="candidate-label">Fitted from {fit.source}</div><div className="equation-results" key={`${fit.source}-${fit.equations.join('|')}`}>{fit.equations.map((x, i) => <div className="fit-equation" key={i}>{x}</div>)}</div><FitPlot fit={fit}/><div className="metrics"><div className="metric"><strong>{fit.rmse.toFixed(4)}</strong><small>RMSE</small></div><div className="metric"><strong>{fit.r2 === null ? 'N/A' : fit.r2.toFixed(3)}</strong><small>R²</small></div><div className="metric"><strong>{fit.activeTerms}</strong><small>Terms</small></div></div><p className="muted">{fit.limitation}</p><div className="stack"><button type="button" className="outline" onClick={save} disabled={!fitData}>Save model locally</button><button type="button" className="outline" onClick={() => fitData && download('dynamo-discovery.json', discoveryPackage(fit, fitData))} disabled={!fitData}>Download discovery package</button></div>
        <div className="publication"><h4>Optional onchain record</h4><p>Publishing stores model, dataset, and metadata hashes only. Your CSV stays in your browser. A wallet on BNB Smart Chain and BNB for gas are required. A registry record does not prove the model is scientifically correct.</p><p className="hash">Registry: <a href={`https://bscscan.com/address/${registryAddress}`} target="_blank" rel="noreferrer">{registryAddress || 'Not configured'}</a></p>{wallet && <p className="network-label">Wallet network: {walletChainId === 56 ? 'BNB Smart Chain mainnet' : walletChainId ? `Chain ${walletChainId}` : 'Checking'}</p>}{wallet && walletChainId !== 56 && <button type="button" className="outline" onClick={switchNetwork}>Switch to BSC mainnet</button>}{discoveries.length > 0 && <label className="field">Relationship<select value={parentId} onChange={e => { setParentId(Number(e.target.value)); setPlan(null); }}><option value="0">New discovery</option>{discoveries.map(d => <option value={d.id} key={d.id}>Improvement of #{d.id}</option>)}</select></label>}{!wallet && <button type="button" className="outline" onClick={connect}>Connect wallet</button>}<button type="button" className="primary" onClick={prepare} disabled={!registryConfigured || !wallet || walletChainId !== 56 || !fitData || preparing || publishing}>{preparing ? 'Checking mainnet…' : 'Prepare publication'}</button>{plan && <div className="publication-plan"><strong>Review before MetaMask</strong><span>Account: {plan.account}</span><span>{plan.parentId ? `Improvement of #${plan.parentId}` : 'New discovery'}</span><span>Estimated gas: {plan.gasEstimate.toString()}</span><span>Estimated network cost: {formatEther(plan.estimatedCost)} BNB</span><span>Available: {formatEther(plan.balance)} BNB</span><span>Model hash: {plan.hashes.modelHash}</span><span>Dataset hash: {plan.hashes.datasetHash}</span><span>Metadata hash: {plan.hashes.metadataHash}</span><small>Gas price can change. MetaMask shows the final fee before you confirm.</small><button type="button" className="primary" onClick={publish} disabled={publishing}>{publishing ? 'Waiting for wallet or receipt…' : 'Review transaction in MetaMask'}</button></div>}{!registryConfigured && <p className="muted">Onchain publishing is unavailable until the verified registry address is configured.</p>}{publicationHash && <a href={`https://bscscan.com/tx/${publicationHash}`} target="_blank" rel="noreferrer">View publication transaction on BscScan</a>}</div>
      </> : <p className="muted">Run a fit to see candidate equations and measured error. A built-in system is not automatically a discovery.</p>}{chainStatus && <p className="status" role="status">{chainStatus}</p>}{saved.length > 0 && <><h4>Saved in this browser</h4>{saved.slice(0, 3).map((s, i) => <button type="button" className="outline saved-button" key={i} onClick={() => { setFit(s.fit); setFitData(s.data || null); if (s.data) setData(s.data); setPlan(null); }}>{s.fit.variable} · {s.fit.source}</button>)}</>}</aside></div>
    </div></section>

    <section id="discoveries" className="section records-section"><div className="container"><span className="eyebrow">Public record</span><h2>Registered discoveries</h2><p className="muted">Confirmed commitments on BNB Smart Chain. Full datasets and scientific validation remain offchain.</p>{registryError && <p className="error" role="alert">Registry read failed: {registryError}</p>}<div id="explorer" className="discovery-list">{discoveries.length ? discoveries.map(d => <article className="panel discovery-item" key={d.id}><strong>#{d.id}</strong><div><div className="hash">Creator: {d.creator}</div><div className="hash">Model: {d.modelHash}</div><div className="hash">Dataset: {d.datasetHash}</div><div className="record-meta">{d.parentId ? `Improvement of #${d.parentId}` : 'Original discovery'} · {d.verificationCount} verification submissions</div><details className="verify-details"><summary>Submit a verification report commitment</summary><p>Enter your report or a clear statement about your independent evaluation. Its hash is submitted; the text stays here and is not stored onchain. A submission does not certify correctness.</p><textarea aria-label={`Verification report for discovery ${d.id}`} value={reportText[d.id] || ''} onChange={e => { setReportText({ ...reportText, [d.id]: e.target.value }); setVerificationPlan(null); }} rows={3}/>{!wallet && <button type="button" className="outline" onClick={connect}>Connect wallet</button>}<button type="button" className="outline" disabled={!wallet || !reportText[d.id]?.trim() || verifying} onClick={() => prepareReport(d.id)}>Prepare verification</button>{verificationPlan?.id === d.id && <div className="publication-plan"><span>Report hash: {verificationPlan.reportHash}</span><span>Estimated cost: {formatEther(verificationPlan.estimatedCost)} BNB</span><button type="button" className="primary" disabled={verifying} onClick={submitReport}>Review verification in MetaMask</button></div>}{verificationHash && <a href={`https://bscscan.com/tx/${verificationHash}`} target="_blank" rel="noreferrer">View verification transaction</a>}</details></div><a className="outline" href={`https://bscscan.com/address/${registryAddress}#readContract`} target="_blank" rel="noreferrer">Inspect registry</a></article>) : <div className="empty"><h3>No onchain discoveries yet</h3><p className="muted">The verified registry currently has no public records. Fit a model and choose whether to publish its commitment.</p></div>}</div></div></section>
    <section id="map" className="section"><div className="container"><span className="eyebrow">Knowledge graph</span><h2>Discovery map</h2>{discoveries.length ? <div className="panel"><svg className="map-canvas" viewBox="0 0 800 400" role="img" aria-label="Registered discovery relationship map">{discoveries.map((d, i) => { const parent = discoveries.find(x => x.id === d.parentId); if (!parent) return null; const j = discoveries.indexOf(parent); return <line key={d.id} x1={80 + (i % 7) * 105} y1={80 + Math.floor(i / 7) * 110} x2={80 + (j % 7) * 105} y2={80 + Math.floor(j / 7) * 110} stroke="#879a56" strokeWidth="2"/>; })}{discoveries.map((d, i) => <g key={d.id}><circle cx={80 + (i % 7) * 105} cy={80 + Math.floor(i / 7) * 110} r="24" fill="#b9e443" stroke="#191919"/><text x={80 + (i % 7) * 105} y={85 + Math.floor(i / 7) * 110} textAnchor="middle" fontSize="13">{d.id}</text></g>)}</svg></div> : <div className="empty"><h3>The map grows with real publications</h3><p className="muted">Parent links connect registered discoveries when registry data is available.</p></div>}</div></section></main>
    <footer className="footer"><div className="container">DYNAMO · Candidate models require independent validation · Onchain commitments record publication, not scientific truth.</div></footer>
  </>;
}
