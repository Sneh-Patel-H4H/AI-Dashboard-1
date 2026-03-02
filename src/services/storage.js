import { get, set, clear } from 'idb-keyval';

const KEYS = {
  PARSED_DATA: 'ib-parsed-data',
  ANALYSIS: 'ib-analysis',
  DASHBOARD: 'ib-dashboard',
  CHAT_HISTORY: 'ib-chat-history',
  USER_PREFS: 'ib-prefs',
};

export const storage = {
  async saveParsedData(data) {
    await set(KEYS.PARSED_DATA, data);
  },
  async getParsedData() {
    return await get(KEYS.PARSED_DATA);
  },

  async saveAnalysis(analysis) {
    await set(KEYS.ANALYSIS, analysis);
  },
  async getAnalysis() {
    return await get(KEYS.ANALYSIS);
  },

  async saveDashboard(dashboard) {
    await set(KEYS.DASHBOARD, dashboard);
  },
  async getDashboard() {
    return await get(KEYS.DASHBOARD);
  },

  async saveChatHistory(history) {
    await set(KEYS.CHAT_HISTORY, history);
  },
  async getChatHistory() {
    return (await get(KEYS.CHAT_HISTORY)) || [];
  },

  async savePrefs(prefs) {
    await set(KEYS.USER_PREFS, prefs);
  },
  async getPrefs() {
    return (await get(KEYS.USER_PREFS)) || {};
  },

  async clearAll() {
    await clear();
  },
};
