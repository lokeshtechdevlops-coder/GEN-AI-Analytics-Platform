import React, { useEffect, useState } from 'react';
import api, { getApiErrorMessage } from '../services/api';
import { selectedContext, ensureDefaultContext } from '../services/executionContext';
import { AnalyticsDefinition, ExecutionResult, SemanticModel, executePlan, getRecommendations, getSemanticModels, proposeRecommendations, reviewDefinition, saveDefinition } from '../services/semanticService';
import { AnalyticsWidget } from '../components/AnalyticsWidget';

export function GraphStudio({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [model, setModel] = useState<SemanticModel | null>(null);
  const [items, setItems] = useState<AnalyticsDefinition[]>([]);
  const [previews, setPreviews] = useState<Record<string, ExecutionResult>>({});
  const [loadingPreviewId, setLoadingPreviewId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [publishedSuccess, setPublishedSuccess] = useState(false);
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
    setModel(approved);
    setItems(await getRecommendations());
  };

  const run = async (operation: () => Promise<void>) => {
    setBusy(true); setError(''); setMessage(''); setPublishedSuccess(false);
    try { await operation(); } catch (err) { setError(getApiErrorMessage(err, 'Operation failed.')); }
    finally { setBusy(false); }
  };

  useEffect(() => { void run(load); }, []);

  const togglePreview = async (item: AnalyticsDefinition) => {
    const key = `${item.id}:${item.revision}`;
    if (previews[key]) {
      // Toggle off
      setPreviews(previous => {
        const next = { ...previous };
        delete next[key];
        return next;
      });
      return;
    }
    setLoadingPreviewId(key);
    try {
      const result = await executePlan(item.query_plan);
      setPreviews(previous => ({ ...previous, [key]: result }));
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to preview query execution.'));
    } finally {
      setLoadingPreviewId(null);
    }
  };

  const save = async () => {
    const query = edit ? JSON.parse(planText) : { metric, aggregation, dimension: dimension || undefined };
    const item: AnalyticsDefinition = edit ? { ...edit, title, query_plan: query, kind } : {
      id: crypto.randomUUID(), title: title || `${aggregation} ${metric}`, kind, revision: 1,
      semantic_revision: model!.revision, query_plan: query, dependencies: [metric, dimension].filter(v => v && v !== '*'),
      explanation: 'A user-defined query over approved semantic fields.', status: 'proposed',
    };
    await saveDefinition(item);
    setItems(await getRecommendations());
    setEdit(null);
    setTitle('');
    setMessage('Saved a new definition proposal. Click "Preview" below to check the data, then "Approve".');
  };

  const handlePublishDashboard = async () => {
    if (!selected.length) return;
    await run(async () => {
      const selectedWidgets = items.filter(i => selected.includes(`${i.id}:${i.revision}`));
      await api.post('/insights/dashboard', {
        title: 'Analytics Dashboard',
        items: selectedWidgets.map(i => ({ id: i.id, revision: i.revision }))
      });
      setPublishedSuccess(true);
      setMessage(`Successfully published ${selectedWidgets.length} widget(s) to the Executive Dashboard!`);
    });
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 flex items-center gap-2.5">
            <span className="material-symbols-outlined text-blue-600 text-3xl">insights</span>
            <span>Graph Studio</span>
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Design, preview, and approve KPIs and charts, then publish them to the Executive Dashboard.
          </p>
        </div>

        <button
          disabled={busy || !model}
          onClick={() => void run(async () => {
            const result = await proposeRecommendations();
            setItems(result || await getRecommendations());
            setMessage('Auto-generated KPI recommendations from approved semantic fields.');
          })}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl px-4 py-2.5 shadow-sm transition-all disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-lg">{busy ? 'sync' : 'auto_awesome'}</span>
          <span>{busy ? 'Proposing...' : 'Propose Recommendations'}</span>
        </button>
      </div>

      {/* Global Alerts / Toasts */}
      {error && (
        <div role="alert" className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl flex items-start gap-3">
          <span className="material-symbols-outlined text-rose-600 text-xl mt-0.5">error</span>
          <div className="flex-1 text-sm font-medium">{error}</div>
          <button onClick={() => setError('')} className="text-rose-500 hover:text-rose-700">
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>
      )}

      {message && (
        <div role="status" className={`p-4 rounded-xl border flex items-center justify-between gap-3 ${publishedSuccess ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-blue-50 border-blue-200 text-blue-900'}`}>
          <div className="flex items-center gap-2.5 text-sm font-medium">
            <span className={`material-symbols-outlined text-xl ${publishedSuccess ? 'text-emerald-600' : 'text-blue-600'}`}>
              {publishedSuccess ? 'check_circle' : 'info'}
            </span>
            <span>{message}</span>
          </div>
          <div className="flex items-center gap-2">
            {publishedSuccess && (
              <button
                type="button"
                onClick={() => onNavigate('executive-dashboard')}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1 shadow-sm transition-colors"
              >
                <span>View Dashboard</span>
                <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
              </button>
            )}
            <button onClick={() => { setMessage(''); setPublishedSuccess(false); }} className="text-slate-400 hover:text-slate-600">
              <span className="material-symbols-outlined text-base">close</span>
            </button>
          </div>
        </div>
      )}

      {!model && (
        <div className="bg-amber-50 border border-amber-200 p-6 rounded-2xl text-center space-y-3">
          <span className="material-symbols-outlined text-amber-600 text-3xl">warning</span>
          <p className="text-amber-900 font-medium">No approved semantic model selected for this dataset version.</p>
          <button
            onClick={() => onNavigate('upload-dataset')}
            className="bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-xl px-4 py-2 text-sm shadow-sm transition-colors"
          >
            Open Semantic Review in Upload Dataset
          </button>
        </div>
      )}

      {/* KPI / Chart Definition Form */}
      {model && (
        <section id="definition-form" className={`bg-white border rounded-2xl p-5 sm:p-6 space-y-4 shadow-sm transition-colors ${edit ? 'border-amber-300 ring-2 ring-amber-400/20' : 'border-slate-200'}`}>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
              <span className="material-symbols-outlined text-blue-600 text-xl">{edit ? 'edit_note' : 'add_chart'}</span>
              <span>{edit ? `Edit Definition: "${edit.title}"` : 'Create a New KPI or Chart'}</span>
            </h2>
            {edit && (
              <button
                type="button"
                onClick={() => setEdit(null)}
                className="text-xs text-slate-500 hover:text-slate-700 font-medium px-2 py-1 rounded-md border border-slate-200 hover:bg-slate-50"
              >
                Cancel Edit
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 text-sm">
            <label className="flex flex-col gap-1 font-medium text-slate-700">
              Title
              <input
                className="border border-slate-300 rounded-lg p-2.5 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-normal"
                placeholder="e.g., Total Net Revenue"
                value={title}
                onChange={e => setTitle(e.target.value)}
              />
            </label>

            {!edit && (
              <>
                <label className="flex flex-col gap-1 font-medium text-slate-700">
                  Metric
                  <select
                    className="border border-slate-300 rounded-lg p-2.5 bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-normal"
                    value={metric}
                    onChange={e => { setMetric(e.target.value); setAggregation('COUNT'); }}
                  >
                    <option value="*">Source Rows (*)</option>
                    {model.fields.map(f => (
                      <option key={f.name} value={f.name}>{f.semantic_name} ({f.role})</option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1 font-medium text-slate-700">
                  Aggregation
                  <select
                    className="border border-slate-300 rounded-lg p-2.5 bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-normal"
                    value={aggregation}
                    onChange={e => setAggregation(e.target.value)}
                  >
                    {(metric === '*' ? ['COUNT'] : model.fields.find(f => f.name === metric)?.aggregations || []).map(agg => (
                      <option key={agg} value={agg}>{agg}</option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1 font-medium text-slate-700">
                  Group By
                  <select
                    className="border border-slate-300 rounded-lg p-2.5 bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-normal"
                    value={dimension}
                    onChange={e => setDimension(e.target.value)}
                  >
                    <option value="">No grouping (single KPI value)</option>
                    {model.fields.filter(f => ['dimension', 'identifier', 'time'].includes(f.role)).map(f => (
                      <option key={f.name} value={f.name}>{f.semantic_name}</option>
                    ))}
                  </select>
                </label>
              </>
            )}

            <label className="flex flex-col gap-1 font-medium text-slate-700">
              Display Type
              <select
                className="border border-slate-300 rounded-lg p-2.5 bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-normal"
                value={kind}
                onChange={e => setKind(e.target.value)}
              >
                <option value="kpi">KPI Card (Stat)</option>
                <option value="bar">Bar Chart</option>
                <option value="line">Line Chart</option>
                <option value="pie">Pie Chart</option>
                <option value="scatter">Scatter Plot</option>
                <option value="table">Data Table</option>
              </select>
            </label>
          </div>

          {edit && (
            <label className="block text-sm font-medium text-slate-700">
              Query Plan JSON
              <textarea
                className="border border-slate-300 rounded-lg p-2.5 w-full font-mono text-xs mt-1.5 bg-slate-50"
                rows={8}
                value={planText}
                onChange={e => setPlanText(e.target.value)}
              />
            </label>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              disabled={busy}
              onClick={() => void run(save)}
              className="bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-lg px-4 py-2.5 text-sm transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[18px]">save</span>
              <span>{edit ? 'Save Revised Definition' : 'Save Definition Proposal'}</span>
            </button>
            {edit && (
              <button
                type="button"
                onClick={() => setEdit(null)}
                className="text-slate-600 hover:text-slate-900 text-sm font-medium px-3 py-2"
              >
                Cancel
              </button>
            )}
          </div>
        </section>
      )}

      {/* Advanced Custom Python Charts */}
      {model && (
        <details className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
          <summary className="font-semibold text-slate-800 cursor-pointer flex items-center gap-2 select-none">
            <span className="material-symbols-outlined text-purple-600 text-xl">code</span>
            <span>Advanced Custom Python Charts (SAP AI Core)</span>
          </summary>
          <p className="text-sm text-slate-500">
            Generate custom matplotlib/seaborn charts using AI Core and execute in an isolated container.
          </p>
          <textarea
            aria-label="Advanced chart request"
            className="border border-slate-300 rounded-lg p-3 w-full text-sm font-normal focus:ring-1 focus:ring-purple-500 focus:border-purple-500"
            placeholder="e.g., Generate a seaborn distribution heatmap of Gross Margin across Sales Regions"
            rows={3}
            value={customPrompt}
            onChange={e => setCustomPrompt(e.target.value)}
          />
          <button
            disabled={busy || !customPrompt.trim()}
            className="bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg px-4 py-2 text-sm transition-colors flex items-center gap-1.5 disabled:opacity-50"
            onClick={() => void run(async () => {
              const job = (await api.post('/graph/advanced', {
                prompt: customPrompt,
                query_plan: { metric, aggregation, dimension: dimension || undefined },
                idempotency_key: crypto.randomUUID()
              })).data;
              setCustomImage(''); setCustomState('queued'); setCustomJob(job.id);
            })}
          >
            <span className="material-symbols-outlined text-[18px]">play_arrow</span>
            <span>Queue Custom Chart Execution</span>
          </button>
          {customJob && (
            <p role="status" className="text-sm font-medium text-slate-700 flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
              <span>Status: {customState}</span>
              <button className="text-blue-600 hover:underline ml-2" onClick={() => onNavigate('system-settings/jobs')}>
                View Job Logs
              </button>
            </p>
          )}
          {customImage && (
            <div className="mt-3 border rounded-xl overflow-hidden bg-slate-50 p-2">
              <img src={customImage} alt={customPrompt} className="w-full max-h-[500px] object-contain rounded-lg" />
            </div>
          )}
        </details>
      )}

      {/* Recommendations & Defined Items Section */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">KPIs & Charts</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Review and approve definitions. Mark approved items to publish onto the Executive Dashboard.
            </p>
          </div>
          {items.length > 0 && (
            <div className="text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-700 rounded-full">
              {items.length} Definition{items.length > 1 ? 's' : ''} ({items.filter(i => i.status === 'approved').length} approved)
            </div>
          )}
        </div>

        {model && !items.length && (
          <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-300 rounded-2xl space-y-3">
            <span className="material-symbols-outlined text-slate-400 text-4xl">query_stats</span>
            <p className="text-slate-600 font-medium">No KPIs or charts created yet.</p>
            <p className="text-xs text-slate-500">
              Click &quot;Propose Recommendations&quot; above to auto-generate supported analytics, or create one manually.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4">
          {items.map(item => {
            const key = `${item.id}:${item.revision}`;
            const isSelected = selected.includes(key);
            const isPreviewOpen = Boolean(previews[key]);
            const isPreviewLoading = loadingPreviewId === key;

            return (
              <article
                key={key}
                className={`bg-white border rounded-2xl p-5 space-y-4 shadow-sm transition-all ${
                  isSelected
                    ? 'border-emerald-300 ring-2 ring-emerald-400/20 bg-emerald-50/10'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                {/* Header of Item */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-base text-slate-900">{item.title}</h3>
                      <span className="text-xs uppercase font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold">
                        {item.kind}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">{item.explanation}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
                        item.status === 'approved'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : item.status === 'rejected'
                          ? 'bg-rose-50 text-rose-800 border-rose-200'
                          : 'bg-amber-50 text-amber-800 border-amber-200'
                      }`}
                    >
                      {item.status.toUpperCase()} (Rev {item.revision})
                    </span>
                  </div>
                </div>

                {item.reviewer && (
                  <p className="text-[11px] text-slate-400 font-mono">
                    Reviewed by {item.reviewer} · {new Date(item.reviewed_at || '').toLocaleString()}
                  </p>
                )}

                {/* Details Accordion */}
                <details className="text-xs text-slate-600 bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <summary className="cursor-pointer font-medium text-slate-700 select-none flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm text-slate-500">code</span>
                    <span>View Dependencies & Query Plan</span>
                  </summary>
                  <div className="mt-2.5 space-y-2">
                    <p>
                      <strong>Dependencies:</strong> {item.dependencies.join(', ') || 'Source rows count'}
                    </p>
                    <pre className="overflow-auto bg-slate-900 text-slate-100 rounded-lg p-3 text-[11px] font-mono leading-relaxed">
                      {JSON.stringify(item.query_plan, null, 2)}
                    </pre>
                  </div>
                </details>

                {/* Live Preview Display */}
                {isPreviewOpen && (
                  <div className="border border-blue-200 bg-blue-50/20 rounded-xl p-4 mt-2">
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-blue-100 text-xs font-medium text-blue-900">
                      <span className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-blue-600 text-base">visibility</span>
                        <span>Live Calculation Preview</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => void togglePreview(item)}
                        className="text-slate-400 hover:text-slate-600"
                        title="Hide preview"
                      >
                        <span className="material-symbols-outlined text-base">close</span>
                      </button>
                    </div>
                    <AnalyticsWidget definition={item} result={previews[key]} />
                  </div>
                )}

                {/* Action Bar for this Item */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Preview Toggle Button */}
                    <button
                      type="button"
                      disabled={busy || isPreviewLoading}
                      onClick={() => void togglePreview(item)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors border ${
                        isPreviewOpen
                          ? 'bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-100'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[16px]">
                        {isPreviewLoading ? 'sync' : isPreviewOpen ? 'visibility_off' : 'visibility'}
                      </span>
                      <span>
                        {isPreviewLoading ? 'Loading Preview...' : isPreviewOpen ? 'Hide Preview' : 'Preview Live'}
                      </span>
                    </button>

                    {/* Edit Button */}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setEdit(item);
                        setPlanText(JSON.stringify(item.query_plan, null, 2));
                        setTitle(item.title);
                        setKind(item.kind);
                        document.getElementById('definition-form')?.scrollIntoView({ behavior: 'smooth' });
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 border border-slate-300 hover:bg-slate-50 flex items-center gap-1.5 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[16px]">edit</span>
                      <span>Edit Query</span>
                    </button>

                    {/* Approve / Reject buttons for proposed items */}
                    {item.status === 'proposed' && (
                      <div className="flex items-center gap-1.5 pl-2 border-l border-slate-200">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void run(async () => {
                            await reviewDefinition(item, 'approved');
                            setItems(await getRecommendations());
                            setMessage(`Approved definition "${item.title}". It can now be included on the dashboard.`);
                          })}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-3 py-1.5 rounded-lg flex items-center gap-1 shadow-sm transition-colors"
                        >
                          <span className="material-symbols-outlined text-[16px]">check</span>
                          <span>Approve</span>
                        </button>

                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void run(async () => {
                            await reviewDefinition(item, 'rejected');
                            setItems(await getRecommendations());
                            setMessage(`Rejected definition "${item.title}".`);
                          })}
                          className="border border-rose-200 text-rose-600 hover:bg-rose-50 font-semibold text-xs px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors"
                        >
                          <span className="material-symbols-outlined text-[16px]">close</span>
                          <span>Reject</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Dashboard Inclusion Checkbox Pill */}
                  {item.status === 'approved' && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(previous =>
                          previous.includes(key) ? previous.filter(v => v !== key) : [...previous, key]
                        );
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all select-none border cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                          : 'bg-white text-slate-700 border-slate-300 hover:border-emerald-500 hover:text-emerald-700'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[16px]">
                        {isSelected ? 'check_box' : 'add_box'}
                      </span>
                      <span>{isSelected ? 'Included on Dashboard' : 'Include on Dashboard'}</span>
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* Sticky Bottom Publishing Bar */}
      <div className="sticky bottom-4 z-40 bg-white/95 backdrop-blur-md border border-slate-200 shadow-lg rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <span className="material-symbols-outlined text-xl">dashboard_customize</span>
          </div>
          <div>
            <div className="text-sm font-bold text-slate-900">
              {selected.length === 0
                ? 'No widgets selected for Dashboard'
                : `${selected.length} widget${selected.length > 1 ? 's' : ''} selected`}
            </div>
            <div className="text-xs text-slate-500">
              {selected.length === 0
                ? 'Click "Include on Dashboard" on any approved item above to add it.'
                : 'Ready to publish live to the Executive Dashboard.'}
            </div>
          </div>
        </div>

        <button
          type="button"
          disabled={busy || selected.length === 0}
          onClick={() => void handlePublishDashboard()}
          className={`flex items-center gap-2 font-semibold text-sm px-5 py-2.5 rounded-xl shadow-md transition-all ${
            selected.length > 0
              ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer hover:shadow-lg'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
          }`}
        >
          <span className="material-symbols-outlined text-lg">
            {busy ? 'sync' : 'publish'}
          </span>
          <span>
            {busy
              ? 'Publishing...'
              : selected.length === 0
              ? 'Publish to Dashboard'
              : `Publish ${selected.length} Widget${selected.length > 1 ? 's' : ''} to Dashboard`}
          </span>
        </button>
      </div>
    </div>
  );
}
