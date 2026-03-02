import { useState } from 'react';
import { Check, X, Plus, GripVertical } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import useStore from '../../store/useStore';

export default function KPISelector() {
  const { confirmedKPIs, setConfirmedKPIs, parsedData } = useStore();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newColumn, setNewColumn] = useState('');
  const [newAgg, setNewAgg] = useState('sum');
  const [newFormat, setNewFormat] = useState('number');

  const toggleKPI = (id) => {
    setConfirmedKPIs(
      confirmedKPIs.map((k) =>
        k.id === id ? { ...k, _disabled: !k._disabled } : k
      )
    );
  };

  const removeKPI = (id) => {
    setConfirmedKPIs(confirmedKPIs.filter((k) => k.id !== id));
  };

  const addCustomKPI = () => {
    if (!newLabel || !newColumn) return;
    const id = `custom_${Date.now()}`;
    setConfirmedKPIs([
      ...confirmedKPIs,
      {
        id,
        label: newLabel,
        column: newColumn,
        aggregation: newAgg,
        format: newFormat,
        priority: confirmedKPIs.length + 1,
      },
    ]);
    setNewLabel('');
    setNewColumn('');
    setNewAgg('sum');
    setNewFormat('number');
    setShowAddForm(false);
  };

  const numericColumns = parsedData
    ? parsedData.headers.filter(
        (h) => parsedData.columnMeta[h]?.type === 'numeric'
      )
    : [];

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
          Proposed KPIs
        </h3>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center gap-1 text-xs font-medium text-primary-600 dark:text-primary-400
                     hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Custom
        </button>
      </div>

      <AnimatePresence>
        {showAddForm && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="card p-4 mb-3 space-y-3">
              <input
                type="text"
                placeholder="KPI name (e.g. Average Order Value)"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                className="input text-sm"
              />
              <div className="grid grid-cols-3 gap-2">
                <select
                  value={newColumn}
                  onChange={(e) => setNewColumn(e.target.value)}
                  className="input text-sm"
                >
                  <option value="">Column</option>
                  {numericColumns.map((col) => (
                    <option key={col} value={col}>{col}</option>
                  ))}
                </select>
                <select
                  value={newAgg}
                  onChange={(e) => setNewAgg(e.target.value)}
                  className="input text-sm"
                >
                  <option value="sum">Sum</option>
                  <option value="mean">Average</option>
                  <option value="count">Count</option>
                  <option value="max">Maximum</option>
                  <option value="min">Minimum</option>
                </select>
                <select
                  value={newFormat}
                  onChange={(e) => setNewFormat(e.target.value)}
                  className="input text-sm"
                >
                  <option value="number">Number</option>
                  <option value="currency">Currency</option>
                  <option value="percent">Percent</option>
                </select>
              </div>
              <div className="flex gap-2">
                <button onClick={addCustomKPI} className="btn-primary text-sm flex-1">
                  Add KPI
                </button>
                <button onClick={() => setShowAddForm(false)} className="btn-secondary text-sm">
                  Cancel
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-2">
        {confirmedKPIs.map((kpi) => (
          <motion.div
            key={kpi.id}
            layout
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${
              kpi._disabled
                ? 'opacity-50 bg-slate-50 dark:bg-slate-800/50'
                : 'bg-white dark:bg-slate-800'
            }`}
          >
            <button
              onClick={() => toggleKPI(kpi.id)}
              className={`w-5 h-5 rounded flex items-center justify-center shrink-0 transition-colors ${
                kpi._disabled
                  ? 'border-2 border-slate-300 dark:border-slate-600'
                  : 'bg-primary-600 text-white'
              }`}
            >
              {!kpi._disabled && <Check className="w-3.5 h-3.5" />}
            </button>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                {kpi.label}
              </p>
              <p className="text-xs text-slate-400 truncate">
                {kpi.aggregation} of {kpi.column} &middot; {kpi.format}
              </p>
            </div>

            <button
              onClick={() => removeKPI(kpi.id)}
              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors shrink-0"
            >
              <X className="w-3.5 h-3.5 text-slate-400" />
            </button>
          </motion.div>
        ))}
      </div>

      {confirmedKPIs.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-4">
          No KPIs selected. Add at least one to build the dashboard.
        </p>
      )}
    </div>
  );
}
