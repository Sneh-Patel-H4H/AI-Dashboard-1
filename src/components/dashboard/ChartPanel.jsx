import { useMemo, useCallback } from 'react';
import Plot from 'react-plotly.js';
import { motion } from 'framer-motion';
import useStore from '../../store/useStore';

export default function ChartPanel({ chart, index, activeFilter, onFilterChange }) {
  const { darkMode } = useStore();

  const layout = useMemo(() => {
    const base = chart.plotly_layout || {};
    const baseTitle = base.title || {};
    return {
      ...base,
      title: {
        ...baseTitle,
        text: '', // We render title outside Plotly for cleaner control
      },
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(0,0,0,0)',
      font: {
        ...(base.font || {}),
        family: 'Inter, system-ui, sans-serif',
        size: 11,
        color: darkMode ? '#CBD5E1' : '#334155',
      },
      margin: { t: 10, r: 20, b: 60, l: 65, ...(base.margin || {}) },
      autosize: true,
      xaxis: {
        ...(base.xaxis || {}),
        gridcolor: darkMode ? '#334155' : '#E2E8F0',
        zerolinecolor: darkMode ? '#475569' : '#CBD5E1',
        tickfont: { size: 10, color: darkMode ? '#94A3B8' : '#64748B' },
        title: {
          ...(base.xaxis?.title || {}),
          font: { size: 11, color: darkMode ? '#94A3B8' : '#64748B' },
          standoff: 10,
        },
        automargin: true,
        tickangle: -30,
      },
      yaxis: {
        ...(base.yaxis || {}),
        gridcolor: darkMode ? '#334155' : '#E2E8F0',
        zerolinecolor: darkMode ? '#475569' : '#CBD5E1',
        tickfont: { size: 10, color: darkMode ? '#94A3B8' : '#64748B' },
        title: {
          ...(base.yaxis?.title || {}),
          font: { size: 11, color: darkMode ? '#94A3B8' : '#64748B' },
          standoff: 8,
        },
        automargin: true,
      },
      legend: {
        ...(base.legend || {}),
        font: { size: 10, color: darkMode ? '#CBD5E1' : '#334155' },
        orientation: 'h',
        y: -0.25,
        x: 0.5,
        xanchor: 'center',
      },
      hoverlabel: {
        font: { size: 12, family: 'Inter, system-ui, sans-serif' },
      },
    };
  }, [chart.plotly_layout, darkMode]);

  const handleClick = useCallback(
    (event) => {
      if (!onFilterChange) return;
      const point = event.points?.[0];
      if (!point) return;

      // Extract the clicked value for cross-filtering
      const clickedLabel = point.label || point.x;
      const sourceColumns = chart.source_columns || [];
      const chartType = chart.chart_type;

      if (clickedLabel && sourceColumns.length > 0) {
        const filterCol = sourceColumns[0];
        // Toggle filter: if same value clicked, clear it
        if (
          activeFilter?.column === filterCol &&
          activeFilter?.value === clickedLabel
        ) {
          onFilterChange(null);
        } else {
          onFilterChange({ column: filterCol, value: clickedLabel, chartId: chart.id });
        }
      }
    },
    [onFilterChange, chart, activeFilter]
  );

  // Apply cross-filter highlight via opacity
  const filteredData = useMemo(() => {
    const data = chart.plotly_data || [];
    if (!activeFilter || activeFilter.chartId === chart.id) return data;

    // No data-level filtering needed — opacity handled by Dashboard's row filtering
    return data;
  }, [chart, activeFilter]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 + index * 0.08 }}
      className={`card overflow-hidden flex flex-col h-full ${
        activeFilter && activeFilter.chartId === chart.id
          ? 'ring-2 ring-primary-500 ring-offset-1 dark:ring-offset-slate-900'
          : ''
      }`}
    >
      <div className="px-4 pt-3 pb-1">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white leading-tight">
          {chart.title}
        </h3>
        {chart.description && (
          <p className="text-[11px] text-slate-400 mt-0.5 leading-snug line-clamp-2">
            {chart.description}
          </p>
        )}
      </div>
      <div className="flex-1 px-1 pb-1 min-h-0">
        <Plot
          data={filteredData}
          layout={layout}
          config={{
            responsive: true,
            displayModeBar: 'hover',
            modeBarButtonsToRemove: [
              'lasso2d',
              'select2d',
              'autoScale2d',
              'zoomIn2d',
              'zoomOut2d',
            ],
            displaylogo: false,
            toImageButtonOptions: {
              format: 'png',
              filename: chart.title?.replace(/\s+/g, '_') || 'chart',
              scale: 2,
            },
          }}
          useResizeHandler
          style={{ width: '100%', height: '100%', minHeight: '280px' }}
          onClick={handleClick}
        />
      </div>
    </motion.div>
  );
}
