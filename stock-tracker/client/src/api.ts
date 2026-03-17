import type { PortfolioItem, FavoriteItem, Transaction, MarketQuote, SearchResult, ImportReviewItem } from './types';

const BASE = '/api';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// Portfolio — only ticker required, server auto-enriches
export const getPortfolio = () => fetchJson<PortfolioItem[]>('/portfolio');
export const addPortfolioItem = (ticker: string) =>
  fetchJson<PortfolioItem>('/portfolio', { method: 'POST', body: JSON.stringify({ ticker }) });
export const addPortfolioBatch = (tickers: string[]) =>
  fetchJson<PortfolioItem[]>('/portfolio/batch', { method: 'POST', body: JSON.stringify({ items: tickers.map(t => ({ ticker: t })) }) });
export const deletePortfolioItem = (id: number) =>
  fetchJson<{ success: boolean }>(`/portfolio/${id}`, { method: 'DELETE' });

// Favorites — only ticker required + optional target_price
export const getFavorites = () => fetchJson<FavoriteItem[]>('/favorites');
export const addFavorite = (data: { ticker: string; target_price?: number; notes?: string; tags?: string[] }) =>
  fetchJson<FavoriteItem>('/favorites', { method: 'POST', body: JSON.stringify(data) });
export const addFavoritesBatch = (tickers: string[]) =>
  fetchJson<{ inserted: number }>('/favorites/batch', { method: 'POST', body: JSON.stringify({ items: tickers.map(t => ({ ticker: t })) }) });
export const updateFavorite = (id: number, data: { target_price?: number | null; notes?: string | null; tags?: string[] }) =>
  fetchJson<FavoriteItem>(`/favorites/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteFavorite = (id: number) =>
  fetchJson<{ success: boolean }>(`/favorites/${id}`, { method: 'DELETE' });

// Transactions
export const getTransactions = () => fetchJson<Transaction[]>('/transactions');
export const addTransaction = (tx: Omit<Transaction, 'id' | 'created_at' | 'updated_at'>) =>
  fetchJson<Transaction>('/transactions', { method: 'POST', body: JSON.stringify(tx) });
export const updateTransaction = (id: number, tx: Partial<Transaction>) =>
  fetchJson<Transaction>(`/transactions/${id}`, { method: 'PUT', body: JSON.stringify(tx) });
export const deleteTransaction = (id: number) =>
  fetchJson<{ success: boolean }>(`/transactions/${id}`, { method: 'DELETE' });

// Market Data
export const getQuote = (ticker: string) => fetchJson<MarketQuote>(`/market/quote/${ticker}`);
export const getQuotes = (tickers: string[]) =>
  fetchJson<Record<string, MarketQuote>>('/market/quotes', { method: 'POST', body: JSON.stringify({ tickers }) });
export const getHistoricalPrice = (ticker: string, date: string) =>
  fetchJson<{ price: number | null }>(`/market/historical/${ticker}?date=${date}`);
export const searchTicker = (query: string) => fetchJson<SearchResult[]>(`/market/search/${encodeURIComponent(query)}`);

// Import
export const extractFromFile = async (file: File): Promise<{ items: ImportReviewItem[]; rawText?: string; message?: string }> => {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${BASE}/import/extract`, { method: 'POST', body: formData });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
};

// Preferences
export const getPreferences = () => fetchJson<Record<string, any>>('/preferences');
export const updatePreferences = (prefs: Record<string, any>) =>
  fetchJson<{ success: boolean }>('/preferences', { method: 'PUT', body: JSON.stringify(prefs) });
