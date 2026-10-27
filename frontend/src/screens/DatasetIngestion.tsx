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

interface DatasetIngestionProps {
  onNavigate: (path: string) => void;
}

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
  const permissions = {
    ...basePermissions,
    canEdit: basePermissions.canEdit && !historical,
    canAppend: basePermissions.canAppend && !historical,
    canDelete: basePermissions.canDelete && !historical,
  };

  const selectDataset = (dataset: DatasetItem) => {
    const previous = selectedContext();
    const version = dataset.currentVersion || 1;
    selectContext({
      datasetId: dataset.id,
      version,
      semanticRevision:
        previous?.datasetId === dataset.id && previous.version === version
          ? previous.semanticRevision
          : 1,
    });
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
    getDatasets()
      .then(list => {
        if (cancelled) return;
        const requested = new URLSearchParams(window.location.search).get('datasetId');
        const context = selectedContext();
        const selected =
          list.find(d => d.id === context?.datasetId) ??
          list.find(d => d.id === requested) ??
          list.find(d => d.isActive) ??
          list[0];
        if (selected) {
          setLatestVersion(selected.currentVersion || 1);
          if (context?.datasetId === selected.id && context.version !== selected.currentVersion) {
            getDatasetData(selected.id, 1, 10, undefined, 'asc', undefined, context.version)
              .then(result => {
                if (!cancelled) setActiveDataset(result.dataset);
              })
              .catch(err => {
                if (!cancelled) setError(getApiErrorMessage(err, 'Historical version could not be loaded.'));
              });
          } else {
            selectDataset(selected);
          }
        }
      })
      .catch(err => {
        if (!cancelled) setError(getApiErrorMessage(err, 'Failed to load datasets.'));
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
          const updated = {
            ...activeDataset,
            embeddingStatus: status.embeddingStatus,
            embeddingCount: status.embeddingCount,
            hanaSyncStatus: status.hanaSyncStatus,
          };
          if (updated) {
            setActiveDataset(prev =>
              prev?.id === updated.id && prev.currentVersion === updated.currentVersion ? updated : prev
            );
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
        if (!latest) {
          setActiveDataset(null);
        } else {
          const result = await getDatasetData(
            activeDataset.id,
            1,
            10,
            undefined,
            'asc',
            undefined,
            activeDataset.currentVersion
          );
          setActiveDataset(result.dataset);
        }
      }
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to refresh dataset.'));
    }
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
      const result =
        action === 'rollback'
          ? await rollbackDataset(activeDataset.id, Number(restoreVersion))
          : action === 'activate'
          ? await activateDataset(activeDataset.id)
          : await reindexDataset(activeDataset.id);
      setMessage(result.message);
      selectDataset(result.dataset);
      setRestoreVersion('');
      setRefreshTrigger(n => n + 1);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Version operation failed.'));
    } finally {
      setIsBusy(false);
    }
  };

  // Determine pipeline active step
  const getPipelineStep = () => {
    if (!activeDataset) return 1;
    if (activeDataset.embeddingStatus === 'Ready' && activeDataset.hanaSyncStatus === 'Ready') return 4;
    if (activeDataset.embeddingStatus === 'Indexing' || activeDataset.hanaSyncStatus === 'Pending') return 3;
    return 2;
  };
  const activeStep = getPipelineStep();

  return (
    <div className="flex flex-col w-full gap-6 max-w-7xl mx-auto pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200/80">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
              Data Studio
            </span>
            <span className="text-slate-400">/</span>
            <span className="text-xs text-slate-500 font-medium">Ingestion Pipeline</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Dataset Ingestion & Management
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Ingest structured files, validate semantic schemas, compute vector embeddings, and manage version history.
          </p>
        </div>
        <DatasetSelector
          selectedDataset={activeDataset}
          onSelectDataset={selectDataset}
          onClearSelection={clearDataset}
          refreshTrigger={refreshTrigger}
        />
      </div>

      {/* Visual 4-Step Pipeline Ribbon */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { step: 1, title: '1. Ingest Data', desc: 'Excel / CSV Ingestion', icon: 'cloud_upload' },
            { step: 2, title: '2. Semantic Model', desc: 'Schema Review & Rules', icon: 'account_tree' },
            { step: 3, title: '3. Vector & HANA', desc: 'Embeddings & In-Memory Sync', icon: 'hub' },
            { step: 4, title: '4. Analytics Ready', desc: 'RAG & Executive KPIs', icon: 'insights' },
          ].map(item => {
            const isCompleted = activeStep > item.step;
            const isCurrent = activeStep === item.step;
            return (
              <div
                key={item.step}
                className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                  isCurrent
                    ? 'bg-blue-50/70 border-blue-500 shadow-sm ring-2 ring-blue-500/20'
                    : isCompleted
                    ? 'bg-slate-50/60 border-slate-200 text-slate-700'
                    : 'bg-white border-slate-200/50 text-slate-400 opacity-60'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    isCurrent
                      ? 'bg-blue-600 text-white'
                      : isCompleted
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  <span className="material-symbols-outlined text-lg">
                    {isCompleted ? 'check' : item.icon}
                  </span>
                </div>
                <div className="min-w-0">
                  <div
                    className={`text-xs font-bold truncate ${
                      isCurrent ? 'text-blue-900' : isCompleted ? 'text-slate-800' : 'text-slate-500'
                    }`}
                  >
                    {item.title}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">{item.desc}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Notifications */}
      {message && (
        <div
          role="status"
          className="rounded-2xl border border-blue-200/80 bg-blue-50/60 p-4 text-xs font-medium text-blue-900 flex items-center justify-between shadow-sm"
        >
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-blue-600 text-base">info</span>
            <span>{message}</span>
          </div>
          <button onClick={() => setMessage('')} className="text-slate-400 hover:text-slate-600 cursor-pointer">
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs font-medium text-red-800 flex items-center justify-between shadow-sm"
        >
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-red-600 text-base">error</span>
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-700 cursor-pointer">
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      )}

      {/* Drag & Drop Upload Perimeter */}
      <div
        onDragOver={e => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files[0]) void upload(e.dataTransfer.files[0]);
        }}
        className={`rounded-2xl border-2 border-dashed p-8 bg-white transition-all shadow-sm ${
          dragOver
            ? 'border-blue-500 bg-blue-50/30 ring-4 ring-blue-500/10'
            : 'border-slate-300 hover:border-slate-400'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={e => {
            if (e.target.files?.[0]) void upload(e.target.files[0]);
          }}
        />
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 text-center md:text-left">
          <div className="flex flex-col md:flex-row items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-3xl">upload_file</span>
            </div>
            <div>
              <h2 className="font-bold text-slate-900 text-base">Drag & Drop Enterprise Dataset</h2>
              <p className="mt-1 text-xs text-slate-600 max-w-lg">
                Uploading a file with an existing dataset name creates a new immutable version. Use &quot;Append&quot; below to add incremental delta rows.
              </p>
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 mt-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200 uppercase">
                  .XLSX
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200 uppercase">
                  .XLS
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200 uppercase">
                  .CSV
                </span>
                <span className="text-slate-300">•</span>
                <span className="text-[11px] text-slate-500">Max size 100MB · Encrypted with AES-256</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            disabled={isBusy || !basePermissions.canAppend}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.98] px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-all disabled:opacity-50 cursor-pointer"
          >
            <span className="material-symbols-outlined text-lg">add</span>
            <span>{isBusy ? 'Processing...' : 'Upload Dataset'}</span>
          </button>
        </div>
      </div>

      {activeDataset ? (
        <>
          {historical && (
            <div role="status" className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center gap-2">
              <span className="material-symbols-outlined text-base text-amber-600">history</span>
              <span>
                Viewing historical snapshot <strong>V{activeDataset.currentVersion}</strong>. Switch to latest version to make edits or append rows.
              </span>
            </div>
          )}

          {/* Semantic Model Review */}
          <SemanticReview dataset={activeDataset} />

          {/* Governance & Version History */}
          <DatasetGovernance
            key={`${activeDataset.id}-${activeDataset.currentVersion}`}
            dataset={activeDataset}
          />

          {/* Active Dataset Status & Operations Bar */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-bold text-lg text-slate-900">
                    {activeDataset.currentFilename ?? activeDataset.name}
                  </h2>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                    Version {activeDataset.currentVersion}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                  <span><strong>{activeDataset.rowCount.toLocaleString()}</strong> rows</span>
                  <span className="text-slate-300">•</span>
                  <span><strong>{activeDataset.columnCount}</strong> columns</span>
                  <span className="text-slate-300">•</span>
                  <span>Updated {new Date(activeDataset.lastUpdated).toLocaleString()}</span>
                </div>
              </div>

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

            {/* Version Management Action Controls */}
            <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <label htmlFor="dataset-version" className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Version:
                  </label>
                  <select
                    id="dataset-version"
                    value={restoreVersion}
                    onChange={e => setRestoreVersion(e.target.value)}
                    disabled={isBusy}
                    className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="">Choose version to restore</option>
                    {activeDataset.versions?.map(v => (
                      <option
                        key={v.version}
                        value={v.version}
                        disabled={v.version === activeDataset.currentVersion}
                      >
                        V{v.version} · {v.rowCount.toLocaleString()} rows · {v.operation}
                        {v.version === activeDataset.currentVersion ? ' (current)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  disabled={!restoreVersion || isBusy || !permissions.canEdit}
                  onClick={() => void performVersionAction('rollback')}
                  className="rounded-xl bg-slate-900 hover:bg-slate-800 px-3.5 py-1.5 text-xs font-semibold text-white disabled:opacity-40 transition-all cursor-pointer"
                >
                  Restore Version
                </button>

                {!activeDataset.isActive && (
                  <button
                    type="button"
                    disabled={isBusy || !permissions.canEdit}
                    onClick={() => void performVersionAction('activate')}
                    className="rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-3.5 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-40 transition-all cursor-pointer"
                  >
                    Activate in Chat
                  </button>
                )}

                <button
                  type="button"
                  disabled={isBusy || !permissions.canEdit}
                  onClick={() => void performVersionAction('reindex')}
                  className="rounded-xl border border-slate-300 bg-white hover:bg-slate-50 px-3.5 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-40 transition-all cursor-pointer"
                >
                  ⚡ Refresh Embeddings
                </button>
              </div>

              <button
                type="button"
                onClick={() => onNavigate('ai-dashboards-rag-chat')}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-blue-700 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 rounded-xl transition-all cursor-pointer"
              >
                <span>Open RAG Chat</span>
                <span className="material-symbols-outlined text-sm">arrow_forward</span>
              </button>
            </div>
          </div>

          {/* Action Panel and Table Grid */}
          <div className="flex flex-col lg:flex-row gap-6 items-start">
            <div className="w-full lg:w-72 shrink-0">
              <DatasetActionPanel
                dataset={activeDataset}
                activeAction={activeAction}
                onSelectAction={setActiveAction}
                permissions={permissions}
                isBusy={isBusy}
              />
            </div>
            <div
              key={`${activeDataset.id}-${activeDataset.currentVersion}-${refreshTrigger}`}
              className="flex-1 min-w-0 w-full"
            >
              {activeAction === DATASET_ACTIONS.VIEW && (
                <DatasetViewTable dataset={activeDataset} onRefresh={() => void refresh()} />
              )}
              {activeAction === DATASET_ACTIONS.EDIT && (
                <DatasetEditView
                  dataset={activeDataset}
                  onSaved={updated => {
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
                  onAppended={updated => {
                    if (updated) {
                      selectDataset(updated);
                    }
                    void refresh();
                  }}
                  onToast={setMessage}
                />
              )}
              {activeAction === DATASET_ACTIONS.DELETE && (
                <>
                  <DatasetViewTable dataset={activeDataset} />
                  <DatasetDeleteDialog
                    dataset={activeDataset}
                    isOpen
                    onClose={() => setActiveAction(DATASET_ACTIONS.VIEW)}
                    onDatasetDeleted={() => {
                      clearDataset();
                      setRefreshTrigger(n => n + 1);
                    }}
                    onRowsDeleted={() => void refresh()}
                    onToast={setMessage}
                  />
                </>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-500 shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
            <span className="material-symbols-outlined text-2xl">database</span>
          </div>
          <h3 className="text-base font-bold text-slate-900">No Dataset Selected</h3>
          <p className="text-xs text-slate-500 mt-1">Upload a dataset above or pick one from the top-right selector.</p>
        </div>
      )}

      {pendingFile && (
        <FileImportReview
          file={pendingFile}
          onCancel={() => setPendingFile(null)}
          onSaved={result => {
            setPendingFile(null);
            setMessage(result.message);
            if (result.dataset) selectDataset(result.dataset);
            setRefreshTrigger(n => n + 1);
          }}
        />
      )}
    </div>
  );
};
