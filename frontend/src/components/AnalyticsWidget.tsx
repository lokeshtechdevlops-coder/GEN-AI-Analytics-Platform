import React, { useState } from 'react';
import { AnalyticsDefinition, ExecutionResult } from '../services/semanticService';

export function humanizeColumnName(col: string): string {
  if (!col) return '';
  const lower = col.toLowerCase();
  if (lower === 'grossmarginusd') return 'Gross Margin (USD)';
  if (lower === 'netrevenueusd') return 'Net Revenue (USD)';
  if (lower === 'monthlabel') return 'Month';
  if (lower === 'country') return 'Country';
  if (lower === 'productname' || lower === 'product') return 'Product';
  if (lower === 'customername' || lower === 'customer') return 'Customer';
  if (lower === 'salesregion' || lower === 'region') return 'Region';
  if (lower === 'orderdate') return 'Order Date';
  if (lower === 'quantitysold' || lower === 'quantity') return 'Quantity Sold';
  if (col.endsWith('USD') || col.endsWith('usd')) {
    const base = col.slice(0, -3).replace(/([A-Z])/g, ' $1').trim();
    return `${base} (USD)`;
  }
  return col
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .trim()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export function formatTableCell(value: unknown, column: string): { display: string; tooltip: string } {
  if (value == null) return { display: 'N/A', tooltip: 'Missing' };
  if (typeof value === 'object') return { display: JSON.stringify(value), tooltip: JSON.stringify(value) };

  const str = String(value).trim();
  const num = Number(str);
  if (isNaN(num) || !Number.isFinite(num)) {
    return { display: str, tooltip: str };
  }

  const isCurrency = /usd|revenue|margin|price|cost|sales|amount|val/i.test(column);
  const exactFormatted = isCurrency
    ? `$${num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
    : num.toLocaleString();

  if (Math.abs(num) >= 1_000_000) {
    const compact = isCurrency
      ? `$${(num / 1_000_000).toFixed(2)}M`
      : `${(num / 1_000_000).toFixed(2)}M`;
    return { display: compact, tooltip: `${compact} (${exactFormatted})` };
  }

  if (Math.abs(num) >= 1_000) {
    const compact = isCurrency
      ? `$${num.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
      : num.toLocaleString();
    return { display: compact, tooltip: exactFormatted };
  }

  const standard = isCurrency
    ? `$${Number.isInteger(num) ? num.toLocaleString() : num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : num.toLocaleString();

  return { display: standard, tooltip: exactFormatted };
}

function formatNumber(value: unknown, isCurrency = false): string {
  if (value == null) return 'N/A';
  if (typeof value === 'object') return JSON.stringify(value);
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  const prefix = isCurrency ? '$' : '';
  if (Math.abs(num) >= 1_000_000) return `${prefix}${(num / 1_000_000).toFixed(2)}M`;
  if (Math.abs(num) >= 1_000) return `${prefix}${num.toLocaleString(undefined, { maximumFractionDigits: 1 })}`;
  if (Number.isInteger(num)) return `${prefix}${num.toLocaleString()}`;
  return `${prefix}${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface AnalyticsWidgetProps {
  definition: AnalyticsDefinition;
  result: ExecutionResult;
  showTable?: boolean;
  isDashboard?: boolean;
}

export function AnalyticsWidget({ definition, result, showTable = true, isDashboard = false }: AnalyticsWidgetProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

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

  const isCurrencyMetric = /usd|revenue|margin|price|cost|sales|amount/i.test(valueKey) ||
    /usd|revenue|margin|price|cost|sales|amount/i.test(definition.title);

  // Chart geometry
  const chartLeft = 55, chartRight = 580, chartTop = 20, chartBottom = 160;
  const chartWidth = chartRight - chartLeft;
  const chartHeight = chartBottom - chartTop;
  const svgHeight = 240;
  const y = (value: number) => chartBottom - ((value - low) / range) * chartHeight;
  const x = (index: number) => chartLeft + ((index + 0.5) / rows.length) * chartWidth;
  const barWidth = Math.min(32, (chartWidth / rows.length) * 0.7);

  // Smart label step
  const maxLabels = 16;
  const labelStep = rows.length > maxLabels ? Math.ceil(rows.length / maxLabels) : 1;

  // Gridlines
  const gridCount = 4;
  const gridValues = Array.from({ length: gridCount + 1 }, (_, i) => low + (range * i) / gridCount);

  const palette = ['#3B82F6', '#0D9488', '#8B5CF6', '#EA580C', '#DB2777', '#4F46E5'];

  // Table with smart formatting and humanized column names
  const table = (
    <div className="overflow-auto max-h-80 rounded-xl border border-slate-200">
      <table className="w-full text-sm text-left">
        <thead>
          <tr className="bg-slate-50/80">
            {columns.map(c => (
              <th
                key={c}
                className="px-4 py-2.5 font-semibold text-slate-700 text-xs tracking-wider border-b border-slate-200 whitespace-nowrap"
              >
                {humanizeColumnName(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={index}
              className={`border-b border-slate-100 transition-colors hover:bg-blue-50/40 ${
                index % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'
              }`}
            >
              {columns.map(c => {
                const formatted = formatTableCell(row[c], c);
                return (
                  <td
                    key={c}
                    className="px-4 py-2.5 whitespace-nowrap text-slate-700 tabular-nums text-xs"
                    title={formatted.tooltip}
                  >
                    {formatted.display}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

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

  // Hover tooltip
  const tooltip = hoveredIndex !== null && rows[hoveredIndex] && (
    <g>
      <rect
        x={Math.min(Math.max(x(hoveredIndex) - 70, 5), 460)}
        y={Math.max(y(values[hoveredIndex] ?? 0) - 52, 2)}
        width="140"
        height="44"
        rx="8"
        fill="#FFFFFF"
        stroke="#CBD5E1"
        strokeWidth="1"
        filter="drop-shadow(0 4px 6px rgba(0,0,0,0.08))"
      />
      <text
        x={Math.min(Math.max(x(hoveredIndex), 75), 530)}
        y={Math.max(y(values[hoveredIndex] ?? 0) - 34, 16)}
        textAnchor="middle"
        fontSize="10"
        fill="#64748B"
        fontWeight="500"
      >
        {String(rows[hoveredIndex][labelKey] ?? '')}
      </text>
      <text
        x={Math.min(Math.max(x(hoveredIndex), 75), 530)}
        y={Math.max(y(values[hoveredIndex] ?? 0) - 18, 32)}
        textAnchor="middle"
        fontSize="13"
        fill="#0F172A"
        fontWeight="700"
      >
        {formatTableCell(rows[hoveredIndex][valueKey], valueKey).display}
      </text>
    </g>
  );

  return (
    <div className="space-y-4">
      {definition.kind === 'kpi' ? (
        <div className="flex items-baseline gap-3 py-2">
          <p className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 tabular-nums">
            {String(result.summary?.formatted_value || formatTableCell(rows[0][valueKey] ?? 'N/A', valueKey).display)}
          </p>
        </div>
      ) : definition.kind === 'scatter' && !secondKey ? (
        <p role="alert" className="text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
          Scatter charts require two numeric measures.
        </p>
      ) : definition.kind === 'pie' && !pieValid ? (
        <p role="alert" className="text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
          Pie charts require nonnegative, nonmissing values and a positive total.
        </p>
      ) : (
        definition.kind !== 'table' &&
        finite.length > 0 && (
          <svg viewBox={`0 0 600 ${svgHeight}`} className="w-full max-h-72" role="img" aria-label={definition.title}>
            <title>{definition.title}</title>

            <defs>
              <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3B82F6" />
                <stop offset="100%" stopColor="#1D4ED8" />
              </linearGradient>
              <linearGradient id="barGradientHover" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#60A5FA" />
                <stop offset="100%" stopColor="#2563EB" />
              </linearGradient>
              <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Horizontal Guide Gridlines */}
            {gridValues.map((v, i) => (
              <g key={i}>
                <line
                  x1={chartLeft}
                  y1={y(v)}
                  x2={chartRight}
                  y2={y(v)}
                  stroke="#E2E8F0"
                  strokeWidth="1"
                  strokeDasharray={i === 0 ? undefined : '3,3'}
                />
                <text x={chartLeft - 8} y={y(v) + 3.5} textAnchor="end" fontSize="9" fill="#94A3B8" fontWeight="500">
                  {formatNumber(v, isCurrencyMetric)}
                </text>
              </g>
            ))}

            {definition.kind === 'line' ? (
              <>
                {lineSegments.map((segment, sIdx) => {
                  if (segment.length < 2) return null;
                  const firstPoint = segment[0].split(',');
                  const lastPoint = segment[segment.length - 1].split(',');
                  const areaD = `M${segment.join(' L')} L${lastPoint[0]},${chartBottom} L${firstPoint[0]},${chartBottom} Z`;
                  return (
                    <g key={sIdx}>
                      <path d={areaD} fill="url(#areaGradient)" />
                      <path d={`M${segment.join(' L')}`} fill="none" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </g>
                  );
                })}
                {rows.map((row, index) => {
                  const value = values[index];
                  if (value === null || !Number.isFinite(value)) return null;
                  const isHovered = hoveredIndex === index;
                  return (
                    <circle
                      key={index}
                      cx={x(index)}
                      cy={y(value)}
                      r={isHovered ? 6 : 3.5}
                      fill={isHovered ? '#1D4ED8' : '#2563EB'}
                      stroke="#FFFFFF"
                      strokeWidth="2"
                      style={{ cursor: 'pointer', transition: 'r 0.15s ease' }}
                      onMouseEnter={() => setHoveredIndex(index)}
                      onMouseLeave={() => setHoveredIndex(null)}
                    >
                      <title>{String(row[labelKey])}: {formatTableCell(row[valueKey], valueKey).display}</title>
                    </circle>
                  );
                })}
              </>
            ) : definition.kind === 'scatter' ? (
              rows.map((row, index) => {
                const value = values[index], xVal = scatterX[index];
                if (value === null || xVal === null || !Number.isFinite(value) || !Number.isFinite(xVal)) return null;
                const cx = chartLeft + ((xVal - xLow) / (xHigh - xLow || 1)) * chartWidth;
                const isHovered = hoveredIndex === index;
                return (
                  <circle
                    key={index}
                    cx={cx}
                    cy={y(value)}
                    r={isHovered ? 6 : 4}
                    fill={isHovered ? '#1D4ED8' : '#2563EB'}
                    stroke="#FFFFFF"
                    strokeWidth="1.5"
                    style={{ cursor: 'pointer', transition: 'r 0.15s ease' }}
                    onMouseEnter={() => setHoveredIndex(index)}
                    onMouseLeave={() => setHoveredIndex(null)}
                  >
                    <title>{secondKey}: {String(row[secondKey!])}; {valueKey}: {formatTableCell(row[valueKey], valueKey).display}</title>
                  </circle>
                );
              })
            ) : definition.kind === 'pie' ? (
              rows.map((row, index) => {
                const value = values[index]!;
                if (value === 0) return null;
                const start = angle;
                angle += (value / total) * Math.PI * 2;
                const title = `${String(row[labelKey])}: ${formatTableCell(row[valueKey], valueKey).display}`;
                const isHovered = hoveredIndex === index;
                const cx = 300, cy = 105, r = isHovered ? 90 : 85;
                if (value === total) {
                  return (
                    <circle
                      key={index}
                      cx={cx}
                      cy={cy}
                      r={r}
                      fill={palette[index % palette.length]}
                      style={{ cursor: 'pointer', transition: 'r 0.2s ease' }}
                      onMouseEnter={() => setHoveredIndex(index)}
                      onMouseLeave={() => setHoveredIndex(null)}
                    >
                      <title>{title}</title>
                    </circle>
                  );
                }
                const path = `M${cx},${cy} L${cx + Math.cos(start) * r},${cy + Math.sin(start) * r} A${r},${r} 0 ${angle - start > Math.PI ? 1 : 0},1 ${cx + Math.cos(angle) * r},${cy + Math.sin(angle) * r} Z`;
                return (
                  <path
                    key={index}
                    d={path}
                    fill={palette[index % palette.length]}
                    style={{ cursor: 'pointer', transition: 'all 0.2s ease' }}
                    onMouseEnter={() => setHoveredIndex(index)}
                    onMouseLeave={() => setHoveredIndex(null)}
                  >
                    <title>{title}</title>
                  </path>
                );
              })
            ) : (
              rows.map((row, index) => {
                const value = values[index];
                if (value === null || !Number.isFinite(value)) return null;
                const barH = Math.max(2, Math.abs(y(value) - y(0)));
                const barY = Math.min(y(value), y(0));
                const isHovered = hoveredIndex === index;
                return (
                  <rect
                    key={index}
                    x={x(index) - barWidth / 2}
                    y={barY}
                    width={barWidth}
                    height={barH}
                    rx="4"
                    ry="4"
                    fill={isHovered ? 'url(#barGradientHover)' : 'url(#barGradient)'}
                    style={{ cursor: 'pointer', transition: 'fill 0.15s ease' }}
                    onMouseEnter={() => setHoveredIndex(index)}
                    onMouseLeave={() => setHoveredIndex(null)}
                  >
                    <title>{String(row[labelKey])}: {formatTableCell(row[valueKey], valueKey).display}</title>
                  </rect>
                );
              })
            )}

            {/* X-axis labels without aggressive truncation */}
            {!['pie', 'scatter'].includes(definition.kind) &&
              rows.map((row, index) => {
                if (index % labelStep !== 0) return null;
                const label = String(row[labelKey] ?? 'Missing');
                // Allow up to 18 characters so "United States" is never truncated
                const displayLabel = label.length > 18 ? label.slice(0, 17) + '…' : label;
                if (rows.length > 8) {
                  return (
                    <text
                      key={index}
                      x={x(index)}
                      y={chartBottom + 12}
                      textAnchor="end"
                      fontSize="9"
                      fill="#64748B"
                      fontWeight="500"
                      transform={`rotate(-40, ${x(index)}, ${chartBottom + 12})`}
                    >
                      {displayLabel}
                    </text>
                  );
                }
                return (
                  <text
                    key={index}
                    x={x(index)}
                    y={chartBottom + 16}
                    textAnchor="middle"
                    fontSize="9"
                    fill="#64748B"
                    fontWeight="500"
                  >
                    {displayLabel}
                  </text>
                );
              })}

            {tooltip}
          </svg>
        )
      )}

      {/* Show table only when requested or if kind is table */}
      {(definition.kind === 'table' || (definition.kind !== 'kpi' && showTable)) && table}

      {/* Footer timings (hidden on Executive Dashboard to remove clutter) */}
      {!isDashboard && (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-medium">
            {result.records_matched.toLocaleString()} records
          </span>
          <span className="text-slate-300">·</span>
          <span>{result.execution_backend}</span>
          <span className="text-slate-300">·</span>
          <span className="tabular-nums">{result.execution_time_ms.toFixed(1)} ms</span>
        </div>
      )}
    </div>
  );
}
