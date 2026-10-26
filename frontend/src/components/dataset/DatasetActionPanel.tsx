import React from 'react';
import {
  Eye,
  Edit3,
  PlusCircle,
  Trash2,
  FileSpreadsheet,
  Lock,
  Calendar,
  Layers,
  Database,
} from 'lucide-react';
import { DatasetItem, DatasetAction, DATASET_ACTIONS } from '../../types/dataset';
import { DatasetStatusBadge } from './DatasetStatusBadge';

interface DatasetActionPanelProps {
  dataset: DatasetItem;
  activeAction: DatasetAction;
  onSelectAction: (action: DatasetAction) => void;
  permissions: {
    canView: boolean;
    canEdit: boolean;
    canAppend: boolean;
    canDelete: boolean;
  };
  isBusy?: boolean;
  className?: string;
}

export const ACTION_CONFIGS = [
  {
    id: DATASET_ACTIONS.VIEW,
    label: 'View',
    description: 'Browse, filter & sort dataset',
    icon: Eye,
    requiresPermission: 'canView' as const,
  },
  {
    id: DATASET_ACTIONS.EDIT,
    label: 'Edit',
    description: 'Inline & row-level modifications',
    icon: Edit3,
    requiresPermission: 'canEdit' as const,
  },
  {
    id: DATASET_ACTIONS.APPEND,
    label: 'Append',
    description: 'Add records via file or manual entry',
    icon: PlusCircle,
    requiresPermission: 'canAppend' as const,
  },
  {
    id: DATASET_ACTIONS.DELETE,
    label: 'Delete',
    description: 'Prune rows or purge dataset',
    icon: Trash2,
    requiresPermission: 'canDelete' as const,
    isDanger: true,
  },
];

export const DatasetActionPanel: React.FC<DatasetActionPanelProps> = ({
  dataset,
  activeAction,
  onSelectAction,
  permissions,
  isBusy = false,
  className = '',
}) => {
  return (
    <div
      className={`bg-white rounded-2xl border border-[#E2E8F0] shadow-xs flex flex-col overflow-hidden ${className}`}
      role="navigation"
      aria-label="Dataset operations panel"
    >
      {/* Dataset Context Summary Header (Desktop & Mobile) */}
      <div className="p-4 sm:p-5 border-b border-[#E2E8F0] bg-[#F8FAFC]">
        <div className="flex items-center gap-2.5">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-2xs ${
              dataset.format === 'xlsx'
                ? 'bg-emerald-600 text-white'
                : dataset.format === 'csv'
                ? 'bg-[#2563EB] text-white'
                : 'bg-purple-600 text-white'
            }`}
          >
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div className="flex flex-col min-w-0">
            <h2 className="font-semibold text-xs sm:text-sm text-[#0F172A] truncate" title={dataset.name}>
              {dataset.name}
            </h2>
            <div className="flex items-center gap-1.5 text-[11px] text-[#64748B] font-mono mt-0.5">
              <span>{dataset.rowCount.toLocaleString()} rows</span>
              <span>·</span>
              <span className="uppercase">{dataset.format}</span>
            </div>
          </div>
        </div>

        {/* Extended metadata chip */}
        <div className="mt-3 pt-3 border-t border-slate-200/80 flex items-center justify-between text-[11px] text-[#64748B]">
          <span className="flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span className="truncate">{dataset.lastUpdated}</span>
          </span>
          <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-semibold">
            {dataset.status}
          </span>
        </div>
      </div>

      {/* ── Desktop & Tablet Action Links ── */}
      <nav className="p-2 sm:p-3 flex flex-row lg:flex-col gap-1.5 overflow-x-auto lg:overflow-visible">
        {ACTION_CONFIGS.map((config) => {
          const Icon = config.icon;
          const isActive = activeAction === config.id;
          const isPermitted = permissions[config.requiresPermission];
          const isDisabled = !isPermitted || isBusy;

          return (
            <button
              key={config.id}
              type="button"
              disabled={isDisabled}
              onClick={() => onSelectAction(config.id)}
              className={`flex-1 lg:flex-initial flex items-center justify-between p-2.5 sm:p-3 rounded-xl transition-all duration-150 text-left cursor-pointer group whitespace-nowrap lg:whitespace-normal ${
                isActive
                  ? config.isDanger
                    ? 'bg-rose-50 text-rose-700 border border-rose-200 shadow-2xs font-semibold'
                    : 'bg-[#EFF6FF] text-[#1E3A8A] border border-[#BFDBFE] shadow-2xs font-semibold'
                  : isDisabled
                  ? 'opacity-50 cursor-not-allowed bg-slate-50 text-slate-400'
                  : 'hover:bg-[#F8FAFC] text-[#475569] hover:text-[#0F172A] border border-transparent'
              }`}
              aria-current={isActive ? 'page' : undefined}
              title={
                !isPermitted
                  ? `Requires ${config.label} permissions (view-only mode active)`
                  : config.description
              }
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                    isActive
                      ? config.isDanger
                        ? 'bg-rose-100 text-rose-700'
                        : 'bg-[#2563EB] text-white'
                      : config.isDanger
                      ? 'bg-rose-50 text-rose-600 group-hover:bg-rose-100'
                      : 'bg-slate-100 text-slate-600 group-hover:bg-slate-200'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs sm:text-sm font-medium tracking-tight">
                    {config.label}
                  </span>
                  <span className="text-[11px] text-[#64748B] font-normal hidden lg:inline truncate">
                    {config.description}
                  </span>
                </div>
              </div>

              {!isPermitted && (
                <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0 ml-2 hidden lg:inline" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer Info for Operators */}
      <div className="mt-auto p-4 border-t border-[#E2E8F0] bg-[#F8FAFC] hidden lg:block space-y-2">
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
          Cloud & Vector Engine
        </span>
        <div className="flex flex-col gap-1.5">
          <DatasetStatusBadge
            type="embedding"
            status={dataset.embeddingStatus}
            chunkCount={dataset.embeddingCount}
          />
          <DatasetStatusBadge
            type="hana"
            status={dataset.hanaSyncStatus}
          />
        </div>
      </div>
    </div>
  );
};
