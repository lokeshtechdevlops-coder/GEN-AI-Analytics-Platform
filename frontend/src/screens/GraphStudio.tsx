import React, { useEffect, useState } from 'react';
import api, { getApiErrorMessage } from '../services/api';
import { selectedContext, ensureDefaultContext, selectContext } from '../services/executionContext';
import {
  AnalyticsDefinition,
  ExecutionResult,
  SemanticModel,
  executePlan,
  getRecommendations,
  getSemanticModels,
  proposeRecommendations,
  reviewDefinition,
  saveDefinition,
  generatePythonGraphAgent,
  PythonGraphAgentResponse,
} from '../services/semanticService';
import { AnalyticsWidget } from '../components/AnalyticsWidget';

const DISPLAY_TYPES = [
  { id: 'kpi', label: 'Stat KPI', icon: 'pin' },
  { id: 'bar', label: 'Bar Chart', icon: 'bar_chart' },
  { id: 'line', label: 'Line Trend', icon: 'show_chart' },
  { id: 'pie', label: 'Pie Dist.', icon: 'pie_chart' },
  { id: 'scatter', label: 'Scatter', icon: 'scatter_plot' },
  { id: 'table', label: 'Data Table', icon: 'table_chart' },
];

const ADVANCED_PYTHON_TYPES = [
  { id: 'heatmap', label: 'Heatmap Matrix', desc: 'Seaborn correlation density', icon: 'grid_view' },
  { id: 'waterfall', label: 'Waterfall Bridge', desc: 'Cumulative margin walk', icon: 'waterfall_chart' },
  { id: 'treemap', label: 'Treemap Hierarchy', desc: 'Proportional nested area', icon: 'dashboard' },
  { id: 'violin', label: 'Violin Distribution', desc: 'Kernel density & median', icon: 'graphic_eq' },
  { id: 'box', label: 'Box Plot', desc: 'Quartiles & outliers', icon: 'candlestick_chart' },
  { id: 'stacked_bar', label: 'Stacked Bar', desc: 'Multi-tier composition', icon: 'stacked_bar_chart' },
];

const SUGGESTED_PROMPTS = [
  'Generate a seaborn distribution heatmap of Gross Margin across Sales Regions',
  'Pareto 80/20 cumulative revenue analysis by Product SKU',
  'Monthly margin trend violin plot with outlier detection',
  'Waterfall chart of Net Revenue across Customer Segments',
];

const TEN_STEPS = [
  { step: 'Step 3', label: 'Receive Prompt & Dataset' },
  { step: 'Step 4', label: 'Inspect Schema & Ranges' },
  { step: 'Step 5', label: 'GPT-4o-mini Intent Parsing' },
  { step: 'Step 5b', label: 'Deterministic Pre-computation' },
  { step: 'Step 5c', label: 'Dual-Path Reconciliation' },
  { step: 'Step 6', label: 'Generate Isolated Temp Script' },
  { step: 'Step 7', label: 'Execute inside Python Sandbox' },
  { step: 'Step 8', label: 'Extract High-Res Base64 PNG' },
  { step: 'Step 9', label: 'Clean Temp Artifacts' },
  { step: 'Step 10', label: 'Stateless Verification' },
];

type CreationMode = 'visual' | 'prompt' | 'data_options';

export function GraphStudio({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [model, setModel] = useState<SemanticModel | null>(null);
  const [items, setItems] = useState<AnalyticsDefinition[]>([]);
  const [previews, setPreviews] = useState<Record<string, ExecutionResult>>({});
  const [loadingPreviewId, setLoadingPreviewId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [publishedSuccess, setPublishedSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  // Active Pathway (3 Modes)
  const [activeMode, setActiveMode] = useState<CreationMode>('visual');

  // Mode 1: Visual KPI Builder States
  const [title, setTitle] = useState('');
  const [metric, setMetric] = useState('*');
  const [aggregation, setAggregation] = useState('COUNT');
  const [dimension, setDimension] = useState('');
  const [kind, setKind] = useState('kpi');
  const [selected, setSelected] = useState<string[]>([]);
  const [edit, setEdit] = useState<AnalyticsDefinition | null>(null);
  const [planText, setPlanText] = useState('');

  // Mode 2: AI Core Custom Graph (Prompt-Driven 10 Steps)
  const [promptInput, setPromptInput] = useState('');
  const [agentRunning, setAgentRunning] = useState(false);
  const [agentStep, setAgentStep] = useState<number>(0);
  const [agentResult, setAgentResult] = useState<PythonGraphAgentResponse | null>(null);

  // Mode 3: Data-Driven Automated Custom Graph (No Prompt)
  const [selectedDataMetric, setSelectedDataMetric] = useState('GrossMarginUSD');
  const [selectedDataDimension, setSelectedDataDimension] = useState('Region');
  const [selectedAdvancedChart, setSelectedAdvancedChart] = useState('heatmap');
  const [selectedPalette, setSelectedPalette] = useState('Blues');
  const [dataLimit, setDataLimit] = useState<number>(10);
  const [dataModeRunning, setDataModeRunning] = useState(false);
  const [dataModeResult, setDataModeResult] = useState<PythonGraphAgentResponse | null>(null);

  const load = async () => {
    let context = selectedContext();
    if (!context) {
      context = await ensureDefaultContext();
    }
    if (!context) throw new Error('Select a dataset and version first.');
    const models = await getSemanticModels(context.datasetId, context.version);
    const approved =
      models.find(m => m.revision === context.semanticRevision && m.status === 'approved') ||
      models.find(m => m.status === 'approved') ||
      models[0];
    if (!approved) throw new Error('Approve a semantic model in Upload Dataset and select its revision.');
    if (context.semanticRevision !== approved.revision) {
      selectContext({ ...context, semanticRevision: approved.revision });
    }
    setModel(approved);
    setItems(await getRecommendations());
  };

  const run = async (operation: () => Promise<void>) => {
    setBusy(true);
    setError('');
    setMessage('');
    setPublishedSuccess(false);
    try {
      await operation();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Operation failed.'));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void run(load);
  }, []);

  const togglePreview = async (item: AnalyticsDefinition) => {
    const key = `${item.id}:${item.revision}`;
    if (previews[key]) {
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

  const saveVisualDefinition = async () => {
    const query = edit ? JSON.parse(planText) : { metric, aggregation, dimension: dimension || undefined };
    const item: AnalyticsDefinition = edit
      ? { ...edit, title, query_plan: query, kind }
      : {
          id: crypto.randomUUID(),
          title: title || `${aggregation} ${metric}`,
          kind,
          revision: 1,
          semantic_revision: model!.revision,
          query_plan: query,
          dependencies: [metric, dimension].filter(v => v && v !== '*'),
          explanation: 'A user-defined query over approved semantic fields.',
          status: 'proposed',
        };
    await saveDefinition(item);
    setItems(await getRecommendations());
    setEdit(null);
    setTitle('');
    setMessage('Saved definition proposal. Click "Preview Live" below to verify calculations, then "Approve".');
  };

  const handleRunAgentPrompt = async () => {
    if (!promptInput.trim()) return;
    setAgentRunning(true);
    setError('');
    setMessage('');
    setAgentResult(null);

    // Simulate animated step progression through the 10 steps
    let currentStep = 1;
    const interval = setInterval(() => {
      currentStep = Math.min(currentStep + 1, 8);
      setAgentStep(currentStep);
    }, 600);

    try {
      const res = await generatePythonGraphAgent({ prompt: promptInput });
      clearInterval(interval);
      setAgentStep(10);
      setAgentResult(res);
      setMessage('Custom graph generated successfully via 10-step Python Agent and GPT-4o-mini.');
    } catch (err) {
      clearInterval(interval);
      setError(getApiErrorMessage(err, 'AI Core custom graph generation failed.'));
    } finally {
      setAgentRunning(false);
    }
  };

  const handleRunDataDrivenAgent = async () => {
    setDataModeRunning(true);
    setError('');
    setMessage('');
    setDataModeResult(null);

    try {
      const prompt = `Generate a ${selectedAdvancedChart} chart of ${selectedDataMetric} by ${selectedDataDimension} with ${selectedPalette} palette`;
      const res = await generatePythonGraphAgent({
        prompt,
        metric: selectedDataMetric,
        dimension: selectedDataDimension,
        chart_type: selectedAdvancedChart,
        query_plan: {
          metric: selectedDataMetric,
          dimension: selectedDataDimension,
          chart_type: selectedAdvancedChart,
          limit: dataLimit,
        },
      });
      setDataModeResult(res);
      setMessage(`Generated ${selectedAdvancedChart} visualization for ${selectedDataMetric} across ${selectedDataDimension}.`);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Data-driven graph generation failed.'));
    } finally {
      setDataModeRunning(false);
    }
  };

  const handlePublishDashboard = async () => {
    if (!selected.length) return;
    await run(async () => {
      const selectedWidgets = items.filter(i => selected.includes(`${i.id}:${i.revision}`));
      await api.post('/insights/dashboard', {
        title: 'Executive Analytics Dashboard',
        items: selectedWidgets.map(i => ({ id: i.id, revision: i.revision })),
      });
      setPublishedSuccess(true);
      setMessage(`Successfully published ${selectedWidgets.length} widget(s) to the Executive Dashboard!`);
    });
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-24">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200/80">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
              Analytics Studio
            </span>
            <span className="text-slate-400">/</span>
            <span className="text-xs text-slate-500 font-medium">KPI & Metric Designer</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
            <span className="material-symbols-outlined text-blue-600 text-3xl">query_stats</span>
            <span>Build Your KPI</span>
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Design business measures, generate custom AI charts, and publish validated dashboard widgets.
          </p>
        </div>

        <button
          disabled={busy || !model}
          onClick={() =>
            void run(async () => {
              const result = await proposeRecommendations();
              setItems(result || (await getRecommendations()));
              setMessage('Auto-generated KPI recommendations from approved semantic fields.');
            })
          }
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold text-sm shadow-sm hover:from-blue-700 hover:to-indigo-700 active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer"
        >
          <span className="material-symbols-outlined text-lg">{busy ? 'sync' : 'auto_awesome'}</span>
          <span>{busy ? 'Proposing...' : 'Propose AI Recommendations'}</span>
        </button>
      </div>

      {/* Global Alerts */}
      {error && (
        <div role="alert" className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl flex items-start gap-3 shadow-sm">
          <span className="material-symbols-outlined text-rose-600 text-xl mt-0.5">error</span>
          <div className="flex-1 text-sm font-medium">{error}</div>
          <button onClick={() => setError('')} className="text-rose-500 hover:text-rose-700 cursor-pointer">
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>
      )}

      {message && (
        <div
          role="status"
          className={`p-4 rounded-2xl border flex items-center justify-between gap-3 shadow-sm ${
            publishedSuccess ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-blue-50 border-blue-200 text-blue-900'
          }`}
        >
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
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-1.5 rounded-xl flex items-center gap-1 shadow-sm transition-all cursor-pointer"
              >
                <span>View Executive Dashboard</span>
                <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
              </button>
            )}
            <button
              onClick={() => {
                setMessage('');
                setPublishedSuccess(false);
              }}
              className="text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <span className="material-symbols-outlined text-base">close</span>
            </button>
          </div>
        </div>
      )}

      {/* THREE CREATION PATHWAYS (Top Segmented Mode Selector) */}
      <div className="bg-slate-100 p-1.5 rounded-2xl border border-slate-200/80 grid grid-cols-1 md:grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => setActiveMode('visual')}
          className={`flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
            activeMode === 'visual'
              ? 'bg-white text-blue-700 shadow-sm border border-slate-200/80 ring-2 ring-blue-500/10'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <span className="material-symbols-outlined text-lg">add_chart</span>
          <span>1. Visual KPI Builder</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveMode('prompt')}
          className={`flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
            activeMode === 'prompt'
              ? 'bg-white text-purple-700 shadow-sm border border-slate-200/80 ring-2 ring-purple-500/10'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <span className="material-symbols-outlined text-lg text-purple-600">psychology</span>
          <span>2. AI Core Graph (Prompt)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveMode('data_options')}
          className={`flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
            activeMode === 'data_options'
              ? 'bg-white text-emerald-700 shadow-sm border border-slate-200/80 ring-2 ring-emerald-500/10'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
          }`}
        >
          <span className="material-symbols-outlined text-lg text-emerald-600">auto_graph</span>
          <span>3. Data-Driven Graph (No Prompt)</span>
        </button>
      </div>

      {/* MODE 1: VISUAL KPI BUILDER (Matches Reference Image 2) */}
      {activeMode === 'visual' && model && (
        <section
          id="definition-form"
          className={`bg-white border rounded-2xl p-6 shadow-sm transition-all space-y-5 ${
            edit ? 'border-amber-300 ring-4 ring-amber-400/10' : 'border-slate-200/80'
          }`}
        >
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-600 text-xl">{edit ? 'edit_note' : 'add_chart'}</span>
                <span>{edit ? `Editing Definition: "${edit.title}"` : 'Build a Business KPI or Chart'}</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Define aggregations and dimensional breakdowns over active semantic fields.
              </p>
            </div>
            {edit && (
              <button
                type="button"
                onClick={() => setEdit(null)}
                className="text-xs text-slate-600 hover:text-slate-900 font-medium px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer"
              >
                Cancel Edit
              </button>
            )}
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  KPI / Chart Title
                </label>
                <input
                  className="border border-slate-300 rounded-xl px-3.5 py-2.5 w-full bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm"
                  placeholder="e.g. Net Revenue by Region"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                />
              </div>

              {!edit && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                      Target Measure
                    </label>
                    <select
                      className="border border-slate-300 rounded-xl px-3.5 py-2.5 w-full bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm"
                      value={metric}
                      onChange={e => {
                        setMetric(e.target.value);
                        setAggregation('COUNT');
                      }}
                    >
                      <option value="*">All Records (*)</option>
                      {model.fields.map(f => (
                        <option key={f.name} value={f.name}>
                          {f.semantic_name} ({f.role})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                      Aggregation
                    </label>
                    <select
                      className="border border-slate-300 rounded-xl px-3.5 py-2.5 w-full bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm"
                      value={aggregation}
                      onChange={e => setAggregation(e.target.value)}
                    >
                      {(metric === '*' ? ['COUNT'] : model.fields.find(f => f.name === metric)?.aggregations || []).map(agg => (
                        <option key={agg} value={agg}>
                          {agg}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </div>

            {!edit && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Group By Dimension
                </label>
                <select
                  className="border border-slate-300 rounded-xl px-3.5 py-2.5 w-full bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm max-w-md"
                  value={dimension}
                  onChange={e => setDimension(e.target.value)}
                >
                  <option value="">No grouping (single aggregated KPI value)</option>
                  {model.fields
                    .filter(f => ['dimension', 'identifier', 'time'].includes(f.role))
                    .map(f => (
                      <option key={f.name} value={f.name}>
                        {f.semantic_name} ({f.role})
                      </option>
                    ))}
                </select>
              </div>
            )}

            {/* Display Visualization Style Icon Tiles */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                Display Visualization Style
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
                {DISPLAY_TYPES.map(type => (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => setKind(type.id)}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                      kind === type.id
                        ? 'bg-blue-50/80 border-blue-500 text-blue-700 shadow-sm ring-2 ring-blue-500/20'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <span className="material-symbols-outlined text-xl mb-1">{type.icon}</span>
                    <span>{type.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {edit && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Query Plan (JSON)
                </label>
                <textarea
                  className="border border-slate-300 rounded-xl p-3 w-full font-mono text-xs bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  rows={6}
                  value={planText}
                  onChange={e => setPlanText(e.target.value)}
                />
              </div>
            )}

            <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
              <button
                disabled={busy}
                onClick={() => void run(saveVisualDefinition)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 active:scale-[0.98] transition-all shadow-sm cursor-pointer disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-lg">save</span>
                <span>{edit ? 'Update Definition Proposal' : 'Save Definition Proposal'}</span>
              </button>
              {edit && (
                <button
                  type="button"
                  onClick={() => setEdit(null)}
                  className="text-slate-600 hover:text-slate-900 text-sm font-medium px-4 py-2 cursor-pointer"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      {/* MODE 2: AI CORE CUSTOM GRAPH (Prompt-Driven with 10 Steps) */}
      {activeMode === 'prompt' && (
        <section className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-2xl">psychology</span>
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <span>SAP AI Core Custom Graph Generator</span>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200">
                    GPT-4o-mini
                  </span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Natural language synthesis executing through the 10-step Python runtime with dual-path reconciliation.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Natural Language Visualization Prompt
              </label>
              <div className="relative">
                <textarea
                  className="border border-slate-300 rounded-xl p-4 pr-14 w-full text-sm resize-y focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all outline-none"
                  placeholder="e.g., Generate a seaborn distribution heatmap of Gross Margin across Sales Regions..."
                  rows={3}
                  value={promptInput}
                  onChange={e => setPromptInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && promptInput.trim() && !agentRunning) {
                      void handleRunAgentPrompt();
                    }
                  }}
                />
                <span className="absolute bottom-3 right-3 text-[10px] font-mono text-slate-400">⌘ Enter</span>
              </div>
            </div>

            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Quick Suggestions:</span>
              <div className="flex flex-wrap gap-2 mt-2">
                {SUGGESTED_PROMPTS.map(suggestion => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => setPromptInput(suggestion)}
                    className="px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-purple-50 border border-slate-200 hover:border-purple-200 text-xs text-slate-700 hover:text-purple-700 text-left transition-all cursor-pointer"
                  >
                    💡 {suggestion}
                  </button>
                ))}
              </div>
            </div>

            <button
              disabled={agentRunning || !promptInput.trim()}
              onClick={() => void handleRunAgentPrompt()}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-sm shadow-sm transition-all disabled:opacity-50 cursor-pointer"
            >
              <span className={`material-symbols-outlined text-lg ${agentRunning ? 'animate-spin' : ''}`}>
                {agentRunning ? 'sync' : 'play_arrow'}
              </span>
              <span>{agentRunning ? 'Executing 10-Step Workflow…' : 'Generate Custom Graph (10 Steps)'}</span>
            </button>
          </div>

          {/* 10-Step Visual Progress Stepper */}
          {agentRunning && (
            <div className="p-5 bg-purple-50/60 border border-purple-200 rounded-2xl space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between text-xs font-bold text-purple-900">
                <span className="flex items-center gap-2">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-purple-600 animate-ping" />
                  <span>Executing 10-Step Custom Graph Generation Pipeline</span>
                </span>
                <span>Stage {agentStep} of 10</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2">
                {TEN_STEPS.map((s, idx) => {
                  const isDone = agentStep > idx + 1;
                  const isCurrent = agentStep === idx + 1;
                  return (
                    <div
                      key={s.step}
                      className={`p-2 rounded-lg text-[11px] font-semibold border transition-all ${
                        isDone
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                          : isCurrent
                          ? 'bg-white border-purple-500 text-purple-900 shadow-sm ring-2 ring-purple-500/20'
                          : 'bg-white/60 border-slate-200 text-slate-400 opacity-60'
                      }`}
                    >
                      <div className="text-[10px] uppercase font-mono">{s.step}</div>
                      <div className="truncate mt-0.5">{s.label}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Output Display for Mode 2 */}
          {agentResult && (
            <div className="border border-slate-200 rounded-2xl overflow-hidden bg-slate-50 p-4 space-y-4 shadow-sm animate-in fade-in">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">{agentResult.prompt}</h3>
                  <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                    <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold text-[10px]">
                      {agentResult.verified ? 'Dual-Path Verified' : 'Validated'}
                    </span>
                    <span>•</span>
                    <span>{agentResult.records_matched?.toLocaleString()} of {agentResult.records_in_source?.toLocaleString()} records matched</span>
                    {agentResult.data_as_of && (
                      <>
                        <span>•</span>
                        <span>As of: {new Date(agentResult.data_as_of).toLocaleDateString()}</span>
                      </>
                    )}
                  </div>
                </div>

                <a
                  href={agentResult.image_base64}
                  download="ai_core_graph.png"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm"
                >
                  <span className="material-symbols-outlined text-[16px]">download</span>
                  <span>Download PNG</span>
                </a>
              </div>

              <div className="bg-white rounded-xl p-3 border border-slate-200 flex items-center justify-center">
                <img
                  src={agentResult.image_base64}
                  alt={agentResult.prompt}
                  className="max-h-[520px] object-contain rounded-lg w-full"
                />
              </div>

              {agentResult.insights && (
                <div className="bg-white rounded-xl p-4 border border-slate-200 text-xs text-slate-700 space-y-1">
                  <span className="font-bold text-slate-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-purple-600 text-sm">insights</span>
                    AI Executive Insights:
                  </span>
                  <p className="leading-relaxed">{agentResult.insights}</p>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* MODE 3: AUTOMATED CUSTOM GRAPH (Data-Driven / No Prompt Required) */}
      {activeMode === 'data_options' && model && (
        <section className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-2xl">auto_graph</span>
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <span>Data-Driven Custom Graph Generator</span>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                    No Prompt Needed
                  </span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Select your metrics, dimensions, and Seaborn visual style. The 10-step dual-path engine executes automatically.
                </p>
              </div>
            </div>
          </div>

          {/* Data Shown Options Form */}
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Target Measure
                </label>
                <select
                  className="border border-slate-300 rounded-xl px-3.5 py-2.5 w-full bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-sm"
                  value={selectedDataMetric}
                  onChange={e => setSelectedDataMetric(e.target.value)}
                >
                  {model.fields
                    .filter(f => f.role === 'measure' || f.name.includes('USD') || f.name.includes('Quantity'))
                    .map(f => (
                      <option key={f.name} value={f.name}>
                        {f.semantic_name}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Breakdown Dimension
                </label>
                <select
                  className="border border-slate-300 rounded-xl px-3.5 py-2.5 w-full bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-sm"
                  value={selectedDataDimension}
                  onChange={e => setSelectedDataDimension(e.target.value)}
                >
                  {model.fields
                    .filter(f => ['dimension', 'identifier', 'time'].includes(f.role))
                    .map(f => (
                      <option key={f.name} value={f.name}>
                        {f.semantic_name}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Color Theme Palette
                </label>
                <select
                  className="border border-slate-300 rounded-xl px-3.5 py-2.5 w-full bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-sm"
                  value={selectedPalette}
                  onChange={e => setSelectedPalette(e.target.value)}
                >
                  <option value="Blues">Seaborn Blues (Corporate)</option>
                  <option value="viridis">Viridis (Vibrant Gradient)</option>
                  <option value="rocket">Rocket (Warm Sunset)</option>
                  <option value="mako">Mako (Deep Ocean Teal)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Top-N Limit
                </label>
                <select
                  className="border border-slate-300 rounded-xl px-3.5 py-2.5 w-full bg-white text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-sm"
                  value={dataLimit}
                  onChange={e => setDataLimit(Number(e.target.value))}
                >
                  <option value={5}>Top 5 Categories</option>
                  <option value={10}>Top 10 Categories</option>
                  <option value={20}>Top 20 Categories</option>
                  <option value={50}>All Available</option>
                </select>
              </div>
            </div>

            {/* Advanced Python Chart Type Tiles */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                Advanced Python Visualization Style
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {ADVANCED_PYTHON_TYPES.map(type => (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => setSelectedAdvancedChart(type.id)}
                    className={`flex flex-col items-center justify-center p-3.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                      selectedAdvancedChart === type.id
                        ? 'bg-emerald-50/80 border-emerald-500 text-emerald-800 shadow-sm ring-2 ring-emerald-500/20'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <span className="material-symbols-outlined text-xl mb-1">{type.icon}</span>
                    <span className="font-bold text-[11px]">{type.label}</span>
                    <span className="text-[10px] text-slate-400 font-normal mt-0.5 text-center leading-tight">
                      {type.desc}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <button
              disabled={dataModeRunning}
              onClick={() => void handleRunDataDrivenAgent()}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm shadow-sm transition-all disabled:opacity-50 cursor-pointer"
            >
              <span className={`material-symbols-outlined text-lg ${dataModeRunning ? 'animate-spin' : ''}`}>
                {dataModeRunning ? 'sync' : 'auto_graph'}
              </span>
              <span>{dataModeRunning ? 'Rendering 10-Step Graph…' : 'Generate Data-Driven Graph'}</span>
            </button>
          </div>

          {/* Output Display for Mode 3 */}
          {dataModeResult && (
            <div className="border border-slate-200 rounded-2xl overflow-hidden bg-slate-50 p-4 space-y-4 shadow-sm animate-in fade-in">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">
                    {selectedDataMetric} by {selectedDataDimension} ({selectedAdvancedChart})
                  </h3>
                  <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                    <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold text-[10px]">
                      Verified Pre-computed Result
                    </span>
                    <span>•</span>
                    <span>{dataModeResult.records_matched?.toLocaleString()} records processed</span>
                  </div>
                </div>

                <a
                  href={dataModeResult.image_base64}
                  download="datadriven_chart.png"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm"
                >
                  <span className="material-symbols-outlined text-[16px]">download</span>
                  <span>Download PNG</span>
                </a>
              </div>

              <div className="bg-white rounded-xl p-3 border border-slate-200 flex items-center justify-center">
                <img
                  src={dataModeResult.image_base64}
                  alt={dataModeResult.prompt}
                  className="max-h-[520px] object-contain rounded-lg w-full"
                />
              </div>
            </div>
          )}
        </section>
      )}

      {/* CONFIGURED DEFINITIONS STREAM (Matches Reference Image 1) */}
      <section className="space-y-4 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200/80">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Configured Definitions ({items.length})
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Review and approve definitions. Check approved cards to publish them live to the Executive Dashboard.
            </p>
          </div>
          {items.length > 0 && (
            <div className="text-xs font-semibold px-3 py-1 bg-slate-100 text-slate-700 rounded-full border border-slate-200">
              {items.filter(i => i.status === 'approved').length} of {items.length} Approved
            </div>
          )}
        </div>

        {model && !items.length && (
          <div className="p-12 text-center bg-white border border-dashed border-slate-300 rounded-2xl space-y-4 shadow-sm">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-3xl">query_stats</span>
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">No KPI Definitions Found</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                Click &quot;Propose AI Recommendations&quot; above to auto-generate supported KPI metrics from your schema, or create one using the options above.
              </p>
            </div>
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
                className={`bg-white border rounded-2xl p-5 shadow-sm transition-all space-y-4 ${
                  isSelected
                    ? 'border-emerald-300 ring-4 ring-emerald-400/10 bg-emerald-50/10'
                    : 'border-slate-200/80 hover:border-slate-300 hover:shadow-md'
                }`}
              >
                {/* Header (Screenshot 1) */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <h3 className="font-bold text-base text-slate-900">{item.title}</h3>
                      <span className="text-[11px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
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

                {/* Query Plan Accordion */}
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

                {/* Calculation Live Preview (Formatted $34.09M values) */}
                {isPreviewOpen && (
                  <div className="border border-blue-200 bg-blue-50/20 rounded-2xl p-4 mt-2 shadow-inner">
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-blue-100 text-xs font-semibold text-blue-900">
                      <span className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-blue-600 text-base">visibility</span>
                        <span>Live Calculation Engine Preview</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => void togglePreview(item)}
                        className="text-slate-400 hover:text-slate-600 cursor-pointer"
                        title="Hide preview"
                      >
                        <span className="material-symbols-outlined text-base">close</span>
                      </button>
                    </div>
                    <AnalyticsWidget definition={item} result={previews[key]} showTable={true} />
                  </div>
                )}

                {/* Action Bar (Screenshot 1) */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={busy || isPreviewLoading}
                      onClick={() => void togglePreview(item)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all border cursor-pointer ${
                        isPreviewOpen
                          ? 'bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-100'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 shadow-sm'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[16px]">
                        {isPreviewLoading ? 'sync' : isPreviewOpen ? 'visibility_off' : 'visibility'}
                      </span>
                      <span>
                        {isPreviewLoading ? 'Executing...' : isPreviewOpen ? 'Hide Preview' : 'Preview Live'}
                      </span>
                    </button>

                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setEdit(item);
                        setPlanText(JSON.stringify(item.query_plan, null, 2));
                        setTitle(item.title);
                        setKind(item.kind);
                        setActiveMode('visual');
                        document.getElementById('definition-form')?.scrollIntoView({ behavior: 'smooth' });
                      }}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700 border border-slate-200 bg-white hover:bg-slate-50 flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px]">edit</span>
                      <span>Edit Query</span>
                    </button>

                    {item.status === 'proposed' && (
                      <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              await reviewDefinition(item, 'approved');
                              setItems(await getRecommendations());
                              setMessage(`Approved definition "${item.title}". It can now be included on the dashboard.`);
                            })
                          }
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-3 py-1.5 rounded-xl flex items-center gap-1 shadow-sm transition-all cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[16px]">check</span>
                          <span>Approve</span>
                        </button>

                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              await reviewDefinition(item, 'rejected');
                              setItems(await getRecommendations());
                              setMessage(`Rejected definition "${item.title}".`);
                            })
                          }
                          className="border border-rose-200 text-rose-600 hover:bg-rose-50 font-semibold text-xs px-3 py-1.5 rounded-xl flex items-center gap-1 transition-all cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[16px]">close</span>
                          <span>Reject</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {item.status === 'approved' && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(prev =>
                          prev.includes(key) ? prev.filter(v => v !== key) : [...prev, key]
                        );
                      }}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer select-none border ${
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
      <div className="sticky bottom-4 z-40 bg-white/95 backdrop-blur-md border border-slate-200 shadow-xl rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-xl">dashboard_customize</span>
          </div>
          <div>
            <div className="text-sm font-bold text-slate-900">
              {selected.length === 0
                ? 'No widgets selected for Executive Dashboard'
                : `${selected.length} widget${selected.length > 1 ? 's' : ''} ready to publish`}
            </div>
            <div className="text-xs text-slate-500">
              {selected.length === 0
                ? 'Click "Include on Dashboard" on any approved KPI card above.'
                : 'Click button to deploy selected widgets live to the Executive Dashboard.'}
            </div>
          </div>
        </div>

        <button
          type="button"
          disabled={busy || selected.length === 0}
          onClick={() => void handlePublishDashboard()}
          className={`inline-flex items-center gap-2 font-bold text-sm px-6 py-2.5 rounded-xl shadow-md transition-all ${
            selected.length > 0
              ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer hover:shadow-lg'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
          }`}
        >
          <span className="material-symbols-outlined text-lg">{busy ? 'sync' : 'publish'}</span>
          <span>
            {busy
              ? 'Publishing...'
              : selected.length === 0
              ? 'Publish to Dashboard'
              : `Publish ${selected.length} Widget${selected.length > 1 ? 's' : ''}`}
          </span>
        </button>
      </div>
    </div>
  );
}

// Alias export for consistency with the new name
export const BuildYourKPI = GraphStudio;
