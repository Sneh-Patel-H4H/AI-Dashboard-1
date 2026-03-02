import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { motion } from 'framer-motion';

export default function KPICard({ kpi, index }) {
  const { label, formatted_value, change_percent, change_direction } = kpi;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="card p-4 flex flex-col justify-between min-h-[120px]"
    >
      <p
        className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1 leading-tight"
        title={label}
        style={{
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {label}
      </p>
      <p
        className="text-xl font-bold text-slate-900 dark:text-white mb-1 truncate"
        title={formatted_value}
      >
        {formatted_value}
      </p>
      {change_percent != null ? (
        <div
          className={`flex items-center gap-1 text-xs font-medium whitespace-nowrap ${
            change_direction === 'up'
              ? 'text-emerald-600 dark:text-emerald-400'
              : change_direction === 'down'
              ? 'text-rose-600 dark:text-rose-400'
              : 'text-slate-400'
          }`}
        >
          {change_direction === 'up' ? (
            <TrendingUp className="w-3.5 h-3.5 shrink-0" />
          ) : change_direction === 'down' ? (
            <TrendingDown className="w-3.5 h-3.5 shrink-0" />
          ) : (
            <Minus className="w-3.5 h-3.5 shrink-0" />
          )}
          <span className="truncate">
            {change_percent > 0 ? '+' : ''}
            {change_percent}% vs prior
          </span>
        </div>
      ) : (
        <div className="text-xs text-slate-300 dark:text-slate-600">
          &mdash;
        </div>
      )}
    </motion.div>
  );
}
