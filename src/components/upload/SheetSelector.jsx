import { FileSpreadsheet, Check } from 'lucide-react';
import { motion } from 'framer-motion';

export default function SheetSelector({ sheetNames, onSelect, onCancel }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="card p-6 max-w-md w-full"
      >
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
          Choose a Sheet
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          This Excel file has multiple sheets. Select the one you'd like to analyse.
        </p>

        <div className="space-y-2 max-h-60 overflow-y-auto">
          {sheetNames.map((name, index) => (
            <button
              key={name}
              onClick={() => onSelect(name)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border
                         hover:bg-primary-50 dark:hover:bg-primary-950/20 hover:border-primary-300
                         dark:hover:border-primary-700 transition-colors text-left"
            >
              <FileSpreadsheet className="w-5 h-5 text-primary-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                  {name}
                </p>
                <p className="text-xs text-slate-400">Sheet {index + 1}</p>
              </div>
            </button>
          ))}
        </div>

        <button
          onClick={onCancel}
          className="mt-4 w-full btn-secondary text-sm"
        >
          Cancel
        </button>
      </motion.div>
    </motion.div>
  );
}
