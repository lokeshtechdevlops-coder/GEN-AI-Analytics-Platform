import React, { useEffect, useState } from 'react';
import { selectedContext, ensureDefaultContext } from '../services/executionContext';
import { AnalyticsDefinition, ExecutionResult, SemanticModel, executePlan, getSemanticModels } from '../services/semanticService';
import { queryAnalytics } from '../services/analyticsService';
import { getApiErrorMessage } from '../services/api';
import { AnalyticsWidget } from '../components/AnalyticsWidget';

export const DataExplorer: React.FC<{ onNavigate: (path: string) => void }> = ({ onNavigate }) => {
  const [model, setModel] = useState<SemanticModel | null>(null);
  const [metric, setMetric] = useState('*');
  const [aggregation, setAggregation] = useState('COUNT');
  const [dimensions, setDimensions] = useState<string[]>([]);
  const [filters, setFilters] = useState('[]');
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [executedPlan, setExecutedPlan] = useState<Record<string, unknown>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      let context = selectedContext();
      if (!context) {
        context = await ensureDefaultContext();
      }
      if (!context) {
        if (!cancelled) setError('Select a dataset and version first.');
        return;
      }
      try {
        const models = await getSemanticModels(context.datasetId, context.version);
        if (cancelled) return;
        const approved = models.find(m => m.revision === context!.semanticRevision && m.status === 'approved') || models.find(m => m.status === 'approved') || models[0];
        if (!approved) setError('Approve and select a semantic model before querying this version.');
        else setModel(approved);
      } catch (err) {
        if (!cancelled) setError(getApiErrorMessage(err, 'Semantic model could not be loaded.'));
      }
    };
    void init();
    return () => { cancelled = true; };
  }, []);
  const run = async (natural: boolean) => {
    setBusy(true); setError(''); setResult(null);
    try {
      if (natural) {
        const response = await queryAnalytics(prompt);
        const plan = (response as any).query_plan || {};
        setExecutedPlan(plan);
        if ((response as any).status === 'invalid_query') throw new Error(response.summary_insights);
        setResult({ success: true, status: (response as any).status, data: response.results, summary: {}, records_matched: (response as any).records_matched ?? 0,
          records_total: response.records_scanned || 0, execution_time_ms: (response as any).execution_time_ms, context: {}, execution_backend: (response as any).execution_backend });
      } else {
        const plan = { metric, aggregation, dimensions, filters: JSON.parse(filters) };
        setExecutedPlan(plan); setResult(await executePlan(plan));
      }
    } catch (err) { setError(getApiErrorMessage(err, 'Query failed.')); }
    finally { setBusy(false); }
  };
  const definition: AnalyticsDefinition = { id: 'explorer', title: 'Query results', kind: 'table', revision: 1, semantic_revision: model?.revision || 1, query_plan: executedPlan, dependencies: [], explanation: '', status: 'proposed' };
  return <div className="space-y-5"><h1 className="text-3xl font-semibold">Data Explorer</h1><p className="text-slate-500">Query approved fields with exact calculations and explicit filters.</p>
    {error && <p role="alert" className="text-red-800 bg-red-50 border border-red-200 rounded-xl p-4">{error}</p>}
    {!model && <button className="border rounded-lg px-4 py-2" onClick={() => onNavigate('upload-dataset')}>Open semantic review</button>}
    {model && <><section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4"><h2 className="font-semibold">Structured query</h2><div className="grid sm:grid-cols-3 gap-3 text-sm">
      <label>Metric<select className="border rounded-lg p-2 w-full" value={metric} onChange={e => { setMetric(e.target.value); setAggregation('COUNT'); }}><option value="*">Source rows</option>{model.fields.map(f => <option key={f.name} value={f.name}>{f.semantic_name}</option>)}</select></label>
      <label>Aggregation<select className="border rounded-lg p-2 w-full" value={aggregation} onChange={e => setAggregation(e.target.value)}>{(metric === '*' ? ['COUNT'] : model.fields.find(f => f.name === metric)?.aggregations || []).map(a => <option key={a}>{a}</option>)}</select></label>
      <label>Group by (multiple selections supported)<select multiple className="border rounded-lg p-2 w-full" value={dimensions} onChange={e => setDimensions(Array.from(e.target.selectedOptions, option => option.value))}>{model.fields.filter(f => f.role !== 'measure').map(f => <option key={f.name} value={f.name}>{f.semantic_name}</option>)}</select></label></div>
      <details><summary className="text-sm cursor-pointer">Typed filters</summary><p className="text-xs text-slate-500 my-2">For example: [{'{"column":"Department","operator":"=","value":"IT"}'}]</p><textarea aria-label="Typed query filters" className="border rounded-lg p-2 w-full font-mono text-xs" rows={4} value={filters} onChange={e => setFilters(e.target.value)} /></details>
      <button disabled={busy} onClick={() => void run(false)} className="bg-blue-600 text-white rounded-lg px-4 py-2">Execute query</button></section>
      <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3"><h2 className="font-semibold">Ask in natural language</h2><textarea aria-label="Analytics question" className="border rounded-lg p-3 w-full" placeholder="Describe the metric, aggregation, and filters" value={prompt} onChange={e => setPrompt(e.target.value)} /><button disabled={busy || !prompt.trim()} className="border rounded-lg px-4 py-2" onClick={() => void run(true)}>Plan and execute</button></section></>}
    {result && <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3"><h2 className="font-semibold">Query results</h2><AnalyticsWidget definition={definition} result={result} /><details><summary>Executed query plan</summary><pre className="text-xs bg-slate-50 rounded-lg p-3 overflow-auto">{JSON.stringify(executedPlan, null, 2)}</pre></details></section>}
  </div>;
};
