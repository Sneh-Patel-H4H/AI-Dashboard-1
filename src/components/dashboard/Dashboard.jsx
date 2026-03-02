import { useState, useMemo, useCallback, useRef } from 'react';
import { X, Download } from 'lucide-react';
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

// Helper: parse a date string to YYYY-MM-DD for comparison
function toDateStr(val) {
  if (!val) return null;
  const d = new Date(String(val));
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export default function Dashboard() {
  const { dashboard, isChatOpen, parsedData, chatMessages } = useStore();
  const [filters, setFilters] = useState({
    categorical: {},
    numeric: {},
    date: {},
    search: '',
  });
  const [activeChartFilter, setActiveChartFilter] = useState(null);
  const [isExporting, setIsExporting] = useState(false);
  const dashboardRef = useRef(null);
  const chatRef = useRef(null);

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

    // Apply date range filters
    for (const [col, range] of Object.entries(filters.date || {})) {
      if (range && range.length === 2 && range[0] && range[1]) {
        rows = rows.filter((r) => {
          const d = toDateStr(r[col]);
          if (!d) return true;
          return d >= range[0] && d <= range[1];
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

    const hasFilters =
      Object.values(filters.categorical || {}).some(Boolean) ||
      Object.values(filters.numeric || {}).some(Boolean) ||
      Object.values(filters.date || {}).some(Boolean) ||
      filters.search ||
      activeChartFilter;

    if (!hasFilters) return original;

    return original.map((kpi) => {
      const nums = [];
      for (const row of filteredRows) {
        for (const key of Object.keys(row)) {
          if (kpi.label?.toLowerCase().includes(key.toLowerCase())) {
            const n = toNum(row[key]);
            if (n != null) nums.push(n);
            break;
          }
        }
      }

      if (nums.length === 0) return kpi;

      const value =
        kpi.format === 'currency' ||
        kpi.label?.toLowerCase().includes('total')
          ? nums.reduce((a, b) => a + b, 0)
          : nums.reduce((a, b) => a + b, 0) / nums.length;

      let formatted;
      if (kpi.format === 'currency') {
        formatted = `$${value.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`;
      } else if (kpi.format === 'percent') {
        formatted = `${value.toFixed(1)}%`;
      } else {
        formatted =
          Math.abs(value) >= 100
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
      Object.values(filters.date || {}).some(Boolean) ||
      filters.search ||
      activeChartFilter;

    if (!hasFilters) return dashboard.charts;

    return dashboard.charts.map((chart) => {
      const sourceCols = chart.source_columns || [];
      if (sourceCols.length < 1) return chart;

      const chartType = chart.chart_type;
      const data = chart.plotly_data || [];

      if (chartType === 'pie' && sourceCols.length >= 1) {
        const col = sourceCols[0];
        const counts = {};
        for (const row of filteredRows) {
          const val = String(row[col] || '').trim();
          if (
            val &&
            !['none', 'null', 'nan', ''].includes(val.toLowerCase())
          ) {
            counts[val] = (counts[val] || 0) + 1;
          }
        }
        const sorted = Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8);
        if (sorted.length > 0 && data[0]) {
          return {
            ...chart,
            plotly_data: [
              {
                ...data[0],
                labels: sorted.map((s) => s[0]),
                values: sorted.map((s) => s[1]),
              },
            ],
          };
        }
      }

      if ((chartType === 'bar' || !chartType) && sourceCols.length >= 2) {
        const [catCol, numCol] = sourceCols;
        const groups = {};
        for (const row of filteredRows) {
          const cat = String(row[catCol] || '').trim();
          if (
            !cat ||
            ['none', 'null', 'nan', ''].includes(cat.toLowerCase())
          )
            continue;
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
            ? {
                y: sorted.map((s) => s[0]),
                x: sorted.map(
                  (s) => Math.round(s[1] * 100) / 100
                ),
              }
            : {
                x: sorted.map((s) => s[0]),
                y: sorted.map(
                  (s) => Math.round(s[1] * 100) / 100
                ),
              };
          return {
            ...chart,
            plotly_data: [{ ...data[0], ...update }],
          };
        }
      }

      if (
        (chartType === 'line' || chartType === 'scatter') &&
        sourceCols.length >= 2
      ) {
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
                  y: sorted.map(
                    (s) => Math.round(s[1] * 100) / 100
                  ),
                },
              ],
            };
          }
        }
      }

      return chart;
    });
  }, [dashboard, filteredRows, filters, activeChartFilter]);

  // PDF Export — captures full scrollable content
  const exportPDF = useCallback(
    async (section = 'dashboard') => {
      setIsExporting(true);
      try {
        const html2canvas = (await import('html2canvas')).default;
        const { jsPDF } = await import('jspdf');

        let target;
        let scrollParent;

        if (section === 'chat') {
          // Find the chat scroll container (the messages div)
          const chatWrapper = chatRef.current;
          if (!chatWrapper) return;
          target = chatWrapper;
          scrollParent = chatWrapper.querySelector('.overflow-y-auto') || chatWrapper;
        } else {
          target = dashboardRef.current;
          // The scroll parent is the flex-1 overflow-y-auto div wrapping dashboardRef
          scrollParent = dashboardRef.current?.parentElement;
        }

        if (!target) return;

        // Temporarily expand the scroll container to show full content
        const origOverflow = scrollParent ? scrollParent.style.overflow : '';
        const origHeight = scrollParent ? scrollParent.style.height : '';
        const origMaxHeight = scrollParent ? scrollParent.style.maxHeight : '';
        if (scrollParent) {
          scrollParent.style.overflow = 'visible';
          scrollParent.style.height = 'auto';
          scrollParent.style.maxHeight = 'none';
        }

        // Wait for reflow
        await new Promise((r) => setTimeout(r, 300));

        const isDark = document.documentElement.classList.contains('dark');

        const canvas = await html2canvas(target, {
          scale: 1.5,
          useCORS: true,
          logging: false,
          backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
          width: target.scrollWidth,
          height: target.scrollHeight,
          scrollX: 0,
          scrollY: 0,
          windowWidth: target.scrollWidth,
          windowHeight: target.scrollHeight,
        });

        // Restore scroll container
        if (scrollParent) {
          scrollParent.style.overflow = origOverflow;
          scrollParent.style.height = origHeight;
          scrollParent.style.maxHeight = origMaxHeight;
        }

        const imgWidth = canvas.width;
        const imgHeight = canvas.height;

        // A4 dimensions
        const pdfW = 595.28;
        const pdfH = 841.89;
        const margin = 24;
        const headerHeight = 20;
        const contentW = pdfW - margin * 2;
        const scaledH = (imgHeight * contentW) / imgWidth;

        const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
        const usableH = pdfH - margin * 2 - headerHeight;

        // Header
        const titleText = section === 'chat' ? 'Chat Export' : 'Dashboard Export';
        pdf.setFontSize(9);
        pdf.setTextColor(130);
        pdf.text(`InsightBoard  —  ${titleText}  —  ${new Date().toLocaleDateString()}`, margin, margin + 8);

        // Paginate the canvas image
        let srcY = 0;
        let pageNum = 0;
        while (srcY < imgHeight) {
          if (pageNum > 0) pdf.addPage();

          const srcH = Math.min((usableH / scaledH) * imgHeight, imgHeight - srcY);
          const drawH = (srcH / imgHeight) * scaledH;

          const pageCanvas = document.createElement('canvas');
          pageCanvas.width = imgWidth;
          pageCanvas.height = Math.ceil(srcH);
          pageCanvas.getContext('2d').drawImage(
            canvas, 0, Math.floor(srcY), imgWidth, Math.ceil(srcH),
            0, 0, imgWidth, Math.ceil(srcH)
          );

          pdf.addImage(
            pageCanvas.toDataURL('image/png'),
            'PNG',
            margin,
            margin + headerHeight,
            contentW,
            drawH
          );

          srcY += srcH;
          pageNum++;
        }

        pdf.save(`insightboard-${section}-${new Date().toISOString().slice(0, 10)}.pdf`);
      } catch (err) {
        console.error('PDF export failed:', err);
      } finally {
        setIsExporting(false);
      }
    },
    []
  );

  const handleChartFilter = useCallback((filter) => {
    setActiveChartFilter(filter);
  }, []);

  if (!dashboard) return null;

  const { dashboard_title } = dashboard;
  const chartCount = filteredCharts.length;

  const getChartGridClass = () => {
    if (chartCount <= 2) return 'grid grid-cols-1 lg:grid-cols-2 gap-4';
    return 'grid grid-cols-1 md:grid-cols-2 gap-4';
  };

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

  const activeFilterCount =
    Object.values(filters.categorical || {}).filter(Boolean).length +
    Object.values(filters.numeric || {}).filter(Boolean).length +
    Object.values(filters.date || {}).filter(Boolean).length +
    (filters.search ? 1 : 0) +
    (activeChartFilter ? 1 : 0);

  return (
    <div className="flex h-[calc(100vh-64px)]">
      {/* Main dashboard area */}
      <div className="flex-1 overflow-y-auto">
        <div
          ref={dashboardRef}
          className="max-w-[1600px] mx-auto px-4 sm:px-6 py-5"
        >
          {/* Dashboard Title + actions */}
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <motion.h2
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white"
            >
              {dashboard_title || 'Your Dashboard'}
            </motion.h2>
            <div className="flex items-center gap-3 flex-wrap">
              {activeFilterCount > 0 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex items-center gap-2"
                >
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {activeFilterCount} filter
                    {activeFilterCount > 1 ? 's' : ''} active
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

              {/* Export PDF buttons */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => exportPDF('dashboard')}
                  disabled={isExporting}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
                             bg-primary-600 hover:bg-primary-700 text-white transition-colors
                             disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Download className="w-3.5 h-3.5" />
                  {isExporting ? 'Exporting...' : 'Export PDF'}
                </button>
                {isChatOpen && chatMessages.length > 0 && (
                  <button
                    onClick={() => exportPDF('chat')}
                    disabled={isExporting}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg
                               border bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200
                               hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors
                               disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Chat PDF
                  </button>
                )}
              </div>
            </div>
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
                <div
                  key={chart.id || i}
                  className={`${getChartSpan(i)} ${getChartHeight(i)}`}
                >
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
              Showing {filteredRows.length.toLocaleString()} of{' '}
              {parsedData.totalRows.toLocaleString()} rows
              {activeFilterCount > 0 && ' (filtered)'}
            </div>
          )}
        </div>
      </div>

      {/* Chat Panel — Desktop */}
      {isChatOpen && (
        <div
          ref={chatRef}
          className="hidden lg:block w-[380px] xl:w-[420px] border-l bg-white dark:bg-slate-900 shrink-0"
        >
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
