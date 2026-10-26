import React, { useState, useEffect } from 'react';
import {
  Brain,
  Sparkles,
  ChevronDown,
  CheckCircle2,
  Clock,
  Database,
  Search,
  Code2,
  Terminal,
  Sliders,
  Cpu,
  Copy,
  Check,
  Layers,
  ShieldCheck,
  AlertCircle,
  ArrowRight,
  Zap,
  Activity
} from 'lucide-react';
import { ProcessingStep } from '../services/chatbotService';

interface ThinkingProcessProps {
  steps?: ProcessingStep[];
  isStreaming?: boolean;
  intent?: string;
  latency?: string;
  model?: string;
  similarity?: string;
  defaultExpanded?: boolean;
  className?: string;
}

export interface IntentDetails {
  key: string;
  label: string;
  description: string;
  dotColor: string;
  pillClass: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const resolveIntentDetails = (rawIntent?: string, steps?: ProcessingStep[], text?: string): IntentDetails => {
  const combined = `${rawIntent || ''} ${(steps || []).map(s => s.message + ' ' + s.stage).join(' ')} ${text || ''}`.toLowerCase();

  if (
    combined.includes('order') ||
    combined.includes('so-') ||
    combined.includes('so106760') ||
    combined.includes('106760') ||
    combined.includes('fulfillment') ||
    combined.includes('carrier') ||
    combined.includes('s/4hana')
  ) {
    return {
      key: 'order_lookup',
      label: 'Order Lookup',
      description: 'SAP S/4HANA Sales & Distribution ERP document verification',
      dotColor: 'bg-blue-500',
      pillClass: 'bg-blue-50/80 text-blue-700 border-blue-200/80',
      icon: Layers,
    };
  }

  if (
    combined.includes('vector') ||
    combined.includes('embedding') ||
    combined.includes('semantic') ||
    combined.includes('cosine') ||
    combined.includes('retriev') ||
    combined.includes('3,248')
  ) {
    return {
      key: 'vector_search',
      label: 'Vector Retrieval',
      description: 'SAP HANA Cloud Vector Engine semantic nearest-neighbor search',
      dotColor: 'bg-emerald-500',
      pillClass: 'bg-emerald-50/80 text-emerald-700 border-emerald-200/80',
      icon: Database,
    };
  }

  if (
    combined.includes('graph') ||
    combined.includes('chart') ||
    combined.includes('sql') ||
    combined.includes('margin') ||
    combined.includes('revenue') ||
    combined.includes('group by') ||
    combined.includes('aggregation') ||
    combined.includes('sales_fact')
  ) {
    return {
      key: 'analytics_graph',
      label: 'Analytics & SQL Aggregation',
      description: 'HANA Column Store in-memory SQL execution and measure synthesis',
      dotColor: 'bg-indigo-500',
      pillClass: 'bg-indigo-50/80 text-indigo-700 border-indigo-200/80',
      icon: Terminal,
    };
  }

  return {
    key: 'conversational_reasoning',
    label: 'Analytical Reasoning',
    description: 'Autonomous multi-hop query deconstruction and enterprise synthesis',
    dotColor: 'bg-violet-500',
    pillClass: 'bg-violet-50/80 text-violet-700 border-violet-200/80',
    icon: Brain,
  };
};

export const getStageMeta = (stage: string) => {
  const s = stage.toLowerCase();
  if (s.includes('intent')) {
    return {
      name: 'Intent Classification & Query Planning',
      icon: Brain,
      badge: 'Intent Resolution',
      color: 'text-violet-600',
      bgColor: 'bg-violet-50',
      borderColor: 'border-violet-200',
    };
  }
  if (s.includes('vector') || s.includes('embed') || s.includes('search')) {
    return {
      name: 'SAP HANA Vector Semantic Retrieval',
      icon: Database,
      badge: 'Vector Engine',
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50',
      borderColor: 'border-emerald-200',
    };
  }
  if (s.includes('erp') || s.includes('order') || s.includes('s4')) {
    return {
      name: 'SAP S/4HANA ERP Document Flow',
      icon: Layers,
      badge: 'S/4HANA SD',
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
    };
  }
  if (s.includes('sql') || s.includes('exec') || s.includes('query')) {
    return {
      name: 'Analytical SQL Generation & Column Scan',
      icon: Terminal,
      badge: 'Column Store',
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-50',
      borderColor: 'border-indigo-200',
    };
  }
  if (s.includes('rerank') || s.includes('filter') || s.includes('cross')) {
    return {
      name: 'Cross-Encoder Re-Ranking & Grounding',
      icon: Sliders,
      badge: 'Re-Ranking',
      color: 'text-amber-600',
      bgColor: 'bg-amber-50',
      borderColor: 'border-amber-200',
    };
  }
  return {
    name: 'NVIDIA NIM Synthesis & Model Inference',
    icon: Sparkles,
    badge: 'LLM Synthesis',
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200',
  };
};

export const ThinkingProcess: React.FC<ThinkingProcessProps> = ({
  steps = [],
  isStreaming = false,
  intent,
  latency,
  model,
  similarity,
  defaultExpanded,
  className = '',
}) => {
  // Controlled expansion state: collapsed by default until user explicitly opens it
  const [isExpanded, setIsExpanded] = useState<boolean>(defaultExpanded ?? false);
  const [copied, setCopied] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);

  // Live timer for reasoning elapsed time
  useEffect(() => {
    if (!isStreaming) return;
    const startTime = Date.now();
    const timer = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 100) / 10);
    }, 100);
    return () => clearInterval(timer);
  }, [isStreaming]);

  const intentDetails = resolveIntentDetails(intent, steps);
  const IntentIcon = intentDetails.icon;

  const completedSteps = steps.filter(s => s.status === 'completed');
  const runningStep = steps.find(s => s.status === 'running');
  const activeStep = runningStep || completedSteps[completedSteps.length - 1] || steps[0];
  const activeStepMeta = activeStep ? getStageMeta(activeStep.stage) : null;

  const totalStepsCount = Math.max(steps.length, 1);
  const completedCount = completedSteps.length;

  const handleCopyTrace = (e: React.MouseEvent) => {
    e.stopPropagation();
    const traceText = [
      `=== NEOVATIC RAG CHAT REASONING TRACE ===`,
      `Intent: ${intentDetails.label} (${intentDetails.description})`,
      `Total Latency: ${latency || (elapsedSeconds ? `${elapsedSeconds.toFixed(1)}s` : 'Real-time')}`,
      `Model Engine: ${model || 'Not reported'}`,
      `Retrieval match score: ${similarity || 'Not reported'}`,
      `\n--- EXECUTION STEPS ---`,
      ...steps.map((s, idx) => {
        const meta = getStageMeta(s.stage);
        return `[Step ${idx + 1}/${steps.length}] ${meta.name} [${s.status.toUpperCase()}]\nMessage: ${s.message || 'Executing'}\n`;
      }),
    ].join('\n');

    navigator.clipboard.writeText(traceText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!steps || steps.length === 0) {
    if (isStreaming) {
      return (
        <div className={`rounded-xl border border-slate-200/90 bg-[#F8FAFC]/90 px-3.5 py-2.5 text-xs text-slate-600 flex items-center gap-2.5 animate-pulse ${className}`}>
          <div className="w-4 h-4 rounded-full bg-violet-100 text-violet-600 flex items-center justify-center">
            <Brain className="w-3 h-3 animate-spin" />
          </div>
          <span className="font-medium text-slate-800">Analyzing query intent &amp; planning reasoning path...</span>
        </div>
      );
    }
    return null;
  }

  return (
    <div
      className={`rounded-2xl border transition-all duration-200 overflow-hidden font-sans ${
        isStreaming
          ? 'bg-slate-50/70 border-violet-200/80 shadow-xs'
          : isExpanded
          ? 'bg-[#F8FAFC] border-slate-300/80 shadow-2xs'
          : 'bg-[#F8FAFC]/60 border-slate-200 hover:border-slate-300 hover:bg-[#F8FAFC]'
      } ${className}`}
    >
      {/* ── Collapsible Header Row (Anthropic Claude / ChatGPT Style) ── */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full text-left px-3.5 sm:px-4 py-2.5 flex items-center justify-between gap-3 cursor-pointer select-none transition-colors group"
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1 flex-wrap sm:flex-nowrap">
          {/* Animated Brain / Pulsing Thinking Icon */}
          <div
            className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 transition-colors ${
              isStreaming
                ? 'bg-violet-600 text-white'
                : 'bg-slate-200/80 text-slate-700 group-hover:bg-slate-300/70'
            }`}
          >
            {isStreaming ? (
              <Brain className="w-3 h-3 animate-spin" style={{ animationDuration: '4s' }} />
            ) : (
              <Sparkles className="w-3 h-3 text-slate-600" />
            )}
          </div>

          {/* Reasoning Title & Status */}
          <div className="flex items-center gap-2 min-w-0">
            {isStreaming ? (
              <span className="font-semibold text-xs text-slate-900 flex items-center gap-1.5">
                <span className="inline-block">Thinking</span>
                <span className="text-[11px] font-mono font-medium text-violet-600 bg-violet-50 px-1.5 py-0.2 rounded border border-violet-200">
                  {elapsedSeconds.toFixed(1)}s
                </span>
              </span>
            ) : (
              <span className="font-semibold text-xs text-slate-800">
                Thought for {latency || '0.2s'}
              </span>
            )}

            <span className="text-slate-300 hidden xs:inline" aria-hidden="true">·</span>

            {/* Resolved Intent Pill with sleek micro-dot */}
            <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border ${intentDetails.pillClass} transition-shadow shrink-0`}>
              <span className="relative flex h-1.5 w-1.5 shrink-0 items-center justify-center">
                {isStreaming && (
                  <span className={`absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping ${intentDetails.dotColor}`} />
                )}
                <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${intentDetails.dotColor}`} />
              </span>
              <span className="truncate max-w-[170px] sm:max-w-none">{intentDetails.label}</span>
            </div>

            {/* If streaming: show current active stage in progress */}
            {isStreaming && activeStep && (
              <span className="text-[11px] text-slate-500 font-medium truncate hidden md:inline">
                · {activeStep.message || activeStepMeta?.name}
              </span>
            )}
          </div>
        </div>

        {/* Right side: Progress badge & Chevron */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] font-mono text-slate-500 font-medium hidden sm:inline">
            {completedCount}/{totalStepsCount} steps
          </span>

          <div
            className={`w-6 h-6 rounded-full flex items-center justify-center text-slate-400 group-hover:text-slate-700 hover:bg-slate-200/50 transition-all ${
              isExpanded ? 'rotate-180' : ''
            }`}
          >
            <ChevronDown className="w-4 h-4" />
          </div>
        </div>
      </button>

      {/* ── Expanded Reasoning Body ── */}
      {isExpanded && (
        <div className="px-3.5 sm:px-5 pb-4 pt-1 border-t border-slate-200/80 bg-white/90 animate-in fade-in slide-in-from-top-1 space-y-4">
          {/* Phase Overview & Intent Card */}
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/90 text-xs text-slate-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0 shadow-2xs text-slate-700">
                <IntentIcon className="w-4 h-4 text-slate-700" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-slate-900 text-[12px]">{intentDetails.label}</span>
                  <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-slate-200/70 text-slate-600 font-medium">
                    Verified Intent
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5 truncate max-w-xl">
                  {intentDetails.description}
                </p>
              </div>
            </div>

            {/* Quick Actions (Copy Trace) */}
            <button
              type="button"
              onClick={handleCopyTrace}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:border-slate-300 text-slate-700 hover:text-slate-900 text-[11px] font-medium transition-all shadow-2xs cursor-pointer shrink-0"
              title="Copy reasoning trace to clipboard"
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3 text-emerald-600" />
                  <span className="text-emerald-700 font-semibold">Copied trace</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3 text-slate-500" />
                  <span>Copy trace</span>
                </>
              )}
            </button>
          </div>

          {/* ── Step-by-Step Connected Timeline ── */}
          <div className="relative pl-6 space-y-3 before:absolute before:left-[11px] before:top-2 before:bottom-3 before:w-[1.5px] before:bg-slate-200">
            {steps.map((step, idx) => {
              const meta = getStageMeta(step.stage);
              const StageIcon = meta.icon;
              const isRunning = step.status === 'running';
              const isDone = step.status === 'completed';
              const isErr = step.status === 'failed' || step.status === 'error';

              return (
                <div key={idx} className="relative flex items-start gap-3 group">
                  {/* Step Node Marker */}
                  <div
                    className={`absolute -left-6 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold transition-all mt-0.5 ${
                      isRunning
                        ? 'bg-violet-600 text-white ring-4 ring-violet-100 shadow-sm'
                        : isDone
                        ? 'bg-emerald-600 text-white shadow-2xs'
                        : isErr
                        ? 'bg-rose-600 text-white shadow-2xs'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {isDone ? (
                      <Check className="w-3 h-3 stroke-[3]" />
                    ) : isErr ? (
                      <AlertCircle className="w-3 h-3" />
                    ) : isRunning ? (
                      <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                    ) : (
                      <span className="text-[9px]">{idx + 1}</span>
                    )}
                  </div>

                  {/* Step Detailed Card */}
                  <div
                    className={`flex-1 rounded-xl p-3 border transition-all text-xs ${
                      isRunning
                        ? 'bg-violet-50/50 border-violet-200 shadow-xs'
                        : isDone
                        ? 'bg-[#F8FAFC] border-slate-200 hover:border-slate-300 hover:bg-slate-100/60'
                        : 'bg-slate-50 border-slate-200 opacity-75'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`p-1 rounded-md ${meta.bgColor} ${meta.color}`}>
                          <StageIcon className="w-3.5 h-3.5" />
                        </div>
                        <span className="font-semibold text-slate-900 text-[12px]">
                          {meta.name}
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-white border border-slate-200 text-slate-500 font-medium hidden xs:inline">
                          {meta.badge}
                        </span>
                      </div>

                      {/* Status Tag */}
                      <span
                        className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full capitalize ${
                          isRunning
                            ? 'bg-violet-100 text-violet-700 animate-pulse'
                            : isDone
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80'
                            : isErr
                            ? 'bg-rose-50 text-rose-700 border border-rose-200/80'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {isRunning ? 'Processing...' : isDone ? 'Completed' : step.status}
                      </span>
                    </div>

                    {/* Step Message / Reasoning Description */}
                    <p className="text-slate-600 text-[11.5px] mt-1.5 leading-relaxed font-normal">
                      {step.message || 'Executing analytical stage...'}
                    </p>

                    {/* Step Structured Details (e.g. SQL, Document count, Latency) */}
                    {step.details && Object.keys(step.details).length > 0 && (
                      <div className="mt-2 pt-2 border-t border-slate-200/70 flex flex-wrap gap-2 text-[10px] font-mono text-slate-600">
                        {Object.entries(step.details).map(([key, val]) => (
                          <div key={key} className="bg-white px-2 py-1 rounded border border-slate-200">
                            <span className="text-slate-400 font-semibold uppercase mr-1">{key}:</span>
                            <span className="text-slate-800 font-semibold">{String(val)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Footer Metadata Banner (ChatGPT / Claude Technical Audit) ── */}
          <div className="pt-2 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-slate-500">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="flex items-center gap-1 text-slate-600">
                <Cpu className="w-3 h-3 text-violet-600" />
                <span>{model || 'Not reported'}</span>
              </span>
              <span>·</span>
              <span className="flex items-center gap-1 text-slate-600">
                <Database className="w-3 h-3 text-emerald-600" />
                <span>SAP HANA Cloud Vector Engine</span>
              </span>
              {similarity && (
                <>
                  <span>·</span>
                  <span className="flex items-center gap-1 text-emerald-700 font-semibold">
                    <ShieldCheck className="w-3 h-3 text-emerald-600" />
                    <span>Cosine Similarity: {similarity}</span>
                  </span>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={() => setIsExpanded(false)}
              className="text-slate-500 hover:text-slate-800 flex items-center gap-0.5 hover:underline cursor-pointer"
            >
              <span>Collapse thought</span>
              <ChevronDown className="w-3 h-3 rotate-180" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
