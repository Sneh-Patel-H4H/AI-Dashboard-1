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
            className="absolute top-full mt-1 left-0 w-56 max-h-64 overflow-y-auto
                       bg-white dark:bg-slate-800 border rounded-lg shadow-xl"
            style={{ zIndex: 9999 }}
          >
            <button
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              className={`w-full text-left text-xs px-3 py-2.5 hover:bg-slate-100 dark:hover:bg-slate-700
                         ${
                           !value
                             ? 'text-primary-600 font-semibold bg-primary-50 dark:bg-primary-950/20'
                             : 'text-slate-600 dark:text-slate-300'
                         }`}
            >
              All {label}
            </button>
            {options.map((opt) => (
              <button
                key={opt}
                onClick={() => {
                  onChange(opt);
                  setOpen(false);
                }}
                className={`w-full text-left text-xs px-3 py-2.5 hover:bg-slate-100 dark:hover:bg-slate-700 truncate
                           ${
                             value === opt
                               ? 'text-primary-600 font-semibold bg-primary-50 dark:bg-primary-950/20'
                               : 'text-slate-600 dark:text-slate-300'
                           }`}
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

/* ── Range Slider (clean single-thumb design) ────────────── */
function RangeSlider({ label, min, max, value, onChange }) {
  const [localMin, setLocalMin] = useState(value[0]);
  const [localMax, setLocalMax] = useState(value[1]);
  const rangeWidth = max - min;

  useEffect(() => {
    setLocalMin(value[0]);
    setLocalMax(value[1]);
  }, [value]);

  if (rangeWidth <= 0 || !isFinite(min) || !isFinite(max)) return null;

  const commitChange = (newMin, newMax) => {
    onChange([newMin, newMax]);
  };

  const formatVal = (v) => {
    if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
    if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
    return v % 1 === 0 ? String(v) : v.toFixed(1);
  };

  const leftPct = ((localMin - min) / rangeWidth) * 100;
  const rightPct = ((localMax - min) / rangeWidth) * 100;
  const isFiltered = localMin > min || localMax < max;

  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border bg-white dark:bg-slate-800
                  min-w-[220px] max-w-[280px]
                  ${isFiltered ? 'border-primary-400 dark:border-primary-500 ring-1 ring-primary-200 dark:ring-primary-800' : ''}`}
    >
      <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide whitespace-nowrap">
        {label}
      </span>
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300 tabular-nums whitespace-nowrap">
          {formatVal(localMin)}
        </span>
        <div className="relative flex-1 h-6 flex items-center">
          {/* Track background */}
          <div className="absolute h-1.5 w-full bg-slate-200 dark:bg-slate-600 rounded-full" />
          {/* Active track */}
          <div
            className="absolute h-1.5 bg-primary-500 rounded-full"
            style={{ left: `${leftPct}%`, width: `${rightPct - leftPct}%` }}
          />
          {/* Min thumb */}
          <input
            type="range"
            min={min}
            max={max}
            step={rangeWidth / 200}
            value={localMin}
            onChange={(e) => {
              const v = Math.min(Number(e.target.value), localMax);
              setLocalMin(v);
            }}
            onMouseUp={() => commitChange(localMin, localMax)}
            onTouchEnd={() => commitChange(localMin, localMax)}
            className="absolute w-full h-6 appearance-none bg-transparent cursor-pointer
                       [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                       [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary-600
                       [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white
                       [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-grab
                       [&::-webkit-slider-thumb]:relative [&::-webkit-slider-thumb]:z-20
                       [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4
                       [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary-600
                       [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white
                       [&::-moz-range-thumb]:shadow-md [&::-moz-range-thumb]:cursor-grab"
            style={{ zIndex: 3 }}
          />
          {/* Max thumb */}
          <input
            type="range"
            min={min}
            max={max}
            step={rangeWidth / 200}
            value={localMax}
            onChange={(e) => {
              const v = Math.max(Number(e.target.value), localMin);
              setLocalMax(v);
            }}
            onMouseUp={() => commitChange(localMin, localMax)}
            onTouchEnd={() => commitChange(localMin, localMax)}
            className="absolute w-full h-6 appearance-none bg-transparent cursor-pointer
                       [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                       [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary-600
                       [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white
                       [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-grab
                       [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4
                       [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary-600
                       [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white
                       [&::-moz-range-thumb]:shadow-md [&::-moz-range-thumb]:cursor-grab"
            style={{ zIndex: 4 }}
          />
        </div>
        <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300 tabular-nums whitespace-nowrap">
          {formatVal(localMax)}
        </span>
      </div>
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
                   focus:outline-none focus:ring-0 w-[105px]
                   [color-scheme:dark]:dark"
      />
      <span className="text-[10px] text-slate-400">to</span>
      <input
        type="date"
        value={value[1] || maxDate}
        min={value[0] || minDate}
        max={maxDate}
        onChange={(e) => onChange([value[0] || minDate, e.target.value])}
        className="text-[11px] bg-transparent text-slate-700 dark:text-slate-200 border-0 p-0
                   focus:outline-none focus:ring-0 w-[105px]
                   [color-scheme:dark]:dark"
      />
    </div>
  );
}

/* ── FilterBar ──────────────────────────────────────────── */
export default function FilterBar({
  parsedData,
  columnMeta,
  filters,
  onFilterChange,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [expanded, setExpanded] = useState(true);

  // Build filter options from data
  const { categoricalFilters, numericFilters, dateFilters } = useMemo(() => {
    if (!parsedData || !columnMeta)
      return { categoricalFilters: [], numericFilters: [], dateFilters: [] };

    const categorical = [];
    const numeric = [];
    const dates = [];

    for (const [col, meta] of Object.entries(columnMeta)) {
      if (
        meta.type === 'string' &&
        meta.uniqueCount > 1 &&
        meta.uniqueCount <= 30
      ) {
        const uniqueVals = new Set();
        for (const row of parsedData.rows) {
          const v = row[col];
          if (
            v != null &&
            String(v).trim() &&
            !['none', 'null', 'nan', ''].includes(
              String(v).toLowerCase().trim()
            )
          ) {
            uniqueVals.add(String(v).trim());
          }
          if (uniqueVals.size >= 30) break;
        }
        if (uniqueVals.size > 1) {
          categorical.push({ column: col, options: [...uniqueVals].sort() });
        }
      } else if (
        meta.type === 'numeric' &&
        meta.min != null &&
        meta.max != null &&
        meta.min !== meta.max
      ) {
        numeric.push({ column: col, min: meta.min, max: meta.max });
      } else if (meta.type === 'date') {
        // Find min/max date strings
        let minD = null;
        let maxD = null;
        for (const row of parsedData.rows) {
          const v = row[col];
          if (!v) continue;
          const s = String(v).trim();
          // Try to parse as date and get YYYY-MM-DD
          const d = new Date(s);
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
    const newCat = { ...(filters.categorical || {}), [col]: val };
    onFilterChange({ ...filters, categorical: newCat });
  };

  const handleNumericChange = (col, range) => {
    const newNum = { ...(filters.numeric || {}), [col]: range };
    onFilterChange({ ...filters, numeric: newNum });
  };

  const handleDateChange = (col, range) => {
    const newDate = { ...(filters.date || {}), [col]: range };
    onFilterChange({ ...filters, date: newDate });
  };

  const handleSearch = (val) => {
    setSearchTerm(val);
    onFilterChange({ ...filters, search: val });
  };

  if (
    categoricalFilters.length === 0 &&
    numericFilters.length === 0 &&
    dateFilters.length === 0
  )
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
            className="overflow-visible"
          >
            <div className="px-4 pb-3">
              {/* Row 1: Search + Category dropdowns */}
              <div className="flex flex-wrap items-center gap-2.5 mb-2.5">
                {/* Search */}
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
                    <button
                      onClick={() => handleSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2"
                    >
                      <X className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" />
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
              </div>

              {/* Row 2: Date filters + Range sliders */}
              {(dateFilters.length > 0 || numericFilters.length > 0) && (
                <div className="flex flex-wrap items-center gap-2.5">
                  {/* Date Filters */}
                  {dateFilters.map((f) => (
                    <DateFilter
                      key={f.column}
                      label={f.column.replace(/_/g, ' ')}
                      minDate={f.minDate}
                      maxDate={f.maxDate}
                      value={filters.date?.[f.column] || [f.minDate, f.maxDate]}
                      onChange={(range) => handleDateChange(f.column, range)}
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
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
