// ===== Formatting Utilities =====

export function formatPrice(value: number | null, currency?: string | null): string {
  if (value === null || value === undefined) return 'n/a';
  const prefix = currency ? `${currency} ` : '';
  if (Math.abs(value) >= 1_000_000_000) {
    return `${prefix}${(value / 1_000_000_000).toFixed(1)}B`;
  }
  if (Math.abs(value) >= 1_000_000) {
    return `${prefix}${(value / 1_000_000).toFixed(1)}M`;
  }
  return `${prefix}${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatPercent(value: number | null): string {
  if (value === null || value === undefined) return 'n/a';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

export function formatRatio(value: number | null): string {
  if (value === null || value === undefined) return 'n/a';
  return value.toFixed(2);
}

export function formatNumber(value: number | null): string {
  if (value === null || value === undefined) return 'n/a';
  if (Math.abs(value) >= 1_000_000_000_000) {
    return `${(value / 1_000_000_000_000).toFixed(1)}T`;
  }
  if (Math.abs(value) >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(1)}B`;
  }
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export function formatValue(value: number | string | null, format: string): string {
  if (value === null || value === undefined) return 'n/a';
  if (typeof value === 'string') return value;
  switch (format) {
    case 'price': return formatPrice(value);
    case 'percent': return formatPercent(value);
    case 'ratio': return formatRatio(value);
    case 'number': return formatNumber(value);
    default: return String(value);
  }
}

// ===== Color Utilities =====

export function getPercentColor(value: number | null): string {
  if (value === null || value === undefined) return '';
  if (value > 0) return 'text-green-600 dark:text-green-400';
  if (value < 0) return 'text-red-600 dark:text-red-400';
  return '';
}

// ===== Calculation Utilities =====

export function calcTargetDiffPercent(targetPrice: number | null, currentPrice: number | null): number | null {
  if (targetPrice === null || targetPrice === undefined || targetPrice === 0) return null;
  if (currentPrice === null || currentPrice === undefined) return null;
  return ((targetPrice - currentPrice) / targetPrice) * 100;
}

export function calcTransactionReturn(
  boughtCurrentPrice: number | null,
  boughtBuyPrice: number,
  soldCurrentPrice: number | null,
  soldBuyPrice: number
): number | null {
  if (boughtCurrentPrice === null || soldCurrentPrice === null) return null;
  if (boughtBuyPrice === 0 || soldBuyPrice === 0) return null;

  const result = (boughtCurrentPrice / boughtBuyPrice) - (soldCurrentPrice / soldBuyPrice);
  const pct = result * 100;

  // If result > 1000%, treat as invalid
  if (Math.abs(pct) > 1000) return null;

  return pct;
}

export function calcHoldingPeriod(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.floor(days / 30)}m`;
  const years = Math.floor(days / 365);
  const months = Math.floor((days % 365) / 30);
  return months > 0 ? `${years}y ${months}m` : `${years}y`;
}

export function calcMedian(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function calcMean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// ===== CSV Export =====

export function exportToCsv(headers: string[], rows: string[][], filename: string) {
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
