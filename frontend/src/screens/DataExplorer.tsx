import React, { useEffect, useState, useRef } from 'react';
import { selectedContext, ensureDefaultContext } from '../services/executionContext';
import { AnalyticsDefinition, ExecutionResult, SemanticModel, executePlan, getSemanticModels } from '../services/semanticService';
import { queryAnalytics } from '../services/analyticsService';
import { getApiErrorMessage } from '../services/api';
import { AnalyticsWidget } from '../components/AnalyticsWidget';

// Chip-based multi-select component
function ChipSelector({ options, selected, onChange, label }: {
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (values: string[]) => void;
  label: string;
}) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = options.filter(o =>
    o.label.toLowerCase().includes(search.toLowerCase()) && !selected.includes(o.value)
  );

  return (
    <div ref={ref} className="relative">
      <label className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>
      <div
        className={`min-h-[42px] border rounded-xl px-2 py-1.5 bg-white cursor-text flex flex-wrap gap-1.5 items-center transition-all ${
          open ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-slate-300 hover:border-slate-400'
        }`}
        onClick={() => { setOpen(true); }}
      >
        {selected.map(val => {
          const opt = options.find(o => o.value === val);
          return (
            <span key={val} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-xs font-medium border border-blue-200">
              {opt?.label ?? val}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onChange(selected.filter(s => s !== val)); }}
                className="text-blue-400 hover:text-blue-700 transition-colors ml-0.5"
              >
                <span className="material-symbols-outlined text-[12px]">close</span>
              </button>
            </span>
          );
        })}
        <input
          className="flex-1 min-w-[80px] text-sm outline-none border-none bg-transparent py-0.5 px-1 placeholder:text-slate-400"
          placeholder={selected.length ? 'Add more…' : 'Search and select fields…'}
          value={search}
          onChange={e => { setSearch(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
        />
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-52 overflow-auto">
          {filtered.map(opt => (
            <button
              key={opt.value}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors flex items-center gap-2"
              onClick={() => { onChange([...selected, opt.value]); setSearch(''); }}
            >
              <span className="material-symbols-outlined text-[16px] text-slate-400">add_circle_outline</span>
              <span className="text-slate-700">{opt.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Quick suggestion chips
const SUGGESTIONS = [
  'Total Net Revenue by Sales Region',
  'Top 5 Products by Quantity Sold',
  'Monthly Margin trend for 2024',
  'Average Gross Margin by Quarter',
];

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
  const [mode, setMode] = useState<'structured' | 'natural'>('structured');

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
  const dimensionOptions = model?.fields.filter(f => f.role !== 'measure').map(f => ({ value: f.name, label: f.semantic_name })) ?? [];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            STRUCTURED ANALYTICS · QUERY ENGINE
          </span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">Data Explorer</h1>
        <p className="text-sm text-slate-500 mt-1">
          Query approved fields with exact calculations and explicit filters.
        </p>
      </div>

      {/* Error */}
      {error && (
        <div role="alert" className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
          <span className="material-symbols-outlined text-red-600 text-xl mt-0.5">error</span>
          <p className="text-sm font-medium text-red-800 flex-1">{error}</p>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600">
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>
      )}

      {!model && (
        <div className="bg-white border border-slate-200/80 rounded-2xl p-10 text-center space-y-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center">
            <span className="material-symbols-outlined text-amber-600 text-3xl">schema</span>
          </div>
          <p className="text-lg font-semibold text-slate-800">No semantic model available</p>
          <button className="inline-flex items-center gap-2 border border-slate-200 rounded-xl px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors" onClick={() => onNavigate('upload-dataset')}>
            <span className="material-symbols-outlined text-[16px]">open_in_new</span>
            Open semantic review
          </button>
        </div>
      )}

      {model && (
        <>
          {/* Mode Selector */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200/80 w-fit">
            <button
              onClick={() => setMode('structured')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                mode === 'structured'
                  ? 'bg-white text-slate-900 shadow-sm border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px]">tune</span>
                Structured Query
              </span>
            </button>
            <button
              onClick={() => setMode('natural')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                mode === 'natural'
                  ? 'bg-white text-slate-900 shadow-sm border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px]">auto_awesome</span>
                Natural Language (AI)
              </span>
            </button>
          </div>

          {/* Structured Query Panel */}
          {mode === 'structured' && (
            <section className="bg-white border border-slate-200/80 rounded-2xl p-5 sm:p-6 space-y-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="grid sm:grid-cols-3 gap-4 text-sm">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Metric</label>
                  <select
                    className="w-full border border-slate-300 rounded-xl p-2.5 bg-white text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                    value={metric}
                    onChange={e => { setMetric(e.target.value); setAggregation('COUNT'); }}
                  >
                    <option value="*">Source rows</option>
                    {model.fields.map(f => <option key={f.name} value={f.name}>{f.semantic_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Aggregation</label>
                  <select
                    className="w-full border border-slate-300 rounded-xl p-2.5 bg-white text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                    value={aggregation}
                    onChange={e => setAggregation(e.target.value)}
                  >
                    {(metric === '*' ? ['COUNT'] : model.fields.find(f => f.name === metric)?.aggregations || []).map(a =>
                      <option key={a}>{a}</option>
                    )}
                  </select>
                </div>
                <ChipSelector
                  label="Group by"
                  options={dimensionOptions}
                  selected={dimensions}
                  onChange={setDimensions}
                />
              </div>
              <details className="rounded-xl border border-slate-200 overflow-hidden">
                <summary className="cursor-pointer text-sm font-medium text-slate-700 px-4 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors flex items-center gap-2">
                  <span className="material-symbols-outlined text-[16px] text-slate-500">filter_alt</span>
                  Typed filters
                </summary>
                <div className="p-4 space-y-2">
                  <p className="text-xs text-slate-500">Example: <code className="px-1.5 py-0.5 bg-slate-100 rounded text-[11px]">[{`{"column":"Department","operator":"=","value":"IT"}`}]</code></p>
                  <textarea
                    aria-label="Typed query filters"
                    className="border border-slate-300 rounded-xl p-3 w-full font-mono text-xs resize-y focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                    rows={3}
                    value={filters}
                    onChange={e => setFilters(e.target.value)}
                  />
                </div>
              </details>
              <button
                disabled={busy}
                onClick={() => void run(false)}
                className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-5 py-2.5 text-sm font-medium shadow-sm transition-colors disabled:opacity-50"
              >
                <span className={`material-symbols-outlined text-[18px] ${busy ? 'animate-spin' : ''}`}>
                  {busy ? 'sync' : 'play_arrow'}
                </span>
                <span>{busy ? 'Running…' : 'Execute query'}</span>
              </button>
            </section>
          )}

          {/* Natural Language Panel */}
          {mode === 'natural' && (
            <section className="bg-white border border-slate-200/80 rounded-2xl p-5 sm:p-6 space-y-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <div className="flex items-center gap-2 mb-1">
                <span className="material-symbols-outlined text-purple-600 text-xl">auto_awesome</span>
                <h2 className="text-base font-semibold text-slate-900">Ask in natural language</h2>
              </div>

              {/* Suggestion Chips */}
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setPrompt(s)}
                    className="text-xs px-3 py-1.5 rounded-full border border-slate-200 bg-slate-50 text-slate-600 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 transition-all"
                  >
                    {s}
                  </button>
                ))}
              </div>

              <div className="relative">
                <textarea
                  aria-label="Analytics question"
                  className="border border-slate-300 rounded-xl p-4 pr-12 w-full text-sm resize-y focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                  placeholder="Describe the metric, aggregation, and filters…"
                  rows={3}
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && prompt.trim()) void run(true); }}
                />
                <div className="absolute bottom-3 right-3 text-[10px] text-slate-400 font-mono">
                  ⌘ Enter
                </div>
              </div>
              <button
                disabled={busy || !prompt.trim()}
                onClick={() => void run(true)}
                className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl px-5 py-2.5 text-sm font-medium shadow-sm transition-colors disabled:opacity-50"
              >
                <span className={`material-symbols-outlined text-[18px] ${busy ? 'animate-spin' : ''}`}>
                  {busy ? 'sync' : 'psychology'}
                </span>
                <span>{busy ? 'Planning…' : 'Plan and execute'}</span>
              </button>
            </section>
          )}
        </>
      )}

      {/* Results Section */}
      {result ? (
        <section className="bg-white border border-slate-200/80 rounded-2xl p-5 sm:p-6 space-y-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <span className="material-symbols-outlined text-blue-600 text-xl">table_chart</span>
              Query results
            </h2>
          </div>
          <AnalyticsWidget definition={definition} result={result} showTable={true} />
          <details className="rounded-xl border border-slate-200 overflow-hidden">
            <summary className="cursor-pointer text-sm font-medium text-slate-700 px-4 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px] text-slate-500">code</span>
              Executed query plan
            </summary>
            <pre className="text-xs bg-slate-50 p-4 overflow-auto font-mono text-slate-700">{JSON.stringify(executedPlan, null, 2)}</pre>
          </details>
        </section>
      ) : !busy && (
        <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-8 text-center text-slate-500 shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-slate-50 text-slate-400 flex items-center justify-center mx-auto mb-2">
            <span className="material-symbols-outlined text-2xl">insights</span>
          </div>
          <p className="text-sm font-semibold text-slate-700">Analytical Output Canvas</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Select dimensions or enter a natural language prompt above to compute results over the verified schema.
          </p>
        </div>
      )}
    </div>
  );
};
