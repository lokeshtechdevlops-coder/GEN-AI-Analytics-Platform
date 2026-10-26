import React from 'react';
import { AnalyticsDefinition, ExecutionResult } from '../services/semanticService';

export function AnalyticsWidget({ definition, result }: { definition: AnalyticsDefinition; result: ExecutionResult }) {
  if (!result.success) return <p role="alert" className="text-red-700">{result.error || 'Execution failed.'}</p>;
  if (!result.data.length) return <p className="text-slate-500">No matching records.</p>;
  const rows = result.data;
  const columns = Object.keys(rows[0]);
  const measures = (definition.query_plan.measures as { field: string; alias?: string }[] | undefined)?.map(m => m.alias || m.field)
    || [String(definition.query_plan.metric || 'value')];
  const valueKey = 'value' in rows[0] ? 'value' : measures.find(key => key in rows[0]) || columns[columns.length - 1];
  const labelKey = columns.find(key => key !== valueKey && !measures.includes(key)) || columns[0];
  const values = rows.map(row => row[valueKey] == null ? null : Number(row[valueKey]));
  const finite = values.filter((v): v is number => v !== null && Number.isFinite(v));
  const low = Math.min(0, ...finite), high = Math.max(0, ...finite), range = high - low || 1;
  const y = (value: number) => 160 - ((value - low) / range) * 140;
  const x = (index: number) => 40 + ((index + 0.5) / rows.length) * 520;
  const table = <div className="overflow-auto max-h-80"><table className="w-full text-sm text-left"><thead><tr>{columns.map(c => <th className="p-2 bg-slate-50" key={c}>{c}</th>)}</tr></thead><tbody>
    {rows.map((row, index) => <tr key={index} className="border-t">{columns.map(c => <td key={c} className="p-2 whitespace-nowrap">{row[c] == null ? 'N/A' : String(row[c])}</td>)}</tr>)}
  </tbody></table></div>;
  const palette = ['#2563eb', '#0d9488', '#9333ea', '#ea580c', '#db2777', '#4f46e5'];
  const secondKey = measures.find(key => key !== valueKey && key in rows[0]);
  const scatterX = secondKey ? rows.map(row => row[secondKey] == null ? null : Number(row[secondKey])) : [];
  const xs = scatterX.filter((v): v is number => v !== null && Number.isFinite(v));
  const xLow = Math.min(...xs), xHigh = Math.max(...xs);
  const pieValid = finite.length === values.length && finite.every(v => v >= 0) && finite.reduce((a, b) => a + b, 0) > 0;
  let angle = -Math.PI / 2;
  const total = finite.reduce((a, b) => a + b, 0);
  const lineSegments: string[][] = [[]];
  values.forEach((value, index) => {
    if (value === null || !Number.isFinite(value)) lineSegments.push([]);
    else lineSegments[lineSegments.length - 1].push(`${x(index)},${y(value)}`);
  });
  return <div className="space-y-3">
    {definition.kind === 'kpi' ? <p className="text-3xl font-semibold text-slate-900">{String(result.summary.formatted_value ?? rows[0][valueKey] ?? 'N/A')}</p>
      : definition.kind === 'scatter' && !secondKey ? <p role="alert">Scatter charts require two numeric measures.</p>
      : definition.kind === 'pie' && !pieValid ? <p role="alert">Pie charts require nonnegative, nonmissing values and a positive total.</p>
      : definition.kind !== 'table' && finite.length > 0 && <svg viewBox="0 0 600 210" className="w-full max-h-72" role="img" aria-label={definition.title}>
      <title>{definition.title}</title>
      {definition.kind !== 'pie' && <line x1="35" x2="570" y1={y(0)} y2={y(0)} stroke="#cbd5e1" />}
      {definition.kind === 'line' ? lineSegments.filter(points => points.length).map((points, index) => <polyline key={index} fill="none" stroke="#2563eb" strokeWidth="2" points={points.join(' ')} />)
        : definition.kind === 'scatter' ? rows.map((row, index) => {
          const value = values[index], horizontal = scatterX[index];
          if (value === null || horizontal == null || !Number.isFinite(value) || !Number.isFinite(horizontal)) return null;
          return <circle key={index} cx={40 + (horizontal - xLow) / (xHigh - xLow || 1) * 520} cy={y(value)} r="4" fill="#2563eb"><title>{secondKey}: {String(row[secondKey!])}; {valueKey}: {String(row[valueKey])}</title></circle>;
        }) : definition.kind === 'pie' ? rows.map((row, index) => {
          const value = values[index]!;
          if (value === 0) return null;
          const start = angle; angle += value / total * Math.PI * 2;
          const title = `${String(row[labelKey])}: ${String(row[valueKey])}`;
          if (value === total) return <circle key={index} cx="300" cy="100" r="85" fill={palette[index % palette.length]}><title>{title}</title></circle>;
          const path = `M300,100 L${300 + Math.cos(start) * 85},${100 + Math.sin(start) * 85} A85,85 0 ${angle - start > Math.PI ? 1 : 0},1 ${300 + Math.cos(angle) * 85},${100 + Math.sin(angle) * 85} Z`;
          return <path key={index} d={path} fill={palette[index % palette.length]}><title>{title}</title></path>;
        }) : rows.map((row, index) => {
          const value = values[index];
          if (value === null || !Number.isFinite(value)) return null;
          return <rect key={index} x={x(index) - Math.min(20, 200 / rows.length)} y={Math.min(y(value), y(0))} width={Math.min(40, 400 / rows.length)} height={Math.max(1, Math.abs(y(value) - y(0)))} rx="2" fill="#2563eb"><title>{String(row[labelKey])}: {String(row[valueKey])}</title></rect>;
        })}
      {!['pie', 'scatter'].includes(definition.kind) && rows.map((row, index) => <text key={index} x={x(index)} y="190" textAnchor="middle" fontSize="9" fill="#64748b">{String(row[labelKey] ?? 'Missing').slice(0, 14)}</text>)}
    </svg>}
    {definition.kind !== 'kpi' && table}
    <p className="text-xs text-slate-500">{result.records_matched} matching records · {result.execution_backend} · {result.execution_time_ms.toFixed(2)} ms</p>
  </div>;
}
