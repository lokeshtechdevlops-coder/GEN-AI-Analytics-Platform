import React from 'react';

interface SidebarProps {
  activePath: string;
  onNavigate: (path: string) => void;
  isOpen: boolean;
  onClose: () => void;
  user?: { name?: string; email?: string; role?: string } | null;
  onLogout?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activePath,
  onNavigate,
  isOpen,
  onClose,
  user,
  onLogout,
}) => {
  const navItems = [
    {
      id: 'executive-dashboard',
      label: 'Executive Dashboard',
      badge: null,
      icon: 'dashboard',
    },
    {
      id: 'ai-dashboards-rag-chat',
      label: 'RAG Chat',
      badge: null,
      icon: 'chat',
    },
    {
      id: 'build-your-kpi-graph-studio',
      label: 'Build Your KPI',
      badge: 'Agent',
      icon: 'query_stats',
    },
    {
      id: 'upload-dataset',
      label: 'Upload Dataset',
      badge: null,
      icon: 'upload_file',
    },
    {
      id: 'data-explorer',
      label: 'Data Explorer',
      badge: 'Insight',
      icon: 'terminal',
    },
    {
      id: 'alerts-notifications',
      label: 'Alerts & Notifications',
      badge: null,
      icon: 'notifications',
    },
    {
      id: 'reports-library',
      label: 'Reports Library',
      badge: null,
      icon: 'folder',
    },
    {
      id: 'data-sources',
      label: 'Data Sources',
      badge: null,
      icon: 'database',
    },
    {
      id: 'user-management',
      label: 'User Management',
      badge: null,
      icon: 'person',
    },
    {
      id: 'system-settings',
      label: 'System Management',
      badge: null,
      icon: 'settings',
    },
  ];

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden transition-opacity duration-200"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed left-0 top-0 lg:top-[72px] bottom-0 w-[280px] sm:w-[260px] bg-white border-r border-[#E2E8F0] z-50 lg:z-40 flex flex-col justify-between overflow-y-auto select-none transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
          }`}
      >
        <div className="p-space-md">
          {/* Mobile Drawer Header with Close Button */}
          <div className="flex lg:hidden items-center justify-between pb-3 mb-2 border-b border-[#E2E8F0]">
            <div className="flex flex-col">
              <span className="font-headline-sm text-[16px] font-semibold text-[#0F172A]">
                NEOVATIC
              </span>
              <span className="text-[10px] text-[#64748B] uppercase font-mono">
                SAP HANA & AI CORE
              </span>
            </div>
            <button
              onClick={onClose}
              aria-label="Close navigation"
              className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-[#F1F5F9] text-[#0F172A]"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>

          <div className="px-space-sm py-space-xs mb-space-sm flex items-center justify-between">
            <span className="font-label-sm text-label-sm uppercase tracking-widest text-[#64748B] font-semibold">
              Platform Navigation
            </span>
          </div>

          <nav className="flex flex-col gap-1">
            {navItems.map((item) => {
              const isActive = activePath === item.id;
              const isAiItem = item.id === 'ai-dashboards-rag-chat' || item.id === 'build-your-kpi-graph-studio';

              let activeClasses = 'bg-[#EFF6FF] text-[#1D4ED8] font-medium shadow-xs border border-[#BFDBFE]/80';
              let activeIconClass = 'text-[#2563EB]';
              let badgeClasses = 'bg-[#F1F5F9] text-[#475569]';

              if (isActive && isAiItem) {
                activeClasses = 'bg-[#F5F3FF] text-[#6D28D9] font-medium shadow-xs border border-[#DDD6FE]/80';
                activeIconClass = 'text-[#7C3AED]';
              }

              if (item.badge === 'Live') {
                badgeClasses = isActive ? 'bg-[#DCFCE7] text-[#166534]' : 'bg-[#DCFCE7] text-[#166534]';
              } else if (isAiItem) {
                badgeClasses = isActive ? 'bg-[#EDE9FE] text-[#6D28D9]' : 'bg-[#F3E8FF] text-[#7C3AED]';
              } else if (item.badge === 'Insight') {
                badgeClasses = isActive ? 'bg-[#E0F2FE] text-[#0369A1]' : 'bg-[#E0F2FE] text-[#0369A1]';
              } else if (isActive) {
                badgeClasses = 'bg-[#DBEAFE] text-[#1D4ED8]';
              }

              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onNavigate(item.id);
                    onClose();
                  }}
                  className={`w-full flex items-center justify-between px-space-sm py-2.5 sm:py-2 rounded-xl transition-all font-body-sm text-body-sm text-left ${isActive
                      ? activeClasses
                      : 'text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A] border border-transparent'
                    }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <span className={`material-symbols-outlined text-[17px] ${isActive ? activeIconClass : 'text-[#64748B]'}`}>
                      {item.icon}
                    </span>
                    <span className="truncate">{item.label}</span>
                  </div>

                    {item.badge && (
                    <span
                      className={`font-label-sm text-[10px] px-2 py-0.5 rounded-full shrink-0 font-medium ${badgeClasses}`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* User Profile & Direct Log Out Button at Bottom of Sidebar */}
          <div className="pt-3 mt-auto border-t border-[#E2E8F0]">
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 mb-2">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
                  {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-slate-900 truncate">
                    {user?.name || 'Analytics Admin'}
                  </div>
                  <div className="text-[10px] text-slate-500 truncate font-mono">
                    {user?.email || 'admin@sap.corp'}
                  </div>
                </div>
                <span className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">
                  {user?.role || 'Admin'}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                onClose();
                if (onLogout) {
                  onLogout();
                } else {
                  onNavigate('enterprise-signin');
                }
              }}
              className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-rose-600 hover:bg-rose-50 hover:text-rose-700 transition-colors text-xs font-semibold cursor-pointer border border-rose-100/80 bg-rose-50/30 hover:border-rose-200 group"
            >
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[17px] text-rose-500 group-hover:-translate-x-0.5 transition-transform">
                  logout
                </span>
                <span>Log Out</span>
              </div>
              <span className="text-[10px] text-rose-400 font-mono">End Session</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};
