import React, { useEffect, useState } from 'react';
import { getDatasets } from '../services/datasetService';
import { DatasetItem } from '../types/dataset';
import { getApiErrorMessage } from '../services/api';

export const DataSources: React.FC<{ onNavigate: (path: string) => void }> = ({ onNavigate }) => {
  const [datasets, setDatasets] = useState<DatasetItem[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    getDatasets().then(items => { if (!cancelled) setDatasets(items); })
      .catch(err => { if (!cancelled) setError(getApiErrorMessage(err, 'Data sources could not be loaded.')); });
    return () => { cancelled = true; };
  }, []);
  return <div className="space-y-5"><div className="flex flex-wrap justify-between gap-3"><div><h1 className="text-3xl font-semibold">Data Sources</h1><p className="mt-2 text-slate-500">Imported datasets available to your account.</p></div>
    <button className="bg-blue-600 text-white rounded-xl px-4 py-2" onClick={() => onNavigate('system-settings/connections')}>Manage connections</button></div>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {!datasets.length && !error && <div className="bg-white border rounded-2xl p-6"><p>No imported datasets are available.</p><button className="mt-3 border rounded-lg px-4 py-2" onClick={() => onNavigate('upload-dataset')}>Upload Excel or CSV</button></div>}
    <div className="grid sm:grid-cols-2 gap-4">{datasets.map(item => <section key={item.id} className="bg-white border border-slate-200 rounded-2xl p-5 space-y-2"><h2 className="text-lg font-semibold">{item.name}</h2><p className="text-sm text-slate-500">{item.rowCount} rows ? {item.columnCount} fields ? Version {item.currentVersion}</p><p className="text-sm">Vector index: {item.embeddingStatus || 'Not indexed'}</p><p className="text-xs text-slate-500">Updated {new Date(item.lastUpdated).toLocaleString()}</p><button className="border rounded-lg px-3 py-2 text-sm" onClick={() => onNavigate('upload-dataset')}>Open dataset workflow</button></section>)}</div>
  </div>;
};
