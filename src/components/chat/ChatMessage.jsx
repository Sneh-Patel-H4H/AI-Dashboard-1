import { useMemo, useState } from 'react';
import Plot from 'react-plotly.js';
import { Download, Copy, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import useStore from '../../store/useStore';

function TextBlock({ content }) {
  return (
    <div className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
      {content}
    </div>
  );
}

function ChartBlock({ spec }) {
  const { darkMode } = useStore();

  const layout = useMemo(() => {
    const base = spec.plotly_layout || {};
    return {
      ...base,
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(0,0,0,0)',
      font: {
        ...(base.font || {}),
        family: 'Inter, system-ui, sans-serif',
        size: 11,
        color: darkMode ? '#CBD5E1' : '#334155',
      },
      margin: { t: 30, r: 10, b: 40, l: 50, ...(base.margin || {}) },
      autosize: true,
      xaxis: {
        ...(base.xaxis || {}),
        gridcolor: darkMode ? '#334155' : '#E2E8F0',
      },
      yaxis: {
        ...(base.yaxis || {}),
        gridcolor: darkMode ? '#334155' : '#E2E8F0',
      },
    };
  }, [spec.plotly_layout, darkMode]);

  return (
    <div className="rounded-lg border bg-slate-50 dark:bg-slate-800/50 overflow-hidden my-2">
      {spec.title && (
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 px-3 pt-2">
          {spec.title}
        </p>
      )}
      <Plot
        data={spec.plotly_data || []}
        layout={layout}
        config={{
          responsive: true,
          displayModeBar: false,
          displaylogo: false,
        }}
        useResizeHandler
        style={{ width: '100%', height: '240px' }}
      />
    </div>
  );
}

function TableBlock({ data }) {
  const [page, setPage] = useState(0);
  const [copied, setCopied] = useState(false);
  const pageSize = 10;

  if (!data?.headers || !data?.rows) return null;

  const totalPages = Math.ceil(data.rows.length / pageSize);
  const visibleRows = data.rows.slice(page * pageSize, (page + 1) * pageSize);

  const copyAsCSV = () => {
    const csv = [
      data.headers.join(','),
      ...data.rows.map((row) => row.map((c) => `"${c}"`).join(',')),
    ].join('\n');
    navigator.clipboard.writeText(csv);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-lg border overflow-hidden my-2">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800">
              {data.headers.map((h, i) => (
                <th
                  key={i}
                  className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, ri) => (
              <tr
                key={ri}
                className="border-t hover:bg-slate-50 dark:hover:bg-slate-800/50"
              >
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    className="px-3 py-2 text-slate-700 dark:text-slate-200 whitespace-nowrap"
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-800 border-t">
        <button
          onClick={copyAsCSV}
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copied' : 'Copy CSV'}
        </button>

        {totalPages > 1 && (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="disabled:opacity-30"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span>{page + 1} / {totalPages}</span>
            <button
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              className="disabled:opacity-30"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ChatMessage({ message }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div
        className={`max-w-[90%] ${
          isUser
            ? 'bg-primary-600 text-white rounded-2xl rounded-br-md px-4 py-2.5'
            : 'space-y-1'
        }`}
      >
        {isUser ? (
          <p className="text-sm">{message.content}</p>
        ) : (
          <>
            {message.items?.map((item, i) => {
              if (item.type === 'text' && item.content) {
                return <TextBlock key={i} content={item.content} />;
              }
              if (item.type === 'chart' && item.chart_spec) {
                return <ChartBlock key={i} spec={item.chart_spec} />;
              }
              if (item.type === 'table' && item.table_data) {
                return <TableBlock key={i} data={item.table_data} />;
              }
              return null;
            })}
          </>
        )}
      </div>
    </div>
  );
}
