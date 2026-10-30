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
  const maxLabels = 8;
  const labelStep = rows.length > maxLabels ? Math.ceil(rows.length / maxLabels) : 1;

  // Gridlines
  const gridCount = 4;
  const gridValues = Array.from({ length: gridCount + 1 }, (_, i) => low + (range * i) / gridCount);

  const palette = ['#2563EB', '#0D9488', '#7C3AED', '#EA580C', '#0284C7', '#D97706', '#4F46E5', '#059669', '#DB2777', '#6366F1', '#0891B2', '#475569'];

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

  const numericColumns = columns.filter(c => c !== valueKey && rows.some(r => r[c] != null && !isNaN(Number(r[c])) && Number.isFinite(Number(r[c]))));
  const secondKey = measures.find(key => key !== valueKey && key in rows[0]) || numericColumns[0];
  const scatterX = secondKey ? rows.map(row => row[secondKey] == null ? null : Number(row[secondKey])) : [];
  const xs = scatterX.filter((v): v is number => v !== null && Number.isFinite(v));
  const xLow = xs.length ? Math.min(...xs) : 0, xHigh = xs.length ? Math.max(...xs) : 1;
  const hasSecondMeasure = Boolean(secondKey && xs.length > 0);
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
) : definition.kind === 'pie' ? (
        !pieValid ? (
          <p role="alert" className="text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
            Pie charts require nonnegative, nonmissing values and a positive total.
          </p>
        ) : (
          <div className="flex flex-col md:flex-row items-center gap-6 w-full py-1">
            {/* Left: Authentic Solid Pie Chart */}
            <div className="w-full md:w-[48%] flex flex-col items-center justify-center shrink-0">
              <div className="relative w-56 h-56 flex items-center justify-center">
                <svg viewBox="0 0 240 240" className="w-full h-full overflow-visible" role="img" aria-label={definition.title}>
                  {(() => {
                    let currentAngle = -Math.PI / 2;
                    return rows.map((row, index) => {
                      const value = values[index]!;
                      if (value <= 0) return null;
                      const sliceAngle = (value / total) * Math.PI * 2;
                      const start = currentAngle;
                      const end = currentAngle + sliceAngle;
                      currentAngle = end;

                      const isHovered = hoveredIndex === index;
                      const r = isHovered ? 104 : 98;
                      const color = palette[index % palette.length];
                      const title = `${String(row[labelKey])}: ${formatTableCell(row[valueKey], valueKey).display} (${((value / total) * 100).toFixed(1)}%)`;

                      if (value === total) {
                        return (
                          <circle
                            key={index}
                            cx={120}
                            cy={120}
                            r={r}
                            fill={color}
                            style={{ cursor: 'pointer', transition: 'all 0.15s ease' }}
                            onMouseEnter={() => setHoveredIndex(index)}
                            onMouseLeave={() => setHoveredIndex(null)}
                          >
                            <title>{title}</title>
                          </circle>
                        );
                      }

                      const largeArc = sliceAngle > Math.PI ? 1 : 0;
                      const x1 = 120 + r * Math.cos(start);
                      const y1 = 120 + r * Math.sin(start);
                      const x2 = 120 + r * Math.cos(end);
                      const y2 = 120 + r * Math.sin(end);

                      const d = `M 120 120 L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;

                      return (
                        <path
                          key={index}
                          d={d}
                          fill={color}
                          stroke="#FFFFFF"
                          strokeWidth="1.5"
                          style={{ cursor: 'pointer', transition: 'all 0.15s ease' }}
                          onMouseEnter={() => setHoveredIndex(index)}
                          onMouseLeave={() => setHoveredIndex(null)}
                        >
                          <title>{title}</title>
                        </path>
                      );
                    });
                  })()}
                </svg>
              </div>

              {/* Active Slice Pill */}
              {hoveredIndex !== null && rows[hoveredIndex] ? (
                <div className="mt-2 text-center text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-200/80 px-3 py-1 rounded-full animate-in fade-in">
                  <span>{String(rows[hoveredIndex][labelKey])}: </span>
                  <span className="text-blue-600 font-bold">{formatTableCell(rows[hoveredIndex][valueKey], valueKey).display}</span>
                  <span className="text-slate-400 font-medium"> ({((Number(values[hoveredIndex] ?? 0) / total) * 100).toFixed(1)}%)</span>
                </div>
              ) : (
                <div className="mt-2 text-center text-xs text-slate-400 font-medium py-1">
                  Hover over any slice or list row
                </div>
              )}
            </div>

            {/* Right: Scrollable Data Breakdown */}
            <div className="w-full md:w-[52%] flex flex-col min-w-0 bg-slate-50/70 rounded-xl border border-slate-200/80 p-3">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-200/70 text-xs">
                <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px] text-blue-600">pie_chart</span>
                  <span>Data Breakdown ({rows.length})</span>
                </span>
                <span className="font-bold text-slate-900 tabular-nums">
                  Total: {formatNumber(total, isCurrencyMetric)}
                </span>
              </div>

              <div className="overflow-y-auto max-h-[195px] pr-2 space-y-1 divide-y divide-slate-100/80 scroll-touch">
                {rows.map((row, index) => {
                  const v = values[index] ?? 0;
                  const pct = total > 0 ? ((v / total) * 100).toFixed(1) : '0';
                  const isHovered = hoveredIndex === index;
                  const label = String(row[labelKey] ?? `Segment ${index + 1}`);
                  const color = palette[index % palette.length];

                  return (
                    <div
                      key={index}
                      onMouseEnter={() => setHoveredIndex(index)}
                      onMouseLeave={() => setHoveredIndex(null)}
                      className={`pt-1.5 first:pt-0 flex items-center justify-between gap-3 text-xs py-1 px-2 rounded-lg transition-colors cursor-pointer ${
                        isHovered ? 'bg-blue-100/70 font-semibold' : 'hover:bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 truncate">
                        <span
                          className="w-2.5 h-2.5 rounded-xs shrink-0"
                          style={{ backgroundColor: color }}
                        />
                        <span className={`truncate ${isHovered ? 'text-blue-900 font-semibold' : 'text-slate-700 font-medium'}`} title={label}>
                          {label}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 tabular-nums text-right">
                        <span className="font-semibold text-slate-900">
                          {formatTableCell(row[valueKey], valueKey).display}
                        </span>
                        <span className="text-[11px] text-slate-400 font-medium w-12 text-right">
                          ({pct}%)
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )
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
                const value = values[index];
                if (value === null || !Number.isFinite(value)) return null;
                const xVal = hasSecondMeasure ? scatterX[index] : null;
                if (hasSecondMeasure && (xVal === null || !Number.isFinite(xVal))) return null;
                const cx = hasSecondMeasure
                  ? chartLeft + ((xVal - xLow) / (xHigh - xLow || 1)) * chartWidth
                  : x(index);
                const cy = y(value);
                const isHovered = hoveredIndex === index;
                return (
                  <g key={index}>
                    {isHovered && (
                      <line
                        x1={cx}
                        y1={cy}
                        x2={cx}
                        y2={chartBottom}
                        stroke="#93C5FD"
                        strokeWidth="1.5"
                        strokeDasharray="3 3"
                      />
                    )}
                    {isHovered && (
                      <circle
                        cx={cx}
                        cy={cy}
                        r={11}
                        fill="#3B82F6"
                        opacity="0.2"
                      />
                    )}
                    <circle
                      key={index}
                      cx={cx}
                      cy={cy}
                      r={isHovered ? 7 : 5}
                      fill={isHovered ? '#1D4ED8' : '#2563EB'}
                      stroke="#FFFFFF"
                      strokeWidth="2"
                      style={{ cursor: 'pointer', transition: 'all 0.15s ease' }}
                      onMouseEnter={() => setHoveredIndex(index)}
                      onMouseLeave={() => setHoveredIndex(null)}
                    >
                      <title>
                        {hasSecondMeasure
                          ? `${secondKey}: ${formatTableCell(row[secondKey], secondKey).display}; ${valueKey}: ${formatTableCell(row[valueKey], valueKey).display}`
                          : `${String(row[labelKey])}: ${formatTableCell(row[valueKey], valueKey).display}`}
                      </title>
                    </circle>
                  </g>
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
            {(!['pie'].includes(definition.kind) && (!hasSecondMeasure || definition.kind !== 'scatter')) &&
              rows.map((row, index) => {
                if (index % labelStep !== 0) return null;
                const label = String(row[labelKey] ?? 'Missing');
                // Allow up to 18 characters so "United States" is never truncated
                const displayLabel = label.length > 18 ? label.slice(0, 17) + '…' : label;
                if (rows.length > 6) {
                  return (
                    <text
                      key={index}
                      x={x(index)}
                      y={chartBottom + 14}
                      textAnchor="end"
                      fontSize="10"
                      fill="#64748B"
                      fontWeight="500"
                      transform={`rotate(-32, ${x(index)}, ${chartBottom + 14})`}
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

            {definition.kind === 'scatter' && hasSecondMeasure && (
              <g>
                <text x={chartLeft} y={chartBottom + 16} textAnchor="start" fontSize="9" fill="#64748B" fontWeight="500">
                  {formatNumber(xLow)}
                </text>
                <text x={chartRight} y={chartBottom + 16} textAnchor="end" fontSize="9" fill="#64748B" fontWeight="500">
                  {formatNumber(xHigh)} ({humanizeColumnName(secondKey)})
                </text>
              </g>
            )}

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
