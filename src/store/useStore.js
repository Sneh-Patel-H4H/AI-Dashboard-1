import { create } from 'zustand';
import { storage } from '../services/storage';

const useStore = create((set, get) => ({
  // Navigation
  currentScreen: 'upload', // 'upload' | 'discovery' | 'dashboard'
  setScreen: (screen) => set({ currentScreen: screen }),

  // File & parsed data
  fileName: null,
  parsedData: null,
  isParsingFile: false,
  parseError: null,

  setParsedData: async (data, fileName) => {
    set({ parsedData: data, fileName, parseError: null });
    await storage.saveParsedData({ ...data, fileName });
  },
  setParseError: (error) => set({ parseError: error, isParsingFile: false }),
  setIsParsingFile: (v) => set({ isParsingFile: v }),

  // Analysis results
  analysis: null,
  isAnalyzing: false,
  analysisError: null,

  setAnalysis: async (analysis) => {
    set({ analysis, analysisError: null, isAnalyzing: false });
    await storage.saveAnalysis(analysis);
  },
  setIsAnalyzing: (v) => set({ isAnalyzing: v }),
  setAnalysisError: (error) => set({ analysisError: error, isAnalyzing: false }),

  // User overrides on discovery screen
  confirmedKPIs: [],
  confirmedSector: null,
  confirmedOrgType: null,
  selectedCurrency: null,

  setConfirmedKPIs: (kpis) => set({ confirmedKPIs: kpis }),
  setConfirmedSector: (sector) => set({ confirmedSector: sector }),
  setConfirmedOrgType: (orgType) => set({ confirmedOrgType: orgType }),
  setSelectedCurrency: (currency) => set({ selectedCurrency: currency }),

  // Dashboard
  dashboard: null,
  isGeneratingDashboard: false,
  dashboardError: null,

  setDashboard: async (dashboard) => {
    set({ dashboard, dashboardError: null, isGeneratingDashboard: false });
    await storage.saveDashboard(dashboard);
  },
  setIsGeneratingDashboard: (v) => set({ isGeneratingDashboard: v }),
  setDashboardError: (error) => set({ dashboardError: error, isGeneratingDashboard: false }),

  // Chat
  chatMessages: [],
  isChatLoading: false,
  chatError: null,

  addChatMessage: (message) => {
    const updated = [...get().chatMessages, message];
    set({ chatMessages: updated });
    storage.saveChatHistory(updated);
  },
  setIsChatLoading: (v) => set({ isChatLoading: v }),
  setChatError: (error) => set({ chatError: error, isChatLoading: false }),

  // Theme
  darkMode: false,
  toggleDarkMode: () => {
    const newMode = !get().darkMode;
    set({ darkMode: newMode });
    document.documentElement.classList.toggle('dark', newMode);
    storage.savePrefs({ ...get().prefs, darkMode: newMode });
  },

  // Chat panel visibility
  isChatOpen: true,
  toggleChat: () => set({ isChatOpen: !get().isChatOpen }),

  // Reset for new file upload
  resetAll: async () => {
    await storage.clearAll();
    document.documentElement.classList.remove('dark');
    set({
      currentScreen: 'upload',
      fileName: null,
      parsedData: null,
      parseError: null,
      analysis: null,
      analysisError: null,
      confirmedKPIs: [],
      confirmedSector: null,
      confirmedOrgType: null,
      selectedCurrency: null,
      dashboard: null,
      dashboardError: null,
      chatMessages: [],
      chatError: null,
      darkMode: false,
      isChatOpen: true,
    });
  },

  // Hydrate from IndexedDB on app load
  hydrate: async () => {
    try {
      const [parsedData, analysis, dashboard, chatHistory, prefs] =
        await Promise.all([
          storage.getParsedData(),
          storage.getAnalysis(),
          storage.getDashboard(),
          storage.getChatHistory(),
          storage.getPrefs(),
        ]);

      const updates = {};
      if (parsedData) {
        updates.parsedData = parsedData;
        updates.fileName = parsedData.fileName;
      }
      if (analysis) {
        updates.analysis = analysis;
        updates.confirmedKPIs = analysis.suggested_kpis || [];
        updates.confirmedSector = analysis.sector;
        updates.confirmedOrgType = analysis.org_type;
        updates.selectedCurrency = analysis.currency;
      }
      if (dashboard) updates.dashboard = dashboard;
      if (chatHistory?.length) updates.chatMessages = chatHistory;
      if (prefs?.darkMode) {
        updates.darkMode = true;
        document.documentElement.classList.add('dark');
      }

      // Determine screen
      if (dashboard) updates.currentScreen = 'dashboard';
      else if (analysis) updates.currentScreen = 'discovery';
      else updates.currentScreen = 'upload';

      set(updates);
    } catch (e) {
      console.error('Failed to restore session:', e);
    }
  },
}));

export default useStore;
