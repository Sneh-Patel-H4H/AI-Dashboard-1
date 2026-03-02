const API_BASE = '/api';

async function apiCall(endpoint, body) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      error.detail || 'Something went wrong. Please try again.'
    );
  }

  return response.json();
}

export const api = {
  analyze: (data) => apiCall('/analyze', data),
  dashboard: (data) => apiCall('/dashboard', data),
  chat: (data) => apiCall('/chat', data),
};
