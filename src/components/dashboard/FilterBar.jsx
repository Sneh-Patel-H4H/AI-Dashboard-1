import { useState, useMemo, useRef, useEffect } from 'react';
import { Search, X, SlidersHorizontal, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

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
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border
                   bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200
                   hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors
                   min-w-[130px] max-w-[200px]"
      >
        <span className="truncate flex-1 text-left">{displayLabel}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 shrink-0 text-slate-400 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 top-full mt-1 left-0 w-52 max-h-60 overflow-y-auto
                       bg-white dark:bg-slate-800 border rounded-lg shadow-lg"
          >
            <button
              onClick={() => { onChange(null); setOpen(false); }}
              className={`w-full text-left text-xs px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700
                         ${!value ? 'text-primary-600 font-semibold bg-primary-50 dark:bg-primary-950/20' : 'text-slate-600 dark:text-slate-300'}`}
            >
              All {label}
            </button>
            {options.map((opt) => (
              <button
                key={opt}
                onClick={() => { onChange(opt); setOpen(false); }}
                className={`w-full text-left text-xs px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700 truncate
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

function RangeSlider({ label, min, max, value, onChange }) {
  const [localVal, setLocalVal] = useState(value);
  const rangeWidth = max - min;

  useEffect(() => {
    setLocalVal(value);
  }, [value]);

  if (rangeWidth <= 0 || !isFinite(min) || !isFinite(max)) return null;

  const handleMinChange = (e) => {
    const v = Number(e.target.value);
    const newVal = [Math.min(v, localVal[1]), localVal[1]];
    setLocalVal(newVal);
    onChange(newVal);
  };

  const handleMaxChange = (e) => {
    const v = Number(e.target.value);
    const newVal = [localVal[0], Math.max(v, localVal[0])];
    setLocalVal(newVal);
    onChange(newVal);
  };

  const formatVal = (v) => {
    if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
    if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
    return v % 1 === 0 ? String(v) : v.toFixed(1);
  };

  return (
    <div className="flex items-center gap-2 min-w-[180px]">
      <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide whitespace-nowrap">
        {label}
      </span>
      <div className="flex items-center gap-1.5 flex-1">
        <span className="text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">
          {formatVal(localVal[0])}
        </span>
        <div className="relative flex-1 h-5">
          <input
            type="range"
            min={min}
            max={max}
            step={(max - min) / 100}
            value={localVal[0]}
            onChange={handleMinChange}
            className="absolute inset-0 w-full appearance-none bg-transparent pointer-events-none
                       [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none
                       [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full
                       [&::-webkit-slider-thumb]:bg-primary-600 [&::-webkit-slider-thumb]:cursor-pointer
                       [&::-webkit-slider-thumb]:relative [&::-webkit-slider-thumb]:z-10"
          />
          <input
            type="range"
            min={min}
            max={max}
            step={(max - min) / 100}
            value={localVal[1]}
            onChange={handleMaxChange}
            className="absolute inset-0 w-full appearance-none bg-transparent pointer-events-none
                       [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none
                       [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full
                       [&::-webkit-slider-thumb]:bg-primary-600 [&::-webkit-slider-thumb]:cursor-pointer"
          />
          <div className="absolute top-1/2 -translate-y-1/2 h-1 w-full bg-slate-200 dark:bg-slate-600 rounded-full" />
          <div
            className="absolute top-1/2 -translate-y-1/2 h-1 bg-primary-500 rounded-full"
            style={{
              left: `${((localVal[0] - min) / rangeWidth) * 100}%`,
              right: `${100 - ((localVal[1] - min) / rangeWidth) * 100}%`,
            }}
          />
        </div>
        <span className="text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">
          {formatVal(localVal[1])}
        </span>
      </div>
    </div>
  );
}

export default function FilterBar({ parsedData, columnMeta, filters, onFilterChange }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [expanded, setExpanded] = useState(true);

  // Build filter options from data
  const { categoricalFilters, numericFilters } = useMemo(() => {
    if (!parsedData || !columnMeta) return { categoricalFilters: [], numericFilters: [] };

    const categorical = [];
    const numeric = [];

    for (const [col, meta] of Object.entries(columnMeta)) {
      if (
        meta.type === 'string' &&
        meta.uniqueCount > 1 &&
        meta.uniqueCount <= 30
      ) {
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
      }
    }

    // Limit filters shown
    return {
      categoricalFilters: categorical.slice(0, 4),
      numericFilters: numeric.slice(0, 2),
    };
  }, [parsedData, columnMeta]);

  const hasAnyFilter =
    searchTerm ||
    Object.values(filters.categorical || {}).some(Boolean) ||
    Object.values(filters.numeric || {}).some(
      (v) => v && (v[0] !== v[2] || v[1] !== v[3])
    );

  const clearAll = () => {
    setSearchTerm('');
    onFilterChange({ categorical: {}, numeric: {}, search: '' });
  };

  const handleCategoricalChange = (col, val) => {
    const newCat = { ...(filters.categorical || {}), [col]: val };
    onFilterChange({ ...filters, categorical: newCat });
  };

  const handleNumericChange = (col, range) => {
    const newNum = { ...(filters.numeric || {}), [col]: range };
    onFilterChange({ ...filters, numeric: newNum });
  };

  const handleSearch = (val) => {
    setSearchTerm(val);
    onFilterChange({ ...filters, search: val });
  };

  if (categoricalFilters.length === 0 && numericFilters.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="card mb-4"
    >
      <div className="flex items-center justify-between px-4 py-2.5">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400
                     uppercase tracking-wider hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Filters
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
          />
        </button>

        {hasAnyFilter && (
          <button
            onClick={clearAll}
            className="flex items-center gap-1 text-xs font-medium text-primary-600 dark:text-primary-400
                       hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
          >
            <X className="w-3 h-3" />
            Clear all
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
            className="overflow-hidden"
          >
            <div className="px-4 pb-3 flex flex-wrap items-center gap-3">
              {/* Search */}
              <div className="relative min-w-[180px] max-w-[240px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => handleSearch(e.target.value)}
                  placeholder="Search data..."
                  className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border bg-white dark:bg-slate-800
                             text-slate-700 dark:text-slate-200 placeholder-slate-400
                             focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
                {searchTerm && (
                  <button
                    onClick={() => handleSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2"
                  >
                    <X className="w-3 h-3 text-slate-400 hover:text-slate-600" />
                  </button>
                )}
              </div>

              {/* Categorical Dropdowns */}
              {categoricalFilters.map((f) => (
                <Dropdown
                  key={f.column}
                  label={f.column.replace(/_/g, ' ')}
                  options={f.options}
                  value={filters.categorical?.[f.column] || null}
                  onChange={(val) => handleCategoricalChange(f.column, val)}
                />
              ))}

              {/* Range Sliders */}
              {numericFilters.map((f) => (
                <RangeSlider
                  key={f.column}
                  label={f.column.replace(/_/g, ' ')}
                  min={f.min}
                  max={f.max}
                  value={filters.numeric?.[f.column] || [f.min, f.max]}
                  onChange={(range) => handleNumericChange(f.column, range)}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
