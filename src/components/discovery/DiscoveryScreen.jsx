import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Building2, Layers, AlertTriangle, FileText, ArrowRight,
  ChevronDown, Edit3, DollarSign
} from 'lucide-react';
import useStore from '../../store/useStore';
import { api } from '../../services/api';
import { getConfidenceLabel, getConfidenceClass } from '../../utils/formatters';
import KPISelector from './KPISelector';

const CURRENCIES = [
  { symbol: '$', label: 'USD ($)' },
  { symbol: '\u20AC', label: 'EUR (\u20AC)' },
  { symbol: '\u00A3', label: 'GBP (\u00A3)' },
  { symbol: '\u00A5', label: 'JPY (\u00A5)' },
  { symbol: '\u20B9', label: 'INR (\u20B9)' },
];

export default function DiscoveryScreen() {
  const {
    analysis,
    parsedData,
    fileName,
    confirmedKPIs,
    confirmedSector,
    confirmedOrgType,
    selectedCurrency,
    setConfirmedSector,
    setConfirmedOrgType,
    setSelectedCurrency,
    setScreen,
    setDashboard,
    setIsGeneratingDashboard,
    setDashboardError,
    isGeneratingDashboard,
  } = useStore();

  const [editingSector, setEditingSector] = useState(false);
  const [editingOrgType, setEditingOrgType] = useState(false);

  if (!analysis) return null;

  const activeKPIs = confirmedKPIs.filter((k) => !k._disabled);

  const handleBuildDashboard = async () => {
    setIsGeneratingDashboard(true);
    setDashboardError(null);

    try {
      const payload = {
        headers: parsedData.headers,
        column_meta: parsedData.columnMeta,
        confirmed_kpis: activeKPIs,
        sample_rows: parsedData.rows.slice(0, 200),
        total_rows: parsedData.totalRows,
        currency: selectedCurrency || '$',
        time_column: analysis.time_column || null,
      };

      const result = await api.dashboard(payload);
      await setDashboard(result);
      setScreen('dashboard');
    } catch (err) {
      setDashboardError(err.message);
      setIsGeneratingDashboard(false);
    }
  };

  const stagger = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.08 },
    },
  };

  const fadeUp = {
    hidden: { opacity: 0, y: 16 },
    show: { opacity: 1, y: 0 },
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <motion.div variants={stagger} initial="hidden" animate="show">
        {/* Title */}
        <motion.div variants={fadeUp} className="mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mb-2">
            Here's What We Found
          </h2>
          <p className="text-slate-500 dark:text-slate-400">
            Review the analysis below, make any changes, then build your dashboard.
          </p>
        </motion.div>

        {/* Summary Card */}
        <motion.div variants={fadeUp} className="card p-5 mb-6">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-primary-100 dark:bg-primary-900/30 rounded-lg flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5 text-primary-600 dark:text-primary-400" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white mb-1">{fileName}</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300">{analysis.summary}</p>
              <div className="flex flex-wrap gap-3 mt-3 text-xs text-slate-400">
                <span>{parsedData.totalRows.toLocaleString()} rows</span>
                <span>{parsedData.headers.length} columns</span>
                {analysis.has_time_series && (
                  <span>Time series: {analysis.time_column}</span>
                )}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Sector & Org Type */}
        <motion.div variants={fadeUp} className="grid sm:grid-cols-2 gap-4 mb-6">
          {/* Sector */}
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-3">
              <Layers className="w-4 h-4 text-primary-500" />
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                Data Sector
              </span>
            </div>
            {editingSector ? (
              <input
                autoFocus
                className="input text-lg font-semibold mb-2"
                value={confirmedSector}
                onChange={(e) => setConfirmedSector(e.target.value)}
                onBlur={() => setEditingSector(false)}
                onKeyDown={(e) => e.key === 'Enter' && setEditingSector(false)}
              />
            ) : (
              <div
                className="flex items-center gap-2 cursor-pointer group"
                onClick={() => setEditingSector(true)}
              >
                <p className="text-lg font-semibold text-slate-900 dark:text-white">
                  {confirmedSector}
                </p>
                <Edit3 className="w-3.5 h-3.5 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            )}
            <div className="flex items-center gap-2 mt-2">
              <span className={getConfidenceClass(analysis.sector_confidence)}>
                {getConfidenceLabel(analysis.sector_confidence)} Confidence
              </span>
              <span className="text-xs text-slate-400">{analysis.sector_reason}</span>
            </div>
          </div>

          {/* Org Type */}
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-3">
              <Building2 className="w-4 h-4 text-primary-500" />
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                Organisation Type
              </span>
            </div>
            {editingOrgType ? (
              <input
                autoFocus
                className="input text-lg font-semibold mb-2"
                value={confirmedOrgType}
                onChange={(e) => setConfirmedOrgType(e.target.value)}
                onBlur={() => setEditingOrgType(false)}
                onKeyDown={(e) => e.key === 'Enter' && setEditingOrgType(false)}
              />
            ) : (
              <div
                className="flex items-center gap-2 cursor-pointer group"
                onClick={() => setEditingOrgType(true)}
              >
                <p className="text-lg font-semibold text-slate-900 dark:text-white">
                  {confirmedOrgType}
                </p>
                <Edit3 className="w-3.5 h-3.5 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            )}
            <div className="flex items-center gap-2 mt-2">
              <span className={getConfidenceClass(analysis.org_type_confidence)}>
                {getConfidenceLabel(analysis.org_type_confidence)} Confidence
              </span>
              <span className="text-xs text-slate-400">{analysis.org_type_reason}</span>
            </div>
          </div>
        </motion.div>

        {/* Currency Selector */}
        <motion.div variants={fadeUp} className="card p-5 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-primary-500" />
              <span className="text-sm font-medium text-slate-900 dark:text-white">Currency</span>
              {analysis.currency && (
                <span className="text-xs text-slate-400">
                  (detected from your data)
                </span>
              )}
            </div>
            <select
              value={selectedCurrency || '$'}
              onChange={(e) => setSelectedCurrency(e.target.value)}
              className="input w-auto text-sm"
            >
              {CURRENCIES.map((c) => (
                <option key={c.symbol} value={c.symbol}>{c.label}</option>
              ))}
            </select>
          </div>
        </motion.div>

        {/* Data Quality Warnings */}
        {analysis.data_quality_warnings?.length > 0 && (
          <motion.div variants={fadeUp} className="card p-5 mb-6 border-amber-200 dark:border-amber-800">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                Data Quality Notes
              </span>
            </div>
            <ul className="space-y-1.5">
              {analysis.data_quality_warnings.map((w, i) => (
                <li key={i} className="text-sm text-slate-600 dark:text-slate-300 flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                  {w}
                </li>
              ))}
            </ul>
          </motion.div>
        )}

        {/* KPI Selector */}
        <motion.div variants={fadeUp} className="card p-5 mb-8">
          <KPISelector />
        </motion.div>

        {/* Build Dashboard Button */}
        <motion.div variants={fadeUp} className="flex justify-center">
          <button
            onClick={handleBuildDashboard}
            disabled={activeKPIs.length === 0 || isGeneratingDashboard}
            className="btn-primary text-lg px-10 py-3 flex items-center gap-3 disabled:opacity-50"
          >
            {isGeneratingDashboard ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Building Dashboard...
              </>
            ) : (
              <>
                Build My Dashboard
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </motion.div>

        {activeKPIs.length === 0 && (
          <p className="text-center text-sm text-slate-400 mt-3">
            Select at least one KPI to build the dashboard.
          </p>
        )}
      </motion.div>
    </div>
  );
}
