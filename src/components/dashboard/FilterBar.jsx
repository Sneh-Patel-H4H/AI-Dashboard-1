import { useState, useMemo, useRef, useEffect } from 'react';
import { Search, X, SlidersHorizontal, ChevronDown, Calendar } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

/* ── Dropdown ───────────────────────────────────────────── */
function Dropdown({ label, options, value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const displayLabel = value || `All ${label}`;

  return (
    <div ref={ref} className="relative" style={{ zIndex: open ? 100 : 1 }}>
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border
                   bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200
                   hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors
                   min-w-[130px] max-w-[200px]
                   ${value ? 'border-primary-400 dark:border-primary-500 ring-1 ring-primary-200 dark:ring-primary-800' : ''}`}
      >
        <span className="truncate flex-1 text-left">{displayLabel}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full mt-1 left-0 w-56 max-h-64 overflow-y-auto
                       bg-white dark:bg-slate-800 border rounded-lg shadow-xl"
            style={{ zIndex: 9999 }}
          >
            <button
              onClick={() => { onChange(null); setOpen(false); }}
              className={`w-full text-left text-xs px-3 py-2.5 hover:bg-slate-100 dark:hover:bg-slate-700
                         ${!value ? 'text-primary-600 font-semibold bg-primary-50 dark:bg-primary-950/20' : 'text-slate-600 dark:text-slate-300'}`}
            >
              All {label}
            </button>
            {options.map((opt) => (
              <button
                key={opt}
                onClick={() => { onChange(opt); setOpen(false); }}
                className={`w-full text-left text-xs px-3 py-2.5 hover:bg-slate-100 dark:hover:bg-slate-700 truncate
                           ${value === opt ? 'text-primary-600 font-semibold bg-primary-50 dark:bg-primary-950/20' : 'text-slate-600 dark:text-slate-300'}`}
              >
                {opt}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Number Range Input (clean design, no native range slider) ── */
function NumberRange({ label, min, max, value, onChange }) {
  const formatDisplay = (v) => {
    if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
    if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
    return v % 1 === 0 ? String(v) : v.toFixed(1);
  };

  if (!isFinite(min) || !isFinite(max) || min === max) return null;

  const isFiltered = value[0] > min || value[1] < max;
  const pctLeft = ((value[0] - min) / (max - min)) * 100;
  const pctRight = ((value[1] - min) / (max - min)) * 100;

  return (
    <div
      className={`flex items-center gap-3 px-3 py-2 rounded-lg border bg-white dark:bg-slate-800
                  ${isFiltered ? 'border-primary-400 dark:border-primary-500' : ''}`}
    >
      <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide whitespace-nowrap">
        {label}
      </span>

      {/* Min input */}
      <input
        type="number"
        value={Math.round(value[0])}
        min={min}
        max={value[1]}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (!isNaN(v) && v <= value[1]) onChange([v, value[1]]);
        }}
        className="w-[70px] text-[11px] font-medium text-center rounded border
                   bg-slate-50 dark:bg-slate-700 text-slate-700 dark:text-slate-200
                   px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-primary-500
                   [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />

      {/* Visual bar */}
      <div className="flex-1 min-w-[60px] h-2 bg-slate-200 dark:bg-slate-600 rounded-full relative">
        <div
          className="absolute h-full bg-primary-500 rounded-full"
          style={{ left: `${pctLeft}%`, right: `${100 - pctRight}%` }}
        />
      </div>

      {/* Max input */}
      <input
        type="number"
        value={Math.round(value[1])}
        min={value[0]}
        max={max}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (!isNaN(v) && v >= value[0]) onChange([value[0], v]);
        }}
        className="w-[70px] text-[11px] font-medium text-center rounded border
                   bg-slate-50 dark:bg-slate-700 text-slate-700 dark:text-slate-200
                   px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-primary-500
                   [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
    </div>
  );
}

/* ── Date Range Filter ──────────────────────────────────── */
function DateFilter({ label, minDate, maxDate, value, onChange }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-white dark:bg-slate-800 min-w-[260px]">
      <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
      <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide whitespace-nowrap">
        {label}
      </span>
      <input
        type="date"
        value={value[0] || minDate}
        min={minDate}
        max={value[1] || maxDate}
        onChange={(e) => onChange([e.target.value, value[1] || maxDate])}
        className="text-[11px] bg-transparent text-slate-700 dark:text-slate-200 border-0 p-0
                   focus:outline-none focus:ring-0 w-[105px]"
      />
      <span className="text-[10px] text-slate-400">to</span>
      <input
        type="date"
        value={value[1] || maxDate}
        min={value[0] || minDate}
        max={maxDate}
        onChange={(e) => onChange([value[0] || minDate, e.target.value])}
        className="text-[11px] bg-transparent text-slate-700 dark:text-slate-200 border-0 p-0
                   focus:outline-none focus:ring-0 w-[105px]"
      />
    </div>
  );
}

/* ── FilterBar ──────────────────────────────────────────── */
export default function FilterBar({ parsedData, columnMeta, filters, onFilterChange }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [expanded, setExpanded] = useState(true);

  const { categoricalFilters, numericFilters, dateFilters } = useMemo(() => {
    if (!parsedData || !columnMeta)
      return { categoricalFilters: [], numericFilters: [], dateFilters: [] };

    const categorical = [];
    const numeric = [];
    const dates = [];

    for (const [col, meta] of Object.entries(columnMeta)) {
      if (meta.type === 'string' && meta.uniqueCount > 1 && meta.uniqueCount <= 30) {
        const uniqueVals = new Set();
        for (const row of parsedData.rows) {
          const v = row[col];
          if (v != null && String(v).trim() && !['none', 'null', 'nan', ''].includes(String(v).toLowerCase().trim())) {
            uniqueVals.add(String(v).trim());
          }
          if (uniqueVals.size >= 30) break;
        }
        if (uniqueVals.size > 1) {
          categorical.push({ column: col, options: [...uniqueVals].sort() });
        }
      } else if (meta.type === 'numeric' && meta.min != null && meta.max != null && meta.min !== meta.max) {
        numeric.push({ column: col, min: meta.min, max: meta.max });
      } else if (meta.type === 'date') {
        let minD = null;
        let maxD = null;
        for (const row of parsedData.rows) {
          const v = row[col];
          if (!v) continue;
          const d = new Date(String(v).trim());
          if (isNaN(d.getTime())) continue;
          const iso = d.toISOString().slice(0, 10);
          if (!minD || iso < minD) minD = iso;
          if (!maxD || iso > maxD) maxD = iso;
        }
        if (minD && maxD && minD !== maxD) {
          dates.push({ column: col, minDate: minD, maxDate: maxD });
        }
      }
    }

    return {
      categoricalFilters: categorical.slice(0, 4),
      numericFilters: numeric.slice(0, 2),
      dateFilters: dates.slice(0, 2),
    };
  }, [parsedData, columnMeta]);

  const hasAnyFilter =
    searchTerm ||
    Object.values(filters.categorical || {}).some(Boolean) ||
    Object.values(filters.numeric || {}).some(Boolean) ||
    Object.values(filters.date || {}).some(Boolean);

  const clearAll = () => {
    setSearchTerm('');
    onFilterChange({ categorical: {}, numeric: {}, date: {}, search: '' });
  };

  const handleCategoricalChange = (col, val) => {
    onFilterChange({ ...filters, categorical: { ...(filters.categorical || {}), [col]: val } });
  };

  const handleNumericChange = (col, range) => {
    onFilterChange({ ...filters, numeric: { ...(filters.numeric || {}), [col]: range } });
  };

  const handleDateChange = (col, range) => {
    onFilterChange({ ...filters, date: { ...(filters.date || {}), [col]: range } });
  };

  const handleSearch = (val) => {
    setSearchTerm(val);
    onFilterChange({ ...filters, search: val });
  };

  if (categoricalFilters.length === 0 && numericFilters.length === 0 && dateFilters.length === 0)
    return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="card mb-4 relative"
      style={{ zIndex: 50 }}
    >
      <div className="flex items-center justify-between px-4 py-2.5">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400
                     uppercase tracking-wider hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Filters
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
        {hasAnyFilter && (
          <button onClick={clearAll} className="flex items-center gap-1 text-xs font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors">
            <X className="w-3 h-3" /> Clear all
          </button>
        )}
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-visible"
          >
            <div className="px-4 pb-3">
              {/* Row 1: Search + Category dropdowns */}
              <div className="flex flex-wrap items-center gap-2.5 mb-2.5">
                <div className="relative min-w-[180px] max-w-[220px]">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => handleSearch(e.target.value)}
                    placeholder="Search data..."
                    className="w-full pl-8 pr-8 py-2 text-xs rounded-lg border bg-white dark:bg-slate-800
                               text-slate-700 dark:text-slate-200 placeholder-slate-400
                               focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                  {searchTerm && (
                    <button onClick={() => handleSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2">
                      <X className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" />
                    </button>
                  )}
                </div>
                {categoricalFilters.map((f) => (
                  <Dropdown key={f.column} label={f.column.replace(/_/g, ' ')} options={f.options} value={filters.categorical?.[f.column] || null} onChange={(val) => handleCategoricalChange(f.column, val)} />
                ))}
              </div>

              {/* Row 2: Date filters + Number ranges */}
              {(dateFilters.length > 0 || numericFilters.length > 0) && (
                <div className="flex flex-wrap items-center gap-2.5">
                  {dateFilters.map((f) => (
                    <DateFilter key={f.column} label={f.column.replace(/_/g, ' ')} minDate={f.minDate} maxDate={f.maxDate} value={filters.date?.[f.column] || [f.minDate, f.maxDate]} onChange={(range) => handleDateChange(f.column, range)} />
                  ))}
                  {numericFilters.map((f) => (
                    <NumberRange key={f.column} label={f.column.replace(/_/g, ' ')} min={f.min} max={f.max} value={filters.numeric?.[f.column] || [f.min, f.max]} onChange={(range) => handleNumericChange(f.column, range)} />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
