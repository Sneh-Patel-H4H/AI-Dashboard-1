import { motion } from 'framer-motion';
import useStore from '../../store/useStore';
import KPICard from './KPICard';
import ChartPanel from './ChartPanel';
import ChatPanel from '../chat/ChatPanel';

export default function Dashboard() {
  const { dashboard, isChatOpen } = useStore();

  if (!dashboard) return null;

  const { kpi_cards = [], charts = [], dashboard_title } = dashboard;

  return (
    <div className="flex h-[calc(100vh-64px)]">
      {/* Main dashboard area */}
      <div
        className={`flex-1 overflow-y-auto transition-all duration-300 ${
          isChatOpen ? 'lg:mr-0' : ''
        }`}
      >
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6">
          {/* Dashboard Title */}
          <motion.h2
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mb-6"
          >
            {dashboard_title || 'Your Dashboard'}
          </motion.h2>

          {/* KPI Cards */}
          {kpi_cards.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 mb-6">
              {kpi_cards.map((kpi, i) => (
                <KPICard key={kpi.id || i} kpi={kpi} index={i} />
              ))}
            </div>
          )}

          {/* Charts */}
          {charts.length > 0 && (
            <div className="grid md:grid-cols-2 gap-4">
              {charts.map((chart, i) => (
                <ChartPanel key={chart.id || i} chart={chart} index={i} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Chat Panel */}
      {isChatOpen && (
        <div className="hidden lg:block w-[400px] xl:w-[440px] border-l bg-white dark:bg-slate-900 shrink-0">
          <ChatPanel />
        </div>
      )}

      {/* Mobile chat overlay */}
      {isChatOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-white dark:bg-slate-900">
          <ChatPanel />
        </div>
      )}
    </div>
  );
}
