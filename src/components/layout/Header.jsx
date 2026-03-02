import { BarChart3, Sun, Moon, Upload, MessageSquare } from 'lucide-react';
import useStore from '../../store/useStore';

export default function Header() {
  const { darkMode, toggleDarkMode, currentScreen, resetAll, toggleChat, isChatOpen } = useStore();

  return (
    <header className="sticky top-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-primary-600 rounded-lg flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white leading-tight">
              InsightBoard
            </h1>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-tight -mt-0.5">
              AI-Powered Analytics
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {currentScreen === 'dashboard' && (
            <button
              onClick={toggleChat}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title={isChatOpen ? 'Hide chat' : 'Show chat'}
            >
              <MessageSquare className="w-5 h-5 text-slate-600 dark:text-slate-300" />
            </button>
          )}

          <button
            onClick={toggleDarkMode}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title={darkMode ? 'Light mode' : 'Dark mode'}
          >
            {darkMode ? (
              <Sun className="w-5 h-5 text-slate-300" />
            ) : (
              <Moon className="w-5 h-5 text-slate-600" />
            )}
          </button>

          {currentScreen !== 'upload' && (
            <button
              onClick={resetAll}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium
                         text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800
                         transition-colors"
            >
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">New File</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
