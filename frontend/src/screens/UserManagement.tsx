import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { fetchManagedUsers, ManagedUser } from '../services/userManagementService';
import { getApiErrorMessage } from '../services/api';

interface UserManagementProps {
  onNavigate: (path: string) => void;
}

export const UserManagement: React.FC<UserManagementProps> = ({ onNavigate }) => {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [projectCollections, setProjectCollections] = useState<string[]>([]);
  const requestRef = useRef<AbortController | null>(null);

  const refreshUsers = useCallback(async () => {
    if (requestRef.current) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    try {
      const data = await fetchManagedUsers(controller.signal);
      if (!controller.signal.aborted) {
        setUsers(data.users);
        setUpdatedAt(data.fetched_at);
        setProjectCollections(data.project_role_collections || []);
        setError(null);
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(getApiErrorMessage(err, 'Unable to load XSUAA users. Please try again.'));
        // Do not retain sensitive records after permission or session loss.
        if (axios.isAxiosError(err) && [401, 403].includes(err.response?.status ?? 0)) {
          setUsers([]);
          setUpdatedAt(null);
        }
      }
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshUsers();
    const interval = window.setInterval(() => {
      if (!document.hidden) void refreshUsers();
    }, 30_000);
    const onVisible = () => { if (!document.hidden) void refreshUsers(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      requestRef.current?.abort();
      requestRef.current = null;
    };
  }, [refreshUsers]);

  return (
    <div className="flex flex-col w-full gap-space-xl">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-md">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB]"></span>
            <span className="font-label-sm uppercase tracking-widest text-[#64748B] font-semibold">
              SECURITY AUDIT · RBAC ACCESS CONTROLS
            </span>
          </div>
          <h1 className="font-headline-xl text-[#0F172A] font-semibold tracking-tight">
            User Management & RBAC Roles
          </h1>
          <p className="font-body-md text-[#475569] mt-1">
            Enterprise identity governance linked with SAP BTP Trust Configuration and OAuth SSO.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-start md:self-end mt-2 md:mt-0">
          <button 
            onClick={() => void refreshUsers()}
            disabled={loading}
            className="inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-xl bg-white text-[#0F172A] font-label-md text-label-md hover:bg-[#F1F5F9] transition-colors shadow-xs border border-[#CBD5E1] whitespace-nowrap shrink-0"
          >
            <span className="material-symbols-outlined text-[16px] text-[#2563EB]">refresh</span>
            <span>{loading ? 'Refreshing...' : 'Refresh Users'}</span>
          </button>
        </div>
      </div>

      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}{updatedAt && ' Showing the last successful update.'}</div>}

      <div className="bg-white rounded-2xl shadow-xs border border-[#E2E8F0] overflow-hidden" aria-busy={loading}>
        <div className="p-space-lg border-b border-[#E2E8F0] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-headline-sm font-semibold text-[#0F172A]">GEN-AI Project Accounts</span>
            <span className="px-2.5 py-0.5 rounded-full bg-[#F1F5F9] text-xs font-mono text-[#475569] border border-[#E2E8F0]">
              {updatedAt
                ? `${users.length} Accounts / ${users.filter(user => user.status === 'Active').length} Active`
                : loading ? 'Loading accounts...' : 'Accounts unavailable'}
            </span>
          </div>
          <span className="text-xs text-[#64748B]">SAP XSUAA · Refreshes every 30s{updatedAt && ` · Updated ${new Date(updatedAt).toLocaleTimeString()}`}</span>
        </div>

        <div className="overflow-x-auto scroll-touch">
          <table className="w-full text-left font-body-sm text-body-sm min-w-[580px]">
            <thead>
              <tr className="bg-[#F8FAFC] text-[#475569] font-label-md uppercase tracking-wider border-b border-[#E2E8F0]">
                <th className="py-3 px-6 font-semibold">User / Identity</th>
                <th className="py-3 px-6 font-semibold">Role Descriptor</th>
                <th className="py-3 px-6 font-semibold">Security Tier</th>
                <th className="py-3 px-6 font-semibold">Status</th>
                <th className="py-3 px-6 font-semibold text-right">Last Login</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {users.length === 0 && (
                <tr><td colSpan={5} className="py-8 px-6 text-center text-[#64748B]">
                  {loading ? 'Loading project XSUAA accounts...' : error ? 'User data is unavailable.' : 'No users are assigned to this project’s Administrator or Member role collections.'}
                </td></tr>
              )}
              {users.map(u => (
                <tr key={u.id} className="hover:bg-[#F8FAFC] transition-colors">
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#EFF6FF] text-[#1D4ED8] flex items-center justify-center font-semibold text-xs border border-[#BFDBFE]">
                        {u.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-semibold text-[#0F172A]">{u.name}</div>
                        <div className="text-xs text-[#64748B]">{u.email || 'Email unavailable'}</div>
                        {u.origin && <div className="text-xs text-[#64748B]">{u.origin}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-6 text-[#0F172A] font-medium">{u.role}</td>
                  <td className="py-4 px-6">
                    <span className="px-2.5 py-0.5 rounded-md bg-[#F1F5F9] text-xs font-mono text-[#334155] border border-[#E2E8F0] font-medium">
                      {u.tier}
                    </span>
                  </td>
                  <td className="py-4 px-6">
                    <span className={`px-2.5 py-0.5 rounded-full border text-xs font-medium ${u.status === 'Active' ? 'bg-[#DCFCE7] text-[#15803D] border-[#BBF7D0]' : 'bg-[#F1F5F9] text-[#475569] border-[#E2E8F0]'}`}>
                      {u.status}
                    </span>
                  </td>
                  <td className="py-4 px-6 text-right font-mono text-[#64748B]">{u.last_login ? new Date(u.last_login).toLocaleString() : 'Not available'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-xs text-[#64748B]">Only users directly assigned to {projectCollections.length ? projectCollections.join(' or ') : 'this project’s Administrator or Member role collections'} are listed. Access through identity-provider group mappings may not appear as a direct assignment. Status shows whether the XSUAA account is enabled. Last Login is the latest sign-in recorded by XSUAA.</p>
    </div>
  );
};
