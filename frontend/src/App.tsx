/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, lazy, Suspense } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { MobileBottomNav } from './components/MobileBottomNav';
import { CommandPalette } from './components/CommandPalette';
import type { UserContext } from './screens/EnterpriseSignIn';
import { clearLocalIdentity, sapRouterRoute, SIGNED_OUT_KEY } from './services/authNavigation';
import { selectedContext, ensureDefaultContext } from './services/executionContext';

const ExecutiveDashboard = lazy(() => import('./screens/ExecutiveDashboard').then(m => ({ default: m.ExecutiveDashboard })));
const GraphStudio = lazy(() => import('./screens/GraphStudio').then(m => ({ default: m.GraphStudio })));
const RAGChat = lazy(() => import('./screens/RAGChat').then(m => ({ default: m.RAGChat })));
const DatasetIngestion = lazy(() => import('./screens/DatasetIngestion').then(m => ({ default: m.DatasetIngestion })));
const DataExplorer = lazy(() => import('./screens/DataExplorer').then(m => ({ default: m.DataExplorer })));
const AlertsNotifications = lazy(() => import('./screens/AlertsNotifications').then(m => ({ default: m.AlertsNotifications })));
const ReportsLibrary = lazy(() => import('./screens/ReportsLibrary').then(m => ({ default: m.ReportsLibrary })));
const DataSources = lazy(() => import('./screens/DataSources').then(m => ({ default: m.DataSources })));
const UserManagement = lazy(() => import('./screens/UserManagement').then(m => ({ default: m.UserManagement })));
const SystemSettings = lazy(() => import('./screens/SystemSettings').then(m => ({ default: m.SystemSettings })));
const EnterpriseSignIn = lazy(() => import('./screens/EnterpriseSignIn').then(m => ({ default: m.EnterpriseSignIn })));

const ScreenFallback = () => (
  <div className="flex items-center justify-center min-h-[300px] p-12 text-slate-500">
    <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mr-3" />
    Loading view…
  </div>
);

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<UserContext | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [activePath, setActivePath] = useState<string>('executive-dashboard');
  const [hasOpenedChat, setHasOpenedChat] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [systemTab, setSystemTab] = useState('Connections');
  const [datasetScope, setDatasetScope] = useState(() => JSON.stringify(selectedContext()));

  useEffect(() => {
    void ensureDefaultContext();
  }, []);

  useEffect(() => {
    const changed = () => setDatasetScope(JSON.stringify(selectedContext()));
    window.addEventListener('dataset-context-changed', changed);
    return () => window.removeEventListener('dataset-context-changed', changed);
  }, []);

  useEffect(() => {
    if (localStorage.getItem(SIGNED_OUT_KEY) === 'true') {
      setIsCheckingSession(false);
      return;
    }
    const token = localStorage.getItem('auth_token');

    // AppRouter forwards its SAP access token using the HttpOnly session cookie.
    // Check that session before considering a token from a local sign-in.
    let cancelled = false;
    let routerSession = true;
    fetch('/api/auth/me', { credentials: 'same-origin' })
      .then((res) => {
        if ((res.status === 401 || res.status === 403) && token) {
          routerSession = false;
          return fetch('/api/auth/me', {
            credentials: 'same-origin',
            headers: { Authorization: `Bearer ${token}` }
          });
        }
        return res;
      })
      .then((res) => {
        if (res.ok) return res.json();
        throw new Error('Not authenticated');
      })
      .then((user: UserContext) => {
        if (cancelled) return;
        if (user && (user.user_id || user.email)) {
          if (routerSession) {
            localStorage.removeItem('auth_token');
            localStorage.removeItem('sap_ias_sso_token');
          }
          localStorage.setItem('auth_user', JSON.stringify(user));
          setCurrentUser(user);
          setIsAuthenticated(true);
        } else {
          throw new Error('Invalid user context');
        }
      })
      .catch(() => {
        if (cancelled) return;
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
        setIsAuthenticated(false);
        setCurrentUser(null);
      })
      .finally(() => {
        if (!cancelled) setIsCheckingSession(false);
      });
    return () => { cancelled = true; };
  }, []);

  const [customGraphPrompt, setCustomGraphPrompt] = useState<string>(
    ''
  );

  const handleNavigate = (path: string) => {
    if (path === 'enterprise-signin' || path === 'logout') {
      handleLogout();
      return;
    }
    if (path === 'system-management' || path.startsWith('system-settings/')) {
      setSystemTab(path.endsWith('/connections') ? 'Connections' : 'Sync Jobs');
      path = 'system-settings';
    }
    if (path === 'ai-dashboards-rag-chat') setHasOpenedChat(true);
    setActivePath(path);
    setSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleLogout = () => {
    void fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
    clearLocalIdentity(true);
    setIsAuthenticated(false);
    setCurrentUser(null);
    setHasOpenedChat(false);
    setActivePath('enterprise-signin');
    setSidebarOpen(false);
    // Only redirect if an external AppRouter URL is explicitly configured
    const logoutTarget = sapRouterRoute('/logout');
    if (logoutTarget && logoutTarget.startsWith('http')) {
      window.location.replace(logoutTarget);
    }
  };

  useEffect(() => {
    const guardSignedOutSession = () => {
      if (localStorage.getItem(SIGNED_OUT_KEY) !== 'true') return;
      setIsAuthenticated(false);
      setCurrentUser(null);
      setHasOpenedChat(false);
      setIsCheckingSession(false);
    };
    const onSessionExpired = () => {
      setIsAuthenticated(false);
      setCurrentUser(null);
      setActivePath('enterprise-signin');
    };
    window.addEventListener('pageshow', guardSignedOutSession);
    window.addEventListener('storage', guardSignedOutSession);
    window.addEventListener('session-expired', onSessionExpired);
    return () => {
      window.removeEventListener('pageshow', guardSignedOutSession);
      window.removeEventListener('storage', guardSignedOutSession);
      window.removeEventListener('session-expired', onSessionExpired);
    };
  }, []);

  const handleSelectQueryFromPalette = (query: string) => {
    setCustomGraphPrompt(query);
  };

  const isAuthPage = !isAuthenticated || activePath === 'enterprise-signin' || activePath === 'enterprisesignin';
  const isChat = activePath === 'ai-dashboards-rag-chat';

  if (isCheckingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] text-[#0F172A]" role="status" aria-live="polite">
        Signing in with SAP Universal ID / BTP IAS…
      </div>
    );
  }

  if (isAuthPage) {
    return (
      <Suspense fallback={<ScreenFallback />}>
        <EnterpriseSignIn
          onSignInSuccess={(user) => {
            setIsAuthenticated(true);
            if (user) {
              setCurrentUser(user);
            }
            handleNavigate('executive-dashboard');
          }}
        />
      </Suspense>
    );
  }

  return (
    <div className="min-h-screen min-h-dvh bg-[#F8FAFC] text-[#0F172A] font-body-md antialiased select-auto w-full overflow-x-hidden flex flex-col">
      {/* Global Responsive Header */}
      <Header
        activePath={activePath}
        onNavigate={handleNavigate}
        onToggleSidebar={() => setSidebarOpen(prev => !prev)}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        onLogout={handleLogout}
        user={currentUser}
      />

      {/* Global Sidebar Navigation (Drawer on mobile/tablet/foldable, Fixed 260px on desktop) */}
      <Sidebar
        activePath={activePath}
        onNavigate={handleNavigate}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        user={currentUser}
        onLogout={handleLogout}
      />

      {/* Main Content Area - Fluidly & Automatically Determined for Every Screen & Aspect Ratio */}
      <div className="pl-0 lg:pl-[260px] w-full flex-1 transition-all duration-300">
        <main
          className={`w-full pt-[60px] sm:pt-[72px] bg-[#F8FAFC] ${isChat
              ? 'h-[100dvh] overflow-hidden pb-14 sm:pb-16 lg:pb-0 flex flex-col'
              : 'min-h-screen min-h-dvh pb-24 lg:pb-12'
            }`}
        >
          <Suspense fallback={<ScreenFallback />}>
            {/* Remount conversations when their data context changes. */}
            <div className={`flex-1 w-full max-w-[1600px] mx-auto p-2 sm:p-3 lg:p-4 overflow-hidden flex-col ${isChat ? 'flex' : 'hidden'}`}>
              {hasOpenedChat && <RAGChat key={`${currentUser?.user_id}:${datasetScope}`} onNavigate={handleNavigate} isActive={isChat} />}
            </div>

            {!isChat && (
              <div key={datasetScope} className="max-w-[1440px] mx-auto p-margin">
                {activePath === 'executive-dashboard' && (
                  <ExecutiveDashboard onNavigate={handleNavigate} />
                )}

                {activePath === 'build-your-kpi-graph-studio' && (
                  <GraphStudio
                    onNavigate={handleNavigate}
                  />
                )}

                {activePath === 'upload-dataset' && (
                  <DatasetIngestion onNavigate={handleNavigate} />
                )}

                {activePath === 'data-explorer' && (
                  <DataExplorer onNavigate={handleNavigate} />
                )}

                {activePath === 'alerts-notifications' && (
                  import.meta.env.VITE_DEMO_MODE === 'true' ? <AlertsNotifications onNavigate={handleNavigate} /> : <p className="p-6 bg-white rounded-xl text-slate-600">No alert rules are configured. Configure and validate source data before enabling alerts.</p>
                )}

                {activePath === 'reports-library' && (
                  import.meta.env.VITE_DEMO_MODE === 'true' ? <ReportsLibrary onNavigate={handleNavigate} /> : <p className="p-6 bg-white rounded-xl text-slate-600">No saved reports are available. Review analytics in Graph Studio and publish approved dashboard widgets.</p>
                )}

                {activePath === 'data-sources' && (
                  <DataSources onNavigate={handleNavigate} />
                )}

                {activePath === 'user-management' && (
                  <UserManagement onNavigate={handleNavigate} />
                )}

                {activePath === 'system-settings' && (
                  <SystemSettings key={systemTab} initialTab={systemTab} onNavigate={handleNavigate} />
                )}
              </div>
            )}
          </Suspense>
        </main>
      </div>

      {/* Mobile / Tablet Bottom Ergonomic Navigation Bar (Hidden on desktop) */}
      <MobileBottomNav
        activePath={activePath}
        onNavigate={handleNavigate}
        onOpenDrawer={() => setSidebarOpen(true)}
      />

      {/* Global Quick Jump Command Palette (Cmd+K) */}
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onNavigate={handleNavigate}
        onSelectQuery={handleSelectQueryFromPalette}
      />
    </div>
  );
}
