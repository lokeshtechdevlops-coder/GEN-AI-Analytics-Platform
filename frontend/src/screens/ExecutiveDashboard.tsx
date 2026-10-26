import React, { useEffect, useState } from 'react';
import api, { getApiErrorMessage } from '../services/api';
import { AnalyticsWidget } from '../components/AnalyticsWidget';
import { AnalyticsDefinition, ExecutionResult } from '../services/semanticService';

export function ExecutiveDashboard({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [dashboard, setDashboard] = useState<{ title: string; widgets: { definition: AnalyticsDefinition; result: ExecutionResult }[]; status: string } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const load = async () => {
    setLoading(true); setError('');
    try { setDashboard((await api.get('/dashboard')).data); }
    catch (err) { setError(getApiErrorMessage(err, 'Dashboard could not be loaded.')); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  return <div className="space-y-5">
    <div className="flex flex-wrap justify-between items-center gap-3"><div><h1 className="text-3xl font-semibold">{dashboard?.title || 'Analytics Dashboard'}</h1><p className="text-slate-500 mt-2">Approved definitions calculated over your selected data version.</p></div>
      <button disabled={loading} onClick={() => void load()} className="border rounded-xl bg-white px-4 py-2">{loading ? 'Loading…' : 'Refresh'}</button></div>
    {error && <div role="alert" className="bg-red-50 text-red-800 border border-red-200 rounded-xl p-4">{error}</div>}
    {dashboard && !dashboard.widgets.length && <div className="bg-white border border-slate-200 rounded-2xl p-8 space-y-3"><p>No dashboard widgets have been published for this dataset and semantic revision.</p>
      <button className="bg-blue-600 text-white rounded-lg px-4 py-2" onClick={() => onNavigate('build-your-kpi-graph-studio')}>Review recommendations in Graph Studio</button></div>}
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">{dashboard?.widgets.map(({ definition, result }) => <section key={`${definition.id}:${definition.revision}`} className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
      <h2 className="text-lg font-semibold">{definition.title}</h2><p className="text-sm text-slate-500">{definition.explanation}</p><AnalyticsWidget definition={definition} result={result} />
    </section>)}</div>
  </div>;
}
