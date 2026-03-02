import { useState, useMemo, useCallback } from 'react';
import { X } from 'lucide-react';
import { motion } from 'framer-motion';
import useStore from '../../store/useStore';
import KPICard from './KPICard';
import ChartPanel from './ChartPanel';
import ChatPanel from '../chat/ChatPanel';
import FilterBar from './FilterBar';

// Helper: convert value to number
function toNum(val) {
  if (val == null || val === '') return null;
  const s = String(val).replace(/[$€£¥₹,%\s()]/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

export default function Dashboard() {
  const { dashboard, isChatOpen, parsedData } = useStore();
  const [filters, setFilters] = useState({ categorical: {}, numeric: {}, search: '' });
  const [activeChartFilter, setActiveChartFilter] = useState(null);

  const columnMeta = parsedData?.columnMeta || {};

  // Filter rows based on active filters
  const filteredRows = useMemo(() => {
    if (!parsedData?.rows) return [];
    let rows = parsedData.rows;

    // Apply categorical filters
    for (const [col, val] of Object.entries(filters.categorical || {})) {
      if (val) {
        rows = rows.filter((r) => String(r[col] || '').trim() === val);
      }
    }

    // Apply numeric range filters
    for (const [col, range] of Object.entries(filters.numeric || {})) {
      if (range && range.length === 2) {
        rows = rows.filter((r) => {
          const n = toNum(r[col]);
          return n == null || (n >= range[0] && n <= range[1]);
        });
      }
    }

    // Apply search filter
    if (filters.search) {
      const term = filters.search.toLowerCase();
      rows = rows.filter((r) =>
        Object.values(r).some(
          (v) => v != null && String(v).toLowerCase().includes(term)
        )
      );
    }

    // Apply cross-chart filter
    if (activeChartFilter) {
      const { column, value } = activeChartFilter;
      rows = rows.filter((r) => String(r[column] || '').trim() === value);
    }

    return rows;
  }, [parsedData, filters, activeChartFilter]);

  // Recompute KPIs from filtered rows
  const filteredKPIs = useMemo(() => {
    if (!dashboard?.kpi_cards) return [];
    const original = dashboard.kpi_cards;

    // If no filters active, use original values
    const hasFilters =
      Object.values(filters.categorical || {}).some(Boolean) ||
      Object.values(filters.numeric || {}).some(Boolean) ||
      filters.search ||
      activeChartFilter;

    if (!hasFilters) return original;

    return original.map((kpi) => {
      const col = kpi.id; // fall back to find column in confirmed KPIs
      const nums = [];
      for (const row of filteredRows) {
        // Try to find matching column from the label
        for (const key of Object.keys(row)) {
          if (kpi.label?.toLowerCase().includes(key.toLowerCase())) {
            const n = toNum(row[key]);
            if (n != null) nums.push(n);
            break;
          }
        }
      }

      // If we couldn't map, return original
      if (nums.length === 0) return kpi;

      const value =
        kpi.format === 'currency' || kpi.label?.toLowerCase().includes('total')
          ? nums.reduce((a, b) => a + b, 0)
          : nums.reduce((a, b) => a + b, 0) / nums.length;

      let formatted;
      if (kpi.format === 'currency') {
        formatted = `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      } else if (kpi.format === 'percent') {
        formatted = `${value.toFixed(1)}%`;
      } else {
        formatted = Math.abs(value) >= 100
          ? value.toLocaleString(undefined, { maximumFractionDigits: 0 })
          : value.toFixed(2);
      }

      return { ...kpi, formatted_value: formatted, value };
    });
  }, [dashboard, filteredRows, filters, activeChartFilter]);

  // Recompute chart data from filtered rows
  const filteredCharts = useMemo(() => {
    if (!dashboard?.charts) return [];
    const hasFilters =
      Object.values(filters.categorical || {}).some(Boolean) ||
      Object.values(filters.numeric || {}).some(Boolean) ||
      filters.search ||
      activeChartFilter;

    if (!hasFilters) return dashboard.charts;

    // Rebuild charts from filtered data
    return dashboard.charts.map((chart) => {
      const sourceCols = chart.source_columns || [];
      if (sourceCols.length < 1) return chart;

      const chartType = chart.chart_type;
      const data = chart.plotly_data || [];

      // For pie charts: recount categories
      if (chartType === 'pie' && sourceCols.length >= 1) {
        const col = sourceCols[0];
        const counts = {};
        for (const row of filteredRows) {
          const val = String(row[col] || '').trim();
          if (val && !['none', 'null', 'nan', ''].includes(val.toLowerCase())) {
            counts[val] = (counts[val] || 0) + 1;
          }
        }
        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
        if (sorted.length > 0 && data[0]) {
          return {
            ...chart,
            plotly_data: [
              { ...data[0], labels: sorted.map((s) => s[0]), values: sorted.map((s) => s[1]) },
            ],
          };
        }
      }

      // For bar charts: re-aggregate
      if ((chartType === 'bar' || !chartType) && sourceCols.length >= 2) {
        const [catCol, numCol] = sourceCols;
        const groups = {};
        for (const row of filteredRows) {
          const cat = String(row[catCol] || '').trim();
          if (!cat || ['none', 'null', 'nan', ''].includes(cat.toLowerCase())) continue;
          const n = toNum(row[numCol]);
          if (n != null) {
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push(n);
          }
        }
        const sorted = Object.entries(groups)
          .map(([k, v]) => [k, v.reduce((a, b) => a + b, 0)])
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10);

        if (sorted.length > 0 && data[0]) {
          const isHorizontal = data[0].orientation === 'h';
          const update = isHorizontal
            ? { y: sorted.map((s) => s[0]), x: sorted.map((s) => Math.round(s[1] * 100) / 100) }
            : { x: sorted.map((s) => s[0]), y: sorted.map((s) => Math.round(s[1] * 100) / 100) };
          return {
            ...chart,
            plotly_data: [{ ...data[0], ...update }],
          };
        }
      }

      // For line/scatter with time: re-aggregate
      if ((chartType === 'line' || chartType === 'scatter') && sourceCols.length >= 2) {
        const [xCol, yCol] = sourceCols;
        if (data[0]?.mode?.includes('lines')) {
          const ts = {};
          for (const row of filteredRows) {
            const xv = String(row[xCol] || '').trim();
            if (!xv) continue;
            const n = toNum(row[yCol]);
            if (n != null) ts[xv] = (ts[xv] || 0) + n;
          }
          const sorted = Object.entries(ts).sort();
          if (sorted.length > 0 && data[0]) {
            return {
              ...chart,
              plotly_data: [
                {
                  ...data[0],
                  x: sorted.map((s) => s[0]),
                  y: sorted.map((s) => Math.round(s[1] * 100) / 100),
                },
              ],
            };
          }
        }
      }

      return chart;
    });
  }, [dashboard, filteredRows, filters, activeChartFilter]);

  const handleChartFilter = useCallback((filter) => {
    setActiveChartFilter(filter);
  }, []);

  if (!dashboard) return null;

  const { dashboard_title } = dashboard;
  const chartCount = filteredCharts.length;

  // Decide chart grid: for 1-2 charts use full width, 3+ use 2-col, 5+ use mixed
  const getChartGridClass = () => {
    if (chartCount <= 2) return 'grid grid-cols-1 lg:grid-cols-2 gap-4';
    return 'grid grid-cols-1 md:grid-cols-2 gap-4';
  };

  // Make first chart or odd chart larger when we have odd count > 2
  const getChartSpan = (index) => {
    if (chartCount === 3 && index === 0) return 'md:col-span-2';
    if (chartCount === 5 && index === 0) return 'md:col-span-2';
    return '';
  };

  const getChartHeight = (index) => {
    const span = getChartSpan(index);
    if (span) return 'min-h-[350px]';
    return 'min-h-[320px]';
  };

  // Active filter indicator
  const activeFilterCount =
    Object.values(filters.categorical || {}).filter(Boolean).length +
    Object.values(filters.numeric || {}).filter(Boolean).length +
    (filters.search ? 1 : 0) +
    (activeChartFilter ? 1 : 0);

  return (
    <div className="flex h-[calc(100vh-64px)]">
      {/* Main dashboard area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-5">
          {/* Dashboard Title + filter badge */}
          <div className="flex items-center justify-between mb-4">
            <motion.h2
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white"
            >
              {dashboard_title || 'Your Dashboard'}
            </motion.h2>
            {activeFilterCount > 0 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-2"
              >
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''} active
                </span>
                {activeChartFilter && (
                  <button
                    onClick={() => setActiveChartFilter(null)}
                    className="text-xs text-primary-600 dark:text-primary-400 font-medium
                               hover:text-primary-700 dark:hover:text-primary-300 flex items-center gap-1"
                  >
                    <X className="w-3 h-3" />
                    Clear chart filter
                  </button>
                )}
              </motion.div>
            )}
          </div>

          {/* Filter Bar */}
          <FilterBar
            parsedData={parsedData}
            columnMeta={columnMeta}
            filters={filters}
            onFilterChange={setFilters}
          />

          {/* KPI Cards — uniform row */}
          {filteredKPIs.length > 0 && (
            <div
              className="grid gap-3 mb-5"
              style={{
                gridTemplateColumns: `repeat(${Math.min(filteredKPIs.length, 5)}, minmax(0, 1fr))`,
              }}
            >
              {filteredKPIs.map((kpi, i) => (
                <KPICard key={kpi.id || i} kpi={kpi} index={i} />
              ))}
            </div>
          )}

          {/* Charts — properly distributed grid */}
          {filteredCharts.length > 0 && (
            <div className={getChartGridClass()}>
              {filteredCharts.map((chart, i) => (
                <div key={chart.id || i} className={`${getChartSpan(i)} ${getChartHeight(i)}`}>
                  <ChartPanel
                    chart={chart}
                    index={i}
                    activeFilter={activeChartFilter}
                    onFilterChange={handleChartFilter}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Filtered rows count */}
          {parsedData && (
            <div className="mt-4 text-xs text-slate-400 text-center">
              Showing {filteredRows.length.toLocaleString()} of {parsedData.totalRows.toLocaleString()} rows
              {activeFilterCount > 0 && ' (filtered)'}
            </div>
          )}
        </div>
      </div>

      {/* Chat Panel — Desktop */}
      {isChatOpen && (
        <div className="hidden lg:block w-[380px] xl:w-[420px] border-l bg-white dark:bg-slate-900 shrink-0">
          <ChatPanel />
        </div>
      )}

      {/* Chat Panel — Mobile overlay */}
      {isChatOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-white dark:bg-slate-900">
          <ChatPanel />
        </div>
      )}
    </div>
  );
}
