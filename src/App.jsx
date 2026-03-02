import { useEffect, useState } from 'react';
import useStore from './store/useStore';
import Header from './components/layout/Header';
import FileUpload from './components/upload/FileUpload';
import DiscoveryScreen from './components/discovery/DiscoveryScreen';
import Dashboard from './components/dashboard/Dashboard';

export default function App() {
  const { currentScreen, hydrate } = useStore();
  const [isHydrating, setIsHydrating] = useState(true);

  useEffect(() => {
    hydrate().finally(() => setIsHydrating(false));
  }, [hydrate]);

  if (isHydrating) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-500 dark:text-slate-400">Loading InsightBoard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        {currentScreen === 'upload' && <FileUpload />}
        {currentScreen === 'discovery' && <DiscoveryScreen />}
        {currentScreen === 'dashboard' && <Dashboard />}
      </main>
    </div>
  );
}
