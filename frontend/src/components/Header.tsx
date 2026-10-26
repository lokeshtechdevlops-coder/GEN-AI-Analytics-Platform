import React, { useState, useEffect } from 'react';
import { NeovaticLogo } from './NeovaticLogo';
import { fetchHealthStatus } from '../services/healthService';
import { selectedContext } from '../services/executionContext';
import { getDatasets } from '../services/datasetService';

interface HeaderProps {
  onOpenCommandPalette: () => void;
  onNavigate: (path: string) => void;
  onToggleSidebar: () => void;
  activePath: string;
  onLogout?: () => void;
  user?: {
    name?: string;
    email?: string;
    roles?: string[];
  } | null;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenCommandPalette,
  onNavigate,
  onToggleSidebar,
  activePath,
  onLogout,
  user,
}) => {
  const [profileOpen, setProfileOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [healthStatus, setHealthStatus] = useState<string | null>(null);
  const [activeDatasetName, setActiveDatasetName] = useState<string | null>(null);
  const [activeVersion, setActiveVersion] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const updateActive = async () => {
      const ctx = selectedContext();
      if (!ctx) {
        setActiveDatasetName(null);
        setActiveVersion(null);
        return;
      }
      setActiveVersion(ctx.version);
      try {
        const list = await getDatasets();
        if (cancelled) return;
        const found = list.find(d => d.id === ctx.datasetId);
        if (found) setActiveDatasetName(found.name);
      } catch {
        // Soft fallback
      }
    };
    void updateActive();
    window.addEventListener('dataset-context-changed', updateActive);
    return () => {
      cancelled = true;
      window.removeEventListener('dataset-context-changed', updateActive);
    };
  }, []);

  const handleGlobalSync = async () => {
    setSyncing(true);
    try {
      const res = await fetchHealthStatus();
      setHealthStatus(`HANA: ${res.hana_connected ? 'OK' : 'Disconnected'} · AI Core: ${res.ai_core_connected == null ? 'Not checked' : res.ai_core_connected ? 'OK' : 'Disconnected'}`);
    } catch {
      setHealthStatus('HANA / AI Core: Connection Pending');
    } finally {
      setTimeout(() => {
        setSyncing(false);
      }, 600);
    }
  };

  const rolesList = user?.roles || [];
  const isAdmin = rolesList.includes('Admin');
  const isMember = rolesList.includes('Member');
  const roleLabel = isAdmin ? 'Admin' : (isMember ? 'Member' : 'User');
  const roleSubtitle = isAdmin ? 'Administrator' : (isMember ? 'Member' : 'Standard User');

  return (
    <header className="fixed top-0 left-0 right-0 h-[60px] sm:h-[72px] z-50 bg-white/95 backdrop-blur-md border-b border-[#E2E8F0] flex items-center justify-between px-2.5 sm:px-4 md:px-margin select-none">
      {/* Left: Mobile Drawer Trigger + Brand Lockup */}
      <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
        {/* Mobile / Tablet Menu Button */}
        <button
          onClick={onToggleSidebar}
          aria-label="Toggle navigation menu"
          className="lg:hidden flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 -ml-1 rounded-xl text-[#0F172A] hover:bg-[#F1F5F9] transition-colors focus:outline-none"
        >
          <span className="material-symbols-outlined text-[22px] sm:text-[24px]">menu</span>
        </button>

        {/* Brand Lockup */}
        <div
          className="flex items-center cursor-pointer min-w-0"
          onClick={() => onNavigate('executive-dashboard')}
        >
          <NeovaticLogo size={28} />
        </div>
      </div>

      {/* Center: Global Quick Jump Input Bar */}
      <div className="flex-1 max-w-xl mx-2 sm:mx-space-lg hidden md:block">
        <div
          onClick={onOpenCommandPalette}
          className="relative flex items-center w-full cursor-pointer group"
        >
          <span className="material-symbols-outlined absolute left-3 text-[#64748B] text-[18px] group-hover:text-[#2563EB] transition-colors">
            search
          </span>
          <input
            readOnly
            value=""
            placeholder="Quick jump (e.g., 'Custom Graphs', 'RAG Chat')..."
            className="w-full h-9 pl-9 pr-14 rounded-xl bg-[#F8FAFC] hover:bg-[#F1F5F9] text-[#0F172A] placeholder:text-[#64748B] font-body-sm text-body-sm border border-[#E2E8F0] focus:border-[#2563EB] transition-colors cursor-pointer"
            type="text"
          />
          <div className="absolute right-2.5 flex items-center gap-1 pointer-events-none">
            <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-white text-[#64748B] border border-[#CBD5E1] rounded shadow-2xs">⌘K</kbd>
          </div>
        </div>
      </div>

      {/* Right: Mobile Search Icon + Status Indicators + User Profile */}
      <div className="flex items-center gap-1.5 sm:gap-space-sm shrink-0">
        {/* Search icon trigger on mobile */}
        <button
          onClick={onOpenCommandPalette}
          aria-label="Search and command palette"
          className="md:hidden flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-full hover:bg-[#F1F5F9] text-[#0F172A] transition-colors"
        >
          <span className="material-symbols-outlined text-[19px]">search</span>
        </button>

        {/* Active Dataset Context Badge */}
        {activeDatasetName && (
          <button
            type="button"
            onClick={() => onNavigate('upload-dataset')}
            title={`Active Dataset: ${activeDatasetName} (Version ${activeVersion || 1}) · Click to open dataset management`}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50/90 hover:bg-blue-100 border border-blue-200 text-blue-700 transition-colors cursor-pointer text-left"
          >
            <span className="material-symbols-outlined text-[16px] text-blue-600">database</span>
            <span className="font-label-sm text-label-sm font-medium max-w-[120px] md:max-w-[170px] truncate text-slate-800">
              {activeDatasetName}
            </span>
            <span className="bg-blue-600 text-white font-mono px-1.5 py-0.2 rounded text-[10px] font-semibold">
              v{activeVersion || 1}
            </span>
          </button>
        )}

        {/* Live Cluster Indicators on Desktop & Tablet */}
        <div className="hidden xl:flex items-center gap-space-sm">
          {/* HANA Vector Pill */}
          <div
            onClick={handleGlobalSync}
            title="Click to ping SAP HANA in-memory vector store"
            className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F0FDFA] border border-[#CCFBF1] text-[#0F766E] hover:bg-[#CCFBF1]/50 transition-colors cursor-pointer"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${syncing ? 'bg-[#2563EB] animate-ping' : 'bg-[#0F766E]'}`}></span>
            <span className="font-label-sm text-label-sm font-medium">
              {syncing ? 'HANA Vector: SYNCING...' : (healthStatus ?? 'HANA Vector: ACTIVE')}
            </span>
          </div>

          {/* AI Core Pill */}
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F5F3FF] border border-[#DDD6FE] text-[#6D28D9]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#7C3AED]"></span>
            <span className="font-label-sm text-label-sm font-medium">
              AI Core: GPT-4o
            </span>
          </div>

          {/* Health Pill */}
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F0FDF4] border border-[#BBF7D0] text-[#166534]">
            <span className="material-symbols-outlined text-[14px] text-[#16A34A]">
              check_circle
            </span>
            <span className="font-label-sm text-label-sm font-medium">
              Healthy
            </span>
          </div>
        </div>

        {/* User Profile Lockup */}
        <div className="relative">
          <div
            onClick={() => setProfileOpen(!profileOpen)}
            className="flex items-center gap-2 cursor-pointer p-1 rounded-lg hover:bg-[#F1F5F9] transition-colors"
          >
            <div className="hidden 2xl:flex flex-col text-right">
              <span className="font-label-md text-label-md text-[#0F172A] font-semibold leading-tight">
                {user?.name || 'Analytics User'}
              </span>
              <span className="font-label-sm text-[10px] text-[#64748B] leading-tight font-medium">
                {roleLabel} ({roleSubtitle})
              </span>
            </div>
            <div className="w-8 h-8 rounded-full bg-[#0F172A] hover:bg-[#1E293B] flex items-center justify-center text-white shadow-sm shrink-0 transition-colors">
              <span className="material-symbols-outlined text-white text-[18px]">
                person
              </span>
            </div>
          </div>

          {/* Profile Dropdown Menu */}
          {profileOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setProfileOpen(false)}
              />
              <div className="absolute right-0 mt-2 w-64 max-w-[calc(100vw-24px)] rounded-xl bg-white border border-[#E2E8F0] shadow-xl p-3 z-50 text-left animate-in fade-in slide-in-from-top-2">
                <div className="px-2 py-1.5 border-b border-[#E2E8F0] mb-1.5">
                  <div className="font-label-md text-[#0F172A] font-semibold">{user?.name || 'Analytics User'}</div>
                  <div className="font-label-sm text-[#64748B] truncate">{user?.email || 'user@sap.corp'}</div>
                  <div className="font-label-sm text-[10px] text-[#2563EB] mt-0.5 truncate font-medium flex items-center justify-between">
                    <span>Role: <strong>{roleLabel}</strong></span>
                    <span className="bg-[#EFF6FF] px-1.5 py-0.5 rounded text-[#1E40AF] font-mono">{roleLabel}</span>
                  </div>
                </div>


                <div className="space-y-0.5 text-body-sm text-[#334155]">
                  <button
                    onClick={() => { setProfileOpen(false); onNavigate('user-management'); }}
                    className="w-full text-left px-2 py-2 rounded-lg hover:bg-[#F1F5F9] flex items-center justify-between transition-colors"
                  >
                    <span>User Management</span>
                    <span className="material-symbols-outlined text-[16px] text-[#64748B]">chevron_right</span>
                  </button>
                  <button
                    onClick={() => { setProfileOpen(false); onNavigate('system-settings'); }}
                    className="w-full text-left px-2 py-2 rounded-lg hover:bg-[#F1F5F9] flex items-center justify-between transition-colors"
                  >
                    <span>System Management</span>
                    <span className="material-symbols-outlined text-[16px] text-[#64748B]">chevron_right</span>
                  </button>
                  <button
                    onClick={() => { setProfileOpen(false); onNavigate('alerts-notifications'); }}
                    className="w-full text-left px-2 py-2 rounded-lg hover:bg-[#F1F5F9] flex items-center justify-between transition-colors"
                  >
                    <span>Alerts & Notifications</span>
                    <span className="material-symbols-outlined text-[16px] text-[#64748B]">chevron_right</span>
                  </button>
                  <button
                    onClick={() => { setProfileOpen(false); onNavigate('data-sources'); }}
                    className="w-full text-left px-2 py-2 rounded-lg hover:bg-[#F1F5F9] flex items-center justify-between transition-colors"
                  >
                    <span>HDI Data Sources</span>
                    <span className="material-symbols-outlined text-[16px] text-[#64748B]">chevron_right</span>
                  </button>

                  {/* Dedicated Logout Option */}
                  <div className="pt-1 mt-1 border-t border-[#E2E8F0]">
                    <button
                      onClick={() => {
                        setProfileOpen(false);
                        if (onLogout) {
                          onLogout();
                        } else {
                          onNavigate('enterprise-signin');
                        }
                      }}
                      className="w-full text-left px-2 py-2 rounded-lg hover:bg-rose-50 text-rose-600 flex items-center justify-between transition-colors font-medium group"
                    >
                      <span className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[17px] text-rose-600 group-hover:-translate-x-0.5 transition-transform">logout</span>
                        <span>Log Out</span>
                      </span>
                      <span className="text-[10px] text-rose-500 font-mono">End Session</span>
                    </button>
                  </div>
                </div>

                <div className="pt-2 mt-2 border-t border-[#E2E8F0]">
                  <div className="flex items-center justify-between px-2 text-[10px] text-[#64748B] font-mono">
                    <span>HANA 4.2</span>
                    <span className="text-[#16A34A] font-semibold">ONLINE</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
