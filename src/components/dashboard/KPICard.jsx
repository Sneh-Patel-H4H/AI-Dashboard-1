import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { motion } from 'framer-motion';

export default function KPICard({ kpi, index }) {
  const { label, formatted_value, change_percent, change_direction } = kpi;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="card p-5"
    >
      <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2 truncate">
        {label}
      </p>
      <p className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mb-1">
        {formatted_value}
      </p>
      {change_percent != null ? (
        <div
          className={`flex items-center gap-1 text-sm font-medium ${
            change_direction === 'up'
              ? 'text-emerald-600 dark:text-emerald-400'
              : change_direction === 'down'
              ? 'text-rose-600 dark:text-rose-400'
              : 'text-slate-400'
          }`}
        >
          {change_direction === 'up' ? (
            <TrendingUp className="w-4 h-4" />
          ) : change_direction === 'down' ? (
            <TrendingDown className="w-4 h-4" />
          ) : (
            <Minus className="w-4 h-4" />
          )}
          {change_percent > 0 ? '+' : ''}
          {change_percent}% vs prior period
        </div>
      ) : (
        <div className="text-xs text-slate-300 dark:text-slate-600">
          &mdash;
        </div>
      )}
    </motion.div>
  );
}
