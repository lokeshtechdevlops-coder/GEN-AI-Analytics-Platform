import React, { useEffect, useState } from 'react';
import api, { getApiErrorMessage } from '../services/api';
import { selectedContext, ensureDefaultContext } from '../services/executionContext';
import { AnalyticsDefinition, ExecutionResult, SemanticModel, executePlan, getRecommendations, getSemanticModels, proposeRecommendations, reviewDefinition, saveDefinition } from '../services/semanticService';
import { AnalyticsWidget } from '../components/AnalyticsWidget';

export function GraphStudio({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [model, setModel] = useState<SemanticModel | null>(null);
  const [items, setItems] = useState<AnalyticsDefinition[]>([]);
  const [previews, setPreviews] = useState<Record<string, ExecutionResult>>({});
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState('');
  const [metric, setMetric] = useState('*');
  const [aggregation, setAggregation] = useState('COUNT');
  const [dimension, setDimension] = useState('');
  const [kind, setKind] = useState('kpi');
  const [selected, setSelected] = useState<string[]>([]);
  const [edit, setEdit] = useState<AnalyticsDefinition | null>(null);
  const [planText, setPlanText] = useState('');
  const [customPrompt, setCustomPrompt] = useState('');
  const [customJob, setCustomJob] = useState('');
  const [customState, setCustomState] = useState('');
  const [customImage, setCustomImage] = useState('');
  useEffect(() => {
    if (!customJob) return;
    let cancelled = false;
    let artifactUrl = '';
    const poll = async () => {
      try {
        const job = (await api.get(`/system/jobs/${customJob}`)).data;
        if (cancelled) return;
        setCustomState(`${job.state} · ${job.stage}`);
        if (job.state === 'succeeded') {
          window.clearInterval(timer);
          const image = (await api.get(`/system/jobs/${customJob}/artifact`, { responseType: 'blob' })).data;
          if (!cancelled) { artifactUrl = URL.createObjectURL(image); setCustomImage(artifactUrl); }
        } else if (['failed', 'cancelled'].includes(job.state)) {
          window.clearInterval(timer); if (job.error) setError(job.error);
        }
      } catch (err) { if (!cancelled) setError(getApiErrorMessage(err, 'Custom chart status could not be loaded.')); }
    };
    const timer = window.setInterval(() => void poll(), 3000);
    void poll();
    return () => { cancelled = true; window.clearInterval(timer); if (artifactUrl) URL.revokeObjectURL(artifactUrl); };
  }, [customJob]);
  const load = async () => {
    let context = selectedContext();
    if (!context) {
      context = await ensureDefaultContext();
    }
    if (!context) throw new Error('Select a dataset and version first.');
    const models = await getSemanticModels(context.datasetId, context.version);
    const approved = models.find(m => m.revision === context.semanticRevision && m.status === 'approved') || models.find(m => m.status === 'approved') || models[0];
    if (!approved) throw new Error('Approve a semantic model in Upload Dataset and select its revision.');
    setModel(approved); setItems(await getRecommendations());
  };
  const run = async (operation: () => Promise<void>) => {
    setBusy(true); setError(''); setMessage('');
    try { await operation(); } catch (err) { setError(getApiErrorMessage(err, 'Operation failed.')); }
    finally { setBusy(false); }
  };
  useEffect(() => { void run(load); }, []);
  const preview = async (item: AnalyticsDefinition) => {
    const result = await executePlan(item.query_plan);
    setPreviews(previous => ({ ...previous, [`${item.id}:${item.revision}`]: result }));
  };
  const save = async () => {
    const query = edit ? JSON.parse(planText) : { metric, aggregation, dimension: dimension || undefined };
    const item: AnalyticsDefinition = edit ? { ...edit, title, query_plan: query, kind } : {
      id: crypto.randomUUID(), title: title || `${aggregation} ${metric}`, kind, revision: 1,
      semantic_revision: model!.revision, query_plan: query, dependencies: [metric, dimension].filter(v => v && v !== '*'),
      explanation: 'A user-defined query over approved semantic fields.', status: 'proposed',
    };
    await saveDefinition(item); setItems(await getRecommendations()); setEdit(null); setTitle('');
    setMessage('Saved a new proposed definition revision. Preview it before approval.');
  };
  return <div className="space-y-5">
    <div className="flex flex-wrap justify-between gap-3"><div><h1 className="text-3xl font-semibold">Graph Studio</h1><p className="mt-2 text-slate-500">Build, review, and publish dataset-specific KPIs and charts.</p></div>
      <button disabled={busy || !model} onClick={() => void run(async () => { await proposeRecommendations(); setItems(await getRecommendations()); })} className="bg-blue-600 text-white rounded-xl px-4 py-2">Propose recommendations</button></div>
    {error && <p role="alert" className="p-4 bg-red-50 border border-red-200 text-red-800 rounded-xl">{error}</p>}
    {message && <p role="status" className="p-3 bg-blue-50 rounded-xl">{message}</p>}
    {!model && <button onClick={() => onNavigate('upload-dataset')} className="border rounded-xl px-4 py-2">Open semantic review</button>}
    {model && <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
      <h2 className="text-lg font-semibold">{edit ? 'Edit as a new revision' : 'Create a definition'}</h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3 text-sm">
        <label>Title<input className="border rounded-lg p-2 w-full" value={title} onChange={e => setTitle(e.target.value)} /></label>
        {!edit && <><label>Metric<select className="border rounded-lg p-2 w-full" value={metric} onChange={e => { setMetric(e.target.value); setAggregation('COUNT'); }}><option value="*">Source rows</option>{model.fields.map(f => <option key={f.name} value={f.name}>{f.semantic_name}</option>)}</select></label>
          <label>Aggregation<select className="border rounded-lg p-2 w-full" value={aggregation} onChange={e => setAggregation(e.target.value)}>{(metric === '*' ? ['COUNT'] : model.fields.find(f => f.name === metric)?.aggregations || []).map(agg => <option key={agg}>{agg}</option>)}</select></label>
          <label>Group by<select className="border rounded-lg p-2 w-full" value={dimension} onChange={e => setDimension(e.target.value)}><option value="">No grouping</option>{model.fields.filter(f => ['dimension', 'identifier', 'time'].includes(f.role)).map(f => <option key={f.name} value={f.name}>{f.semantic_name}</option>)}</select></label></>}
        <label>Display<select className="border rounded-lg p-2 w-full" value={kind} onChange={e => setKind(e.target.value)}>{['kpi', 'table', 'bar', 'line', 'scatter', 'pie'].map(type => <option key={type}>{type}</option>)}</select></label>
      </div>
      {edit && <label className="block text-sm">Query plan<textarea className="border rounded-lg p-2 w-full font-mono text-xs mt-1" rows={10} value={planText} onChange={e => setPlanText(e.target.value)} /></label>}
      <button disabled={busy} onClick={() => void run(save)} className="border rounded-lg px-4 py-2">Save proposal</button>
      {edit && <button onClick={() => setEdit(null)} className="ml-3 text-sm">Cancel edit</button>}
    </section>}
    {model && <details className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3"><summary className="font-semibold cursor-pointer">Advanced custom Python charts</summary>
      <p className="text-sm text-slate-500">Uses the fields and aggregation selected above. SAP AI Core generates chart code; an isolated worker executes it. Review the visual against the exact query results.</p>
      <textarea aria-label="Advanced chart request" className="border rounded-lg p-3 w-full" placeholder="Describe the advanced visualization" value={customPrompt} onChange={e => setCustomPrompt(e.target.value)} />
      <button disabled={busy || !customPrompt.trim()} className="border rounded-lg px-4 py-2" onClick={() => void run(async () => {
        const job = (await api.post('/graph/advanced', { prompt: customPrompt, query_plan: { metric, aggregation, dimension: dimension || undefined }, idempotency_key: crypto.randomUUID() })).data;
        setCustomImage(''); setCustomState('queued'); setCustomJob(job.id);
      })}>Queue custom chart</button>
      {customJob && <p role="status" className="text-sm">{customState} <button className="ml-2 underline" onClick={() => onNavigate('system-settings/jobs')}>Open job details</button></p>}
      {customImage && <img src={customImage} alt={customPrompt} className="w-full rounded-xl border" />}
    </details>}
    <section className="space-y-4"><h2 className="text-xl font-semibold">Recommendations and approvals</h2>
      {model && !items.length && <p className="text-slate-500">No recommendations yet. Propose supported analyses or create a definition above.</p>}
      {items.map(item => { const key = `${item.id}:${item.revision}`; return <article key={key} className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
        <div className="flex justify-between gap-3"><h3 className="font-semibold">{item.title}</h3><span className="text-sm">Revision {item.revision} · {item.status}</span></div>
        <p className="text-sm text-slate-600">{item.explanation}</p>
        {item.reviewer && <p className="text-xs text-slate-500">Reviewed by {item.reviewer} · {item.reviewed_at}</p>}
        <details className="text-sm"><summary>Definition, dependencies, and query plan</summary><p>{item.dependencies.join(', ') || 'Source row count'}</p><pre className="overflow-auto bg-slate-50 rounded-lg p-3 mt-2 text-xs">{JSON.stringify(item.query_plan, null, 2)}</pre></details>
        {previews[key] && <AnalyticsWidget definition={item} result={previews[key]} />}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button disabled={busy} onClick={() => void run(() => preview(item))} className="border rounded-lg px-3 py-2">Preview</button>
          <button disabled={busy} onClick={() => { setEdit(item); setPlanText(JSON.stringify(item.query_plan, null, 2)); setTitle(item.title); setKind(item.kind); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="border rounded-lg px-3 py-2">Edit</button>
          {item.status === 'proposed' && <>{(['approved', 'rejected'] as const).map(decision => <button key={decision} disabled={busy} onClick={() => void run(async () => { await reviewDefinition(item, decision); setItems(await getRecommendations()); })} className="border rounded-lg px-3 py-2">{decision === 'approved' ? 'Approve' : 'Reject'}</button>)}</>}
          {item.status === 'approved' && <label className="ml-2"><input type="checkbox" checked={selected.includes(key)} onChange={e => setSelected(previous => e.target.checked ? [...previous, key] : previous.filter(v => v !== key))} /> Include on dashboard</label>}
        </div>
      </article>; })}
    </section>
    <button disabled={busy || !selected.length} onClick={() => void run(async () => {
      await api.post('/insights/dashboard', { title: 'Analytics Dashboard', items: items.filter(i => selected.includes(`${i.id}:${i.revision}`)).map(i => ({ id: i.id, revision: i.revision })) });
      setMessage('Dashboard published with the selected approved definitions.');
    })} className="bg-blue-600 text-white rounded-xl px-5 py-3 disabled:opacity-40">Publish selected approved widgets</button>
  </div>;
}
