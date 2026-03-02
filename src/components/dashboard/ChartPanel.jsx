import { useMemo } from 'react';
import Plot from 'react-plotly.js';
import { motion } from 'framer-motion';
import { Download } from 'lucide-react';
import useStore from '../../store/useStore';

export default function ChartPanel({ chart, index }) {
  const { darkMode } = useStore();

  const layout = useMemo(() => {
    const base = chart.plotly_layout || {};
    return {
      ...base,
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(0,0,0,0)',
      font: {
        ...(base.font || {}),
        family: 'Inter, system-ui, sans-serif',
        color: darkMode ? '#CBD5E1' : '#334155',
      },
      margin: { t: 40, r: 20, b: 50, l: 60, ...(base.margin || {}) },
      autosize: true,
      xaxis: {
        ...(base.xaxis || {}),
        gridcolor: darkMode ? '#334155' : '#E2E8F0',
        zerolinecolor: darkMode ? '#475569' : '#CBD5E1',
      },
      yaxis: {
        ...(base.yaxis || {}),
        gridcolor: darkMode ? '#334155' : '#E2E8F0',
        zerolinecolor: darkMode ? '#475569' : '#CBD5E1',
      },
      legend: {
        ...(base.legend || {}),
        font: { color: darkMode ? '#CBD5E1' : '#334155' },
      },
    };
  }, [chart.plotly_layout, darkMode]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 + index * 0.08 }}
      className="card overflow-hidden"
    >
      <div className="p-4 pb-2">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white truncate">
          {chart.title}
        </h3>
        {chart.description && (
          <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">
            {chart.description}
          </p>
        )}
      </div>
      <div className="px-2 pb-2">
        <Plot
          data={chart.plotly_data || []}
          layout={layout}
          config={{
            responsive: true,
            displayModeBar: true,
            modeBarButtonsToRemove: ['lasso2d', 'select2d', 'autoScale2d'],
            displaylogo: false,
            toImageButtonOptions: {
              format: 'png',
              filename: chart.title?.replace(/\s+/g, '_') || 'chart',
              scale: 2,
            },
          }}
          useResizeHandler
          style={{ width: '100%', height: '320px' }}
        />
      </div>
    </motion.div>
  );
}
