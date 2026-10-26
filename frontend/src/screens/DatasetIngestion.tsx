import React, { useState, useRef, useEffect, useCallback } from 'react';
import { selectContext, selectedContext } from '../services/executionContext';
import { SemanticReview } from '../components/dataset/SemanticReview';
import { DatasetGovernance } from '../components/dataset/DatasetGovernance';
import { FileImportReview } from '../components/dataset/FileImportReview';
import { getApiErrorMessage } from '../services/api';
import { DatasetSelector } from '../components/dataset/DatasetSelector';
import { DatasetActionPanel } from '../components/dataset/DatasetActionPanel';
import { DatasetViewTable } from '../components/dataset/DatasetViewTable';
import { DatasetEditView } from '../components/dataset/DatasetEditView';
import { DatasetAppendView } from '../components/dataset/DatasetAppendView';
import { DatasetDeleteDialog } from '../components/dataset/DatasetDeleteDialog';
import { DatasetStatusBadge } from '../components/dataset/DatasetStatusBadge';
import { DatasetItem, DatasetAction, DATASET_ACTIONS } from '../types/dataset';
import { getDatasets, getDatasetData, getUserPermissions, rollbackDataset, activateDataset, reindexDataset, getDatasetStatus } from '../services/datasetService';

interface DatasetIngestionProps { onNavigate: (path: string) => void; }

export const DatasetIngestion: React.FC<DatasetIngestionProps> = ({ onNavigate }) => {
  const [activeDataset, setActiveDataset] = useState<DatasetItem | null>(null);
  const [latestVersion, setLatestVersion] = useState<number | null>(null);
  const [activeAction, setActiveAction] = useState<DatasetAction>(DATASET_ACTIONS.VIEW);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isBusy, setIsBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [message, setMessage] = useState('Upload a dataset to get started, or select an existing dataset.');
  const [error, setError] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [restoreVersion, setRestoreVersion] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const basePermissions = getUserPermissions();
  const historical = latestVersion !== null && activeDataset?.currentVersion !== latestVersion;
  const permissions = { ...basePermissions, canEdit: basePermissions.canEdit && !historical,
    canAppend: basePermissions.canAppend && !historical, canDelete: basePermissions.canDelete && !historical };

  const selectDataset = (dataset: DatasetItem) => {
    const previous = selectedContext();
    const version = dataset.currentVersion || 1;
    selectContext({ datasetId: dataset.id, version, semanticRevision: previous?.datasetId === dataset.id && previous.version === version ? previous.semanticRevision : 1 });
    setActiveDataset(dataset);
    setLatestVersion(dataset.currentVersion || 1);
    setActiveAction(DATASET_ACTIONS.VIEW);
    setRestoreVersion('');
    const url = new URL(window.location.href);
    url.searchParams.set('datasetId', dataset.id);
    window.history.replaceState({}, '', url.toString());
  };

  const clearDataset = () => {
    selectContext(null);
    setActiveDataset(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('datasetId');
    window.history.replaceState({}, '', url.toString());
  };

  useEffect(() => {
    let cancelled = false;
    getDatasets().then(list => {
      if (cancelled) return;
      const requested = new URLSearchParams(window.location.search).get('datasetId');
      const context = selectedContext();
      const selected = list.find(d => d.id === context?.datasetId) ?? list.find(d => d.id === requested) ?? list.find(d => d.isActive) ?? list[0];
      if (selected) {
        setLatestVersion(selected.currentVersion || 1);
        if (context?.datasetId === selected.id && context.version !== selected.currentVersion) {
          getDatasetData(selected.id, 1, 10, undefined, 'asc', undefined, context.version).then(result => {
            if (!cancelled) setActiveDataset(result.dataset);
          }).catch(err => { if (!cancelled) setError(getApiErrorMessage(err, 'Historical version could not be loaded.')); });
        } else selectDataset(selected);
      }
    }).catch(err => { if (!cancelled) setError(getApiErrorMessage(err, 'Failed to load datasets.')); });
    return () => { cancelled = true; };
  }, []);

  // Poll for status updates if active dataset is currently indexing or syncing in background
  useEffect(() => {
    if (!activeDataset) return;
    const isProcessing =
      activeDataset.embeddingStatus === 'Indexing' ||
      activeDataset.embeddingStatus === 'Pending' ||
      activeDataset.hanaSyncStatus === 'Pending';
    if (!isProcessing) return;

    const interval = setInterval(async () => {
      try {
        const status = await getDatasetStatus(activeDataset.id, activeDataset.currentVersion);
        if (
          status.embeddingStatus !== activeDataset.embeddingStatus ||
          status.hanaSyncStatus !== activeDataset.hanaSyncStatus ||
          status.currentVersion !== activeDataset.currentVersion
        ) {
          const updated = { ...activeDataset, embeddingStatus: status.embeddingStatus, embeddingCount: status.embeddingCount,
            hanaSyncStatus: status.hanaSyncStatus };
          if (updated) {
            setActiveDataset(previous => previous?.id === updated.id && previous.currentVersion === updated.currentVersion ? updated : previous);
            if (updated.embeddingStatus === 'Ready' && updated.hanaSyncStatus === 'Ready') {
              setMessage(`Indexing and HANA sync complete for ${updated.name}. Full vector search is ready.`);
            } else if (updated.embeddingStatus === 'Ready') {
              setMessage(`Vector indexing complete for ${updated.name}. Full AI search is ready.`);
            } else if (updated.embeddingStatus === 'Error') {
              setMessage(`Embedding generation encountered an issue; chat is using current source text.`);
            }
          }
        }
      } catch {
        // silent polling catch
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [activeDataset]);

  const refresh = useCallback(async () => {
    setRefreshTrigger(n => n + 1);
    try {
      const list = await getDatasets();
      if (activeDataset) {
        const latest = list.find(d => d.id === activeDataset.id);
        setLatestVersion(latest?.currentVersion ?? null);
        if (!latest) setActiveDataset(null);
        else {
          const result = await getDatasetData(activeDataset.id, 1, 10, undefined, 'asc', undefined, activeDataset.currentVersion);
          setActiveDataset(result.dataset);
        }
      }
    } catch (err) { setError(getApiErrorMessage(err, 'Failed to refresh dataset.')); }
  }, [activeDataset]);

  const upload = async (file: File) => {
    if (isBusy || !basePermissions.canAppend) return;
    setPendingFile(file);
  };

  const performVersionAction = async (action: 'rollback' | 'activate' | 'reindex') => {
    if (!activeDataset) return;
    setIsBusy(true);
    setError(null);
    try {
      const result = action === 'rollback' ? await rollbackDataset(activeDataset.id, Number(restoreVersion))
        : action === 'activate' ? await activateDataset(activeDataset.id) : await reindexDataset(activeDataset.id);
      setMessage(result.message);
      selectDataset(result.dataset);
      setRestoreVersion('');
      setRefreshTrigger(n => n + 1);
    } catch (err) { setError(getApiErrorMessage(err, 'Version operation failed.')); }
    finally { setIsBusy(false); }
  };

  return (
    <div className="flex flex-col w-full gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Dataset Management & Ingestion</h1>
          <p className="mt-2 text-slate-600">Upload, review, edit, or restore saved versions. Analytics uses your selected dataset and semantic revision.</p>
        </div>
        <DatasetSelector selectedDataset={activeDataset} onSelectDataset={selectDataset}
          onClearSelection={clearDataset} refreshTrigger={refreshTrigger} />
      </div>

      <div role="status" className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">{message}</div>
      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}

      <div onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files[0]) void upload(e.dataTransfer.files[0]); }}
        className={`rounded-2xl border-2 border-dashed p-6 bg-white ${dragOver ? 'border-blue-500' : 'border-slate-300'}`}>
        <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
          onChange={e => { if (e.target.files?.[0]) void upload(e.target.files[0]); }} />
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold text-slate-900">Drop an Excel or CSV file here</h2>
            <p className="mt-1 text-sm text-slate-600">Uploading the same filename saves a new complete version. Use Append to add rows.</p>
          </div>
          <button type="button" disabled={isBusy || !basePermissions.canAppend} onClick={() => fileInputRef.current?.click()}
            className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50">
            {isBusy ? 'Processing...' : 'Upload dataset'}
          </button>
        </div>
      </div>

      {activeDataset ? <>
        {historical && <p role="status" className="text-amber-800">Viewing saved version {activeDataset.currentVersion}. Select the latest version to edit or append rows.</p>}
        <SemanticReview dataset={activeDataset} />
        <DatasetGovernance key={`${activeDataset.id}-${activeDataset.currentVersion}`} dataset={activeDataset} />
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex flex-wrap justify-between gap-3">
            <div>
              <h2 className="font-semibold text-slate-900">{activeDataset.currentFilename ?? activeDataset.name}</h2>
              <p className="mt-1 text-sm text-slate-600">{activeDataset.rowCount.toLocaleString()} rows · {activeDataset.columnCount} columns · Version {activeDataset.currentVersion}</p>
              <p className="mt-1 text-xs text-slate-500">Updated {new Date(activeDataset.lastUpdated).toLocaleString()}</p>
            </div>
            <div className="flex flex-col items-start sm:items-end gap-2">
              <span className="text-xs text-slate-500 font-medium">
                Selected for chat and analytics
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                <DatasetStatusBadge
                  type="embedding"
                  status={activeDataset.embeddingStatus}
                  chunkCount={activeDataset.embeddingCount}
                />
                <DatasetStatusBadge
                  type="hana"
                  status={activeDataset.hanaSyncStatus}
                />
              </div>
            </div>
          </div>
          {activeDataset.embeddingStatus !== 'Ready' && <p className="text-sm text-amber-800">Chat currently retrieves this version’s source text. Retry indexing to enable embedding search.</p>}
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor="dataset-version" className="text-sm text-slate-600">Saved version</label>
            <select id="dataset-version" value={restoreVersion} onChange={e => setRestoreVersion(e.target.value)} disabled={isBusy}
              className="rounded-lg border border-slate-300 bg-white p-2 text-sm">
              <option value="">Select a version to restore</option>
              {activeDataset.versions?.map(v => <option key={v.version} value={v.version} disabled={v.version === activeDataset.currentVersion}>
                V{v.version} · {v.rowCount} rows · {v.operation}{v.version === activeDataset.currentVersion ? ' (current)' : ''}
              </option>)}
            </select>
            <button type="button" disabled={!restoreVersion || isBusy || !permissions.canEdit} onClick={() => void performVersionAction('rollback')}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-40">Restore version</button>
            {!activeDataset.isActive && <button type="button" disabled={isBusy || !permissions.canEdit} onClick={() => void performVersionAction('activate')}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm disabled:opacity-40">Use in chat</button>}
            <button type="button" disabled={isBusy || !permissions.canEdit} onClick={() => void performVersionAction('reindex')}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm disabled:opacity-40">Refresh embeddings</button>
            <button type="button" onClick={() => onNavigate('ai-dashboards-rag-chat')} className="px-3 py-2 text-sm text-blue-700">Open RAG chat</button>
          </div>
        </div>
        <div className="flex flex-col lg:flex-row gap-5 items-start">
          <div className="w-full lg:w-72 shrink-0"><DatasetActionPanel dataset={activeDataset} activeAction={activeAction}
            onSelectAction={setActiveAction} permissions={permissions} isBusy={isBusy} /></div>
          <div key={`${activeDataset.id}-${activeDataset.currentVersion}-${refreshTrigger}`} className="flex-1 min-w-0 w-full">
            {activeAction === DATASET_ACTIONS.VIEW && <DatasetViewTable dataset={activeDataset} onRefresh={() => void refresh()} />}
            {activeAction === DATASET_ACTIONS.EDIT && (
              <DatasetEditView
                dataset={activeDataset}
                onSaved={(updated) => {
                  if (updated) {
                    selectDataset(updated);
                  }
                  void refresh();
                }}
                onToast={setMessage}
              />
            )}
            {activeAction === DATASET_ACTIONS.APPEND && (
              <DatasetAppendView
                dataset={activeDataset}
                onAppended={(updated) => {
                  if (updated) {
                    selectDataset(updated);
                  }
                  void refresh();
                }}
                onToast={setMessage}
              />
            )}
            {activeAction === DATASET_ACTIONS.DELETE && <>
              <DatasetViewTable dataset={activeDataset} />
              <DatasetDeleteDialog dataset={activeDataset} isOpen onClose={() => setActiveAction(DATASET_ACTIONS.VIEW)}
                onDatasetDeleted={() => { clearDataset(); setRefreshTrigger(n => n + 1); }} onRowsDeleted={() => void refresh()} onToast={setMessage} />
            </>}
          </div>
        </div>
      </> : <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500">No dataset selected. Uploaded datasets appear in the selector.</div>}
      {pendingFile && <FileImportReview file={pendingFile} onCancel={() => setPendingFile(null)} onSaved={result => {
        setPendingFile(null); setMessage(result.message); if (result.dataset) selectDataset(result.dataset); setRefreshTrigger(n => n + 1);
      }} />}
    </div>
  );
};
