import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { parseFile, getExcelSheetNames, parseExcelSheet } from '../../services/fileParser';
import { api } from '../../services/api';
import useStore from '../../store/useStore';
import SheetSelector from './SheetSelector';

export default function FileUpload() {
  const {
    setParsedData,
    setScreen,
    setAnalysis,
    setIsAnalyzing,
    setAnalysisError,
    setConfirmedKPIs,
    setConfirmedSector,
    setConfirmedOrgType,
    setSelectedCurrency,
  } = useStore();

  const [status, setStatus] = useState('idle'); // idle | parsing | analyzing | error
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState(null);
  const [excelFile, setExcelFile] = useState(null);
  const [sheetNames, setSheetNames] = useState(null);

  const handleParse = async (file, sheetName) => {
    setStatus('parsing');
    setStatusMessage('Reading your file...');
    setError(null);

    try {
      let parsed;
      if (sheetName) {
        parsed = await parseExcelSheet(file, sheetName);
      } else {
        parsed = await parseFile(file);
      }

      await setParsedData(parsed, file.name);
      setStatusMessage(`Found ${parsed.totalRows.toLocaleString()} rows and ${parsed.headers.length} columns. Analysing...`);

      // Auto-trigger AI analysis
      setStatus('analyzing');
      setIsAnalyzing(true);

      const analysisPayload = {
        headers: parsed.headers,
        sample_rows: parsed.rows.slice(0, 100),
        column_meta: parsed.columnMeta,
        total_rows: parsed.totalRows,
        file_name: file.name,
      };

      const analysis = await api.analyze(analysisPayload);
      await setAnalysis(analysis);
      setConfirmedKPIs(analysis.suggested_kpis || []);
      setConfirmedSector(analysis.sector);
      setConfirmedOrgType(analysis.org_type);
      setSelectedCurrency(analysis.currency || '$');

      setStatus('idle');
      setScreen('discovery');
    } catch (err) {
      setStatus('error');
      setError(err.message || 'Something went wrong. Please try a different file.');
      setIsAnalyzing(false);
      setAnalysisError(err.message);
    }
  };

  const onDrop = useCallback(async (acceptedFiles) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setError(null);
    setExcelFile(null);
    setSheetNames(null);

    const ext = file.name.split('.').pop().toLowerCase();

    if (['xlsx', 'xls'].includes(ext)) {
      try {
        setStatus('parsing');
        setStatusMessage('Reading Excel file...');
        const names = await getExcelSheetNames(file);
        if (names.length === 1) {
          await handleParse(file, names[0]);
        } else {
          setStatus('idle');
          setExcelFile(file);
          setSheetNames(names);
        }
      } catch (err) {
        setStatus('error');
        setError(err.message);
      }
    } else if (ext === 'csv') {
      await handleParse(file);
    } else {
      setStatus('error');
      setError('Please upload a CSV or Excel file (.csv, .xlsx, .xls)');
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
    },
    multiple: false,
    disabled: status === 'parsing' || status === 'analyzing',
  });

  return (
    <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
      <div className="max-w-xl w-full">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white mb-3">
            Upload Your Data
          </h2>
          <p className="text-slate-500 dark:text-slate-400 text-lg">
            Drop a CSV or Excel file and we'll build your dashboard automatically.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div
            {...getRootProps()}
            className={`
              relative border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer
              transition-all duration-200
              ${isDragActive
                ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/20'
                : 'border-slate-300 dark:border-slate-600 hover:border-primary-400 dark:hover:border-primary-500 hover:bg-slate-50 dark:hover:bg-slate-800/50'
              }
              ${(status === 'parsing' || status === 'analyzing') ? 'pointer-events-none opacity-75' : ''}
            `}
          >
            <input {...getInputProps()} />

            <AnimatePresence mode="wait">
              {status === 'idle' && (
                <motion.div
                  key="idle"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <div className="w-16 h-16 bg-primary-100 dark:bg-primary-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Upload className="w-8 h-8 text-primary-600 dark:text-primary-400" />
                  </div>
                  <p className="text-lg font-medium text-slate-700 dark:text-slate-200 mb-1">
                    {isDragActive ? 'Drop your file here' : 'Drag & drop your file here'}
                  </p>
                  <p className="text-sm text-slate-400">
                    or click to browse. CSV and Excel files supported.
                  </p>
                </motion.div>
              )}

              {(status === 'parsing' || status === 'analyzing') && (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="py-4"
                >
                  <div className="w-12 h-12 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                  <p className="text-lg font-medium text-slate-700 dark:text-slate-200 mb-1">
                    {status === 'parsing' ? 'Reading your file...' : 'AI is analysing your data...'}
                  </p>
                  <p className="text-sm text-slate-400">{statusMessage}</p>
                </motion.div>
              )}

              {status === 'error' && (
                <motion.div
                  key="error"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <div className="w-16 h-16 bg-rose-100 dark:bg-rose-900/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <AlertCircle className="w-8 h-8 text-rose-500" />
                  </div>
                  <p className="text-lg font-medium text-rose-600 dark:text-rose-400 mb-2">
                    Something went wrong
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">{error}</p>
                  <p className="text-sm text-slate-400">Try uploading again or use a different file.</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mt-6 flex items-center justify-center gap-6 text-xs text-slate-400"
        >
          <span className="flex items-center gap-1.5">
            <FileSpreadsheet className="w-3.5 h-3.5" /> .csv
          </span>
          <span className="flex items-center gap-1.5">
            <FileSpreadsheet className="w-3.5 h-3.5" /> .xlsx
          </span>
          <span className="flex items-center gap-1.5">
            <FileSpreadsheet className="w-3.5 h-3.5" /> .xls
          </span>
        </motion.div>
      </div>

      <AnimatePresence>
        {sheetNames && (
          <SheetSelector
            sheetNames={sheetNames}
            onSelect={(name) => {
              setSheetNames(null);
              handleParse(excelFile, name);
            }}
            onCancel={() => {
              setSheetNames(null);
              setExcelFile(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
