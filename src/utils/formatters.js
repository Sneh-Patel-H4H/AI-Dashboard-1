const CURRENCY_MAP = {
  '$': 'USD',
  '\u20AC': 'EUR',
  '\u00A3': 'GBP',
  '\u00A5': 'JPY',
  '\u20B9': 'INR',
};

const SYMBOL_MAP = {
  USD: '$',
  EUR: '\u20AC',
  GBP: '\u00A3',
  JPY: '\u00A5',
  INR: '\u20B9',
};

export function formatCurrency(value, currencySymbol = '$') {
  const code = CURRENCY_MAP[currencySymbol] || 'USD';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currencySymbol}${formatNumber(value)}`;
  }
}

export function formatNumber(value) {
  if (value == null || isNaN(value)) return '-';
  if (Math.abs(value) >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(1)}B`;
  }
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return value % 1 === 0 ? String(value) : value.toFixed(2);
}

export function formatPercent(value) {
  if (value == null || isNaN(value)) return '-';
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

export function getConfidenceLabel(score) {
  if (score >= 0.8) return 'High';
  if (score >= 0.5) return 'Medium';
  return 'Low';
}

export function getConfidenceClass(score) {
  if (score >= 0.8) return 'badge-high';
  if (score >= 0.5) return 'badge-medium';
  return 'badge-low';
}

export function getCurrencySymbol(code) {
  return SYMBOL_MAP[code] || '$';
}

export { CURRENCY_MAP, SYMBOL_MAP };
