import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import api from '../services/api';
import { Sidebar } from '../components/Sidebar';
import { ExecutiveDashboard } from '../screens/ExecutiveDashboard';
import { generateCustomGraph } from '../services/graphService';
import { contextHeaders, selectContext, selectedContext } from '../services/executionContext';

vi.mock('../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  getApiErrorMessage: (error: Error, fallback: string) => error.message || fallback,
}));

beforeEach(() => { vi.resetAllMocks(); localStorage.clear(); sessionStorage.clear(); });
afterEach(cleanup);

describe('Platform correctness and navigation', () => {
  it('keeps System Management last and has no top-level cloud configuration entries', () => {
    render(<Sidebar activePath="executive-dashboard" onNavigate={vi.fn()} isOpen onClose={vi.fn()} />);
    const navigation = within(screen.getByRole('navigation')).getAllByRole('button');
    expect(navigation[navigation.length - 1].textContent).toContain('System Management');
    expect(screen.queryByText('System Settings')).toBeNull();
    expect(screen.queryByRole('button', { name: /AWS|Azure|GCP/ })).toBeNull();
  });

  it('isolates dataset selection by account and carries pinned versions', () => {
    localStorage.setItem('auth_user', JSON.stringify({ user_id: 'alice' }));
    selectContext({ datasetId: 'hr', version: 2, semanticRevision: 4 });
    localStorage.setItem('auth_user', JSON.stringify({ user_id: 'bob' }));
    expect(selectedContext()).toBeNull();
    expect(contextHeaders()).toEqual({});
    selectContext({ datasetId: 'factory', version: 1, semanticRevision: 1 });
    localStorage.setItem('auth_user', JSON.stringify({ user_id: 'alice' }));
    expect(contextHeaders()).toEqual({ 'X-Dataset-Id': 'hr', 'X-Dataset-Version': '2', 'X-Semantic-Revision': '4' });
  });

  it('never replaces failed graphs or missing images with a successful sample', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(new Error('Provider unavailable'));
    await expect(generateCustomGraph('Plot output')).rejects.toThrow('Provider unavailable');
    vi.mocked(api.post).mockResolvedValueOnce({ data: { status: 'success', image_base64: '' } });
    await expect(generateCustomGraph('Plot output')).rejects.toThrow('did not return');
  });

  it('renders only widgets actually returned by the published dashboard', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { title: 'HR dashboard', status: 'published', widgets: [{
      definition: { id: 'headcount', revision: 1, title: 'Employee records', kind: 'kpi', query_plan: { metric: '*', aggregation: 'COUNT' }, explanation: 'Reviewed source grain.' },
      result: { success: true, data: [{ value: 2 }], summary: { formatted_value: '2' }, records_matched: 2, execution_backend: 'pandas', execution_time_ms: 1.25 },
    }] } });
    render(<ExecutiveDashboard onNavigate={vi.fn()} />);
    expect(await screen.findByText('Employee records')).toBeTruthy();
    expect(screen.queryByText('Total Net Revenue')).toBeNull();
    expect(screen.getByText('2')).toBeTruthy();
  });
});
