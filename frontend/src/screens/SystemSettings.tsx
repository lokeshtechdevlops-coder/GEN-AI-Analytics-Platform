import React, { useEffect, useState } from 'react';
import api, { getApiErrorMessage } from '../services/api';
import { connectorTypes, listBindings, listConnections, listJobs, SYSTEM_TABS } from '../services/systemService';
import { getDatasets } from '../services/datasetService';

const inputClass = 'border border-slate-300 rounded-lg p-2 w-full bg-white';
const buttonClass = 'border border-slate-300 rounded-lg px-3 py-2 bg-white disabled:opacity-40';
const configFields: Record<string, string[]> = {
  rest: ['base_url', 'discovery_path', 'records_path', 'pagination', 'next_link_path', 'page_size'],
  odata: ['base_url'], s4hana: ['base_url', 'api_service'], sac: ['base_url', 'namespace', 'provider_id'],
  soap: ['base_url', 'wsdl_url', 'service_name', 'port_name', 'records_path'], hana: ['host', 'port', 'schema'],
  s3: ['bucket', 'region', 'prefix'], gcs: ['bucket', 'project', 'prefix'], azure_blob: ['account_url', 'bucket', 'prefix'],
};
const credentialFields: Record<string, string[]> = {
  none: [], managed: [], basic: ['username', 'password'], bearer: ['token'], api_key: ['api_key'],
  oauth2_client_credentials: ['client_id', 'client_secret'], aws_keys: ['access_key_id', 'secret_access_key', 'session_token'],
  service_account: ['service_account_json'], azure_key: ['account_key'], azure_sas: ['sas_token'],
};

export const SystemSettings: React.FC<{ onNavigate: (path: string) => void; initialTab?: string }> = ({ initialTab }) => {
  const [tab, setTab] = useState(initialTab || 'Connections');
  const [connections, setConnections] = useState<any[]>([]);
  const [types, setTypes] = useState<any[]>([]);
  const [bindings, setBindings] = useState<any[]>([]);
  const [datasets, setDatasets] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [audit, setAudit] = useState<any[]>([]);
  const [access, setAccess] = useState<any>(null);
  const [ai, setAI] = useState<any>(null);
  const [storage, setStorage] = useState<any>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editRevision, setEditRevision] = useState(0);
  const [name, setName] = useState('');
  const [service, setService] = useState('rest');
  const [config, setConfig] = useState<Record<string, any>>({});
  const [auth, setAuth] = useState('none');
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [mapping, setMapping] = useState('{}');
  const [operationParameters, setOperationParameters] = useState('{}');
  const [discovery, setDiscovery] = useState<any>(null);
  const [connectionId, setConnectionId] = useState('');
  const [source, setSource] = useState('');
  const [bindingName, setBindingName] = useState('');
  const [targetDataset, setTargetDataset] = useState('');
  const [mode, setMode] = useState('replace');
  const [keys, setKeys] = useState('');
  const [duplicatePolicy, setDuplicatePolicy] = useState('keep');
  const [deletionField, setDeletionField] = useState('');
  const [transformationPlan, setTransformationPlan] = useState('{}');
  const run = async (operation: () => Promise<void>) => {
    setBusy(true); setError(''); setMessage('');
    try { await operation(); } catch (err) { setError(getApiErrorMessage(err, 'System operation failed.')); }
    finally { setBusy(false); }
  };
  const refresh = async () => {
    if (tab === 'Connections') {
      const [items, registry, sources, data] = await Promise.all([listConnections(), connectorTypes(), listBindings(), getDatasets()]);
      setConnections(items); setTypes(registry); setBindings(sources); setDatasets(data);
    } else if (tab === 'Sync Jobs') setJobs(await listJobs());
    else if (tab === 'AI Configuration') setAI((await api.get('/system/ai')).data);
    else if (tab === 'Storage & Retention') setStorage((await api.get('/system/storage')).data);
    else { setAudit((await api.get('/system/audit')).data); setAccess((await api.get('/system/access')).data); }
  };
  useEffect(() => { void run(refresh); }, [tab]);
  useEffect(() => {
    if (tab !== 'Sync Jobs') return;
    const interval = window.setInterval(() => { listJobs().then(setJobs).catch(err => setError(getApiErrorMessage(err, 'Job polling failed.'))); }, 3000);
    return () => window.clearInterval(interval);
  }, [tab]);
  const saveConnection = async () => {
    const descriptor = types.find(type => type.service === service);
    if (!descriptor) throw new Error('Choose a supported connector service.');
    const extra = ['rest', 'odata', 's4hana', 'sac', 'soap'].includes(service) ? { response_mapping: JSON.parse(mapping), ...(service === 'soap' ? { operation_parameters: JSON.parse(operationParameters) } : {}) } : {};
    const body = { name, provider: descriptor.provider, protocol: descriptor.protocol, service: descriptor.service, auth_type: auth, config: { ...config, ...extra }, credentials: Object.fromEntries(Object.entries(credentials).filter(([, value]) => value)) };
    if (editId) await api.put(`/system/connections/${editId}`, body, { params: { revision: editRevision } });
    else await api.post('/system/connections', body);
    setCredentials({}); setEditId(null); setEditRevision(0); setName(''); setConfig({});
    setConnections(await listConnections()); setMessage('Connection configuration saved. Test it to verify live access.');
  };
  return <div className="space-y-5">
    <div><h1 className="text-3xl font-semibold">System Management</h1><p className="mt-2 text-slate-500">Manage external connections, processing jobs, AI settings, retention, and access.</p></div>
    <nav className="flex gap-2 overflow-x-auto" aria-label="System Management sections">{SYSTEM_TABS.map(value => <button key={value} onClick={() => setTab(value)} className={`px-4 py-2 rounded-xl whitespace-nowrap ${value === tab ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200'}`}>{value}</button>)}</nav>
    {error && <p role="alert" className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-xl">{error}</p>}
    {message && <p role="status" className="bg-blue-50 p-4 rounded-xl">{message}</p>}
    {tab === 'Connections' && <>
      <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4"><h2 className="text-lg font-semibold">{editId ? 'Edit connection' : 'Create connection'}</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
          <label>Name<input className={inputClass} value={name} onChange={e => setName(e.target.value)} /></label>
          <label>Service<select className={inputClass} value={service} onChange={e => { setService(e.target.value); setAuth(types.find(type => type.service === e.target.value)?.auth_types?.[0] || 'none'); setConfig({}); setCredentials({}); }}>{types.map(type => <option key={type.service} value={type.service}>{type.provider.toUpperCase()} / {type.service}</option>)}</select></label>
          <label>Authentication<select className={inputClass} value={auth} onChange={e => { setAuth(e.target.value); setCredentials({}); }}>{(types.find(type => type.service === service)?.auth_types || ['none']).map((type: string) => <option key={type}>{type}</option>)}</select></label>
          {(configFields[service] || []).map(field => <label key={field}>{field.replaceAll('_', ' ')}<input className={inputClass} value={config[field] ?? ''} onChange={e => setConfig(previous => ({ ...previous, [field]: e.target.value }))} /></label>)}
          {auth === 'oauth2_client_credentials' && <><label>Token endpoint<input className={inputClass} value={config.token_url || ''} onChange={e => setConfig({ ...config, token_url: e.target.value })} /></label><label>Scope<input className={inputClass} value={config.scope || ''} onChange={e => setConfig({ ...config, scope: e.target.value })} /></label></>}
          {(credentialFields[auth] || []).map(field => <label key={field}>{field.replaceAll('_', ' ')}<input type="password" autoComplete="off" className={inputClass} placeholder={editId ? 'Leave blank to retain saved credentials' : ''} value={credentials[field] || ''} onChange={e => setCredentials(previous => ({ ...previous, [field]: e.target.value }))} /></label>)}
        </div>
        {['rest', 'odata', 's4hana', 'sac', 'soap'].includes(service) && <div className="grid sm:grid-cols-2 gap-3 text-sm"><label>Response field mapping (field name to response path)<textarea className={`${inputClass} font-mono text-xs`} rows={4} value={mapping} onChange={e => setMapping(e.target.value)} /></label>{service === 'soap' && <label>Operation parameters<textarea className={`${inputClass} font-mono text-xs`} rows={4} value={operationParameters} onChange={e => setOperationParameters(e.target.value)} /></label>}</div>}
        <p className="text-xs text-slate-500">Credentials are stored encrypted on the server and are never returned to the browser.</p>
        <button disabled={busy || !name} className={buttonClass} onClick={() => void run(saveConnection)}>Save connection</button>
        {editId && <button className={`${buttonClass} ml-2`} onClick={() => { setEditId(null); setConfig({}); setCredentials({}); setName(''); }}>Cancel edit</button>}
      </section>
      <div className="grid lg:grid-cols-2 gap-4">{connections.map(item => <section key={item.id} className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3"><div className="flex justify-between"><h3 className="font-semibold">{item.name}</h3><span className="text-sm">{item.enabled ? item.verification : 'disabled'}</span></div><p className="text-sm text-slate-500">{item.provider} / {item.service} / {item.protocol}</p>
        {item.verified_at && <p className="text-xs text-slate-500">Last verified: {new Date(item.verified_at).toLocaleString()}</p>}
        <div className="flex flex-wrap gap-2"><button disabled={busy || !item.enabled} className={buttonClass} onClick={() => void run(async () => { const result = (await api.post(`/system/connections/${item.id}/test`)).data; setMessage(`Connection verified in ${result.elapsed_ms.toFixed(2)} ms.`); setConnections(await listConnections()); })}>Test</button>
          <button disabled={busy || !item.enabled} className={buttonClass} onClick={() => void run(async () => { setConnectionId(item.id); setDiscovery((await api.get(`/system/connections/${item.id}/discover`)).data); })}>Discover</button>
          <button disabled={busy} className={buttonClass} onClick={() => { setEditId(item.id); setEditRevision(item.revision); setName(item.name); setService(item.service); setAuth(item.auth_type); setConfig(item.config); setCredentials({}); setMapping(JSON.stringify(item.config.response_mapping || {}, null, 2)); setOperationParameters(JSON.stringify(item.config.operation_parameters || {}, null, 2)); }}>Edit</button>
          <button disabled={busy || !item.enabled} className={buttonClass} onClick={() => void run(async () => { await api.post(`/system/connections/${item.id}/disable`); setConnections(await listConnections()); })}>Disable</button></div>
      </section>)}</div>
      {discovery && <section className="bg-white border rounded-2xl p-5"><h2 className="font-semibold mb-2">Discovered objects / preview</h2><pre className="text-xs overflow-auto max-h-80">{JSON.stringify(discovery, null, 2)}</pre></section>}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4"><h2 className="text-lg font-semibold">Bind a source to a dataset</h2><div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
        <label>Connection<select className={inputClass} value={connectionId} onChange={e => setConnectionId(e.target.value)}><option value="">Choose a connection</option>{connections.filter(c => c.enabled).map(c => <option value={c.id} key={c.id}>{c.name}</option>)}</select></label>
        <label>Source object / entity / SOAP operation<input className={inputClass} value={source} onChange={e => setSource(e.target.value)} /></label>
        <label>Binding name<input className={inputClass} value={bindingName} onChange={e => setBindingName(e.target.value)} /></label>
        <label>Target dataset<select className={inputClass} value={targetDataset} onChange={e => setTargetDataset(e.target.value)}><option value="">Create a dataset on first sync</option>{datasets.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
        <label>Import mode<select className={inputClass} value={mode} onChange={e => setMode(e.target.value)}>{['replace', 'append', 'upsert'].map(value => <option key={value}>{value}</option>)}</select></label>
        <label>Duplicate policy<select className={inputClass} value={duplicatePolicy} onChange={e => setDuplicatePolicy(e.target.value)}>{['keep', 'drop', 'reject'].map(value => <option key={value}>{value}</option>)}</select></label>
        {mode === 'upsert' && <><label>Stable key fields (comma separated)<input className={inputClass} value={keys} onChange={e => setKeys(e.target.value)} /></label><label>Deletion event boolean field (optional)<input className={inputClass} value={deletionField} onChange={e => setDeletionField(e.target.value)} /></label></>}
      </div><label className="block text-sm">Parsing and transformations (JSON)<textarea aria-label="Source transformation plan" className={`${inputClass} font-mono text-xs`} rows={4} value={transformationPlan} onChange={e => setTransformationPlan(e.target.value)} /></label><div className="flex gap-2"><button disabled={busy || !connectionId || !source} className={buttonClass} onClick={() => void run(async () => { setDiscovery((await api.post(`/system/connections/${connectionId}/preview`, { source })).data); })}>Preview source</button>
        <button disabled={busy || !connectionId || !source || !bindingName} className={buttonClass} onClick={() => void run(async () => { await api.post('/system/bindings', { name: bindingName, connection_id: connectionId, source, dataset_id: targetDataset || null, mode, keys: keys.split(',').map(v => v.trim()).filter(Boolean), duplicate_policy: duplicatePolicy, deletion_field: deletionField || null, transformation_plan: JSON.parse(transformationPlan) }); setBindings(await listBindings()); setMessage('Source binding saved. Start a sync when ready.'); })}>Save source binding</button></div></section>
      <section className="bg-white border rounded-2xl p-5 space-y-3"><h2 className="font-semibold">Source bindings</h2>{!bindings.length && <p className="text-sm text-slate-500">No source bindings configured.</p>}{bindings.map(binding => <div key={binding.id} className="flex flex-wrap justify-between gap-3 border-t pt-3"><div><p>{binding.name} ? {binding.mode}</p><p className="text-xs text-slate-500">{binding.source}{binding.last_synced_at ? ` ? Last sync: ${binding.last_synced_at}` : ''}</p></div><button disabled={busy} className={buttonClass} onClick={() => void run(async () => { await api.post(`/system/bindings/${binding.id}/sync`, { idempotency_key: crypto.randomUUID() }); setMessage('Sync queued. Track its status in Sync Jobs.'); })}>Start sync</button></div>)}</section>
    </>}
    {tab === 'Sync Jobs' && <section className="bg-white border rounded-2xl p-5 space-y-3"><h2 className="font-semibold">Ingestion and indexing jobs</h2>{!jobs.length && <p className="text-slate-500">No jobs have been scheduled.</p>}{jobs.map(job => <div key={job.id} className="border-t py-3 space-y-2"><div className="flex flex-wrap justify-between gap-2"><p>{job.kind} ? {job.state} ? {job.stage}</p><span className="text-xs text-slate-500">Attempts: {job.attempts}</span></div><p className="text-xs text-slate-500">{job.updated_at}</p>{job.error && <p className="text-red-700 text-sm">{job.error}</p>}{['queued', 'running'].includes(job.state) && <button className={buttonClass} onClick={() => void run(async () => { await api.post(`/system/jobs/${job.id}/cancel`); setJobs(await listJobs()); })}>Request cancellation</button>}{['failed', 'cancelled'].includes(job.state) && <button className={buttonClass} onClick={() => void run(async () => { await api.post(`/system/jobs/${job.id}/retry`); setJobs(await listJobs()); })}>Retry</button>}</div>)}</section>}
    {tab === 'AI Configuration' && ai && <section className="bg-white border rounded-2xl p-5 space-y-4"><h2 className="font-semibold">AI models</h2><p className="text-sm">NVIDIA credentials: {ai.nvidia_credentials_configured ? 'configured' : 'not configured'} ? SAP AI Core credentials: {ai.aicore_credentials_configured ? 'configured' : 'not configured'}</p><div className="grid sm:grid-cols-2 gap-3 text-sm">{['llm_model', 'embedding_model', 'max_tokens', 'temperature'].map(field => <label key={field}>{field.replaceAll('_', ' ')}<input className={inputClass} value={ai[field]} onChange={e => setAI({ ...ai, [field]: ['max_tokens', 'temperature'].includes(field) ? Number(e.target.value) : e.target.value })} /></label>)}</div><p className="text-xs text-slate-500">Embedding changes require reindexing. Requests and queued jobs retain their selected AI configuration.</p><button disabled={busy} className={buttonClass} onClick={() => void run(async () => { const { llm_model, embedding_model, max_tokens, temperature } = ai; setAI((await api.put('/system/ai', { llm_model, embedding_model, max_tokens, temperature })).data); setMessage('AI configuration saved.'); })}>Save AI configuration</button></section>}
    {tab === 'Storage & Retention' && storage && <section className="bg-white border rounded-2xl p-5 space-y-4"><h2 className="font-semibold">Storage and version retention</h2><p>Metadata: {storage.metadata_backend} ? Dataset catalog: {storage.dataset_backend} ? Objects: {storage.object_backend}</p><label className="block text-sm">Maximum versions (0 retains all)<input type="number" min={0} className={`${inputClass} max-w-xs block`} value={storage.max_versions} onChange={e => setStorage({ ...storage, max_versions: Number(e.target.value) })} /></label><p className="text-sm text-slate-500">{storage.retention_note}</p><button disabled={busy} className={buttonClass} onClick={() => void run(async () => { setStorage((await api.put('/system/storage', { max_versions: storage.max_versions })).data); setMessage('Retention policy saved.'); })}>Save retention policy</button></section>}
    {tab === 'Access & Audit' && <section className="bg-white border rounded-2xl p-5 space-y-4"><h2 className="font-semibold">Access and audit</h2>{access && <><p>Workspace: {access.workspace_id} ? Roles: {access.roles.join(', ')}</p><p className="text-sm text-slate-500">{access.policy}</p></>}<div className="overflow-auto max-h-96"><table className="text-sm w-full text-left"><thead><tr><th>Timestamp</th><th>Account</th><th>Action</th><th>Resource</th></tr></thead><tbody>{audit.map((item, index) => <tr key={index} className="border-t"><td className="p-2">{item.timestamp}</td><td>{item.user_id}</td><td>{item.action}</td><td>{item.resource}</td></tr>)}</tbody></table></div></section>}
  </div>;
};
