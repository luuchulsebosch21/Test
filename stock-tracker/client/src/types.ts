// ===== Domain Models =====

export interface PortfolioItem {
  id: number;
  ticker: string;
  name: string;
  exchange: string | null;
  currency: string | null;
  created_at: string;
  updated_at: string;
}

export interface FavoriteItem {
  id: number;
  ticker: string;
  name: string;
  exchange: string | null;
  currency: string | null;
  alarm_price: number | null;
  notes: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: number;
  date: string;
  sold_ticker: string;
  sold_name: string;
  sold_buy_price: number;
  bought_ticker: string;
  bought_name: string;
  bought_buy_price: number;
  why_sold: string | null;
  why_bought: string | null;
  post_mortem: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface MarketQuote {
  ticker: string;
  name: string;
  exchange: string | null;
  currency: string | null;
  currentPrice: number | null;
  previousClose: number | null;
  dayChangePercent: number | null;
  marketCap: number | null;
  peRatio: number | null;
  forwardPE: number | null;
  evToEbitda: number | null;
  evToRevenue: number | null;
  priceToBook: number | null;
  dividendYield: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  grossMargin: number | null;
  ebitMargin: number | null;
  profitMargin: number | null;
  returnOnEquity: number | null;
  freeCashFlow: number | null;
  totalDebt: number | null;
  totalCash: number | null;
  ebitda: number | null;
  enterpriseValue: number | null;
  revenue: number | null;
  earningsGrowth: number | null;
  revenueGrowth: number | null;
  targetMeanPrice: number | null;
  performance1Y: number | null;
  performance3Y: number | null;
  revenueEstimateY1: number | null;
  revenueEstimateY2: number | null;
  revenueEstimateY3: number | null;
  epsEstimateY1: number | null;
  epsEstimateY2: number | null;
  epsEstimateY3: number | null;
  evToEbit: number | null;
  evToFcf: number | null;
  fcfYield: number | null;
  netDebtToEbitda: number | null;
  distTo52wHigh: number | null;
  distTo52wLow: number | null;
  lastUpdated: string;
}

export interface SearchResult {
  ticker: string;
  name: string;
  exchange: string;
  type: string;
}

export interface ImportReviewItem {
  extractedName: string;
  suggestedTicker: string | null;
  suggestedName: string | null;
  alternatives: SearchResult[];
  confirmed: boolean;
  selectedTicker?: string;
  selectedName?: string;
}

// ===== Column Definitions =====

export interface ColumnDef {
  key: string;
  label: string;
  category: string;
  format: 'price' | 'percent' | 'ratio' | 'number' | 'text';
  getValue: (quote: MarketQuote, item?: any) => number | string | null;
}

// ===== Column Templates =====

export type ColumnTemplate = 'valuation' | 'growth' | 'quality' | 'custom';

export const COLUMN_TEMPLATES: Record<string, { label: string; columns: string[] }> = {
  valuation: {
    label: 'Valuation View',
    columns: ['currentPrice', 'dayChangePercent', 'peRatio', 'forwardPE', 'evToEbitda', 'evToEbit', 'evToFcf', 'priceToBook', 'targetMeanPrice'],
  },
  growth: {
    label: 'Growth View',
    columns: ['currentPrice', 'dayChangePercent', 'performance1Y', 'performance3Y', 'revenueGrowth', 'earningsGrowth', 'revenueEstimateY1', 'epsEstimateY1'],
  },
  quality: {
    label: 'Quality View',
    columns: ['currentPrice', 'dayChangePercent', 'grossMargin', 'ebitMargin', 'profitMargin', 'returnOnEquity', 'fcfYield', 'netDebtToEbitda'],
  },
};

// All available metrics
export const ALL_COLUMNS: ColumnDef[] = [
  // Price & Performance
  { key: 'currentPrice', label: 'Price', category: 'Price', format: 'price', getValue: (q) => q.currentPrice },
  { key: 'dayChangePercent', label: 'Day %', category: 'Price', format: 'percent', getValue: (q) => q.dayChangePercent },
  { key: 'performance1Y', label: '1Y %', category: 'Performance', format: 'percent', getValue: (q) => q.performance1Y },
  { key: 'performance3Y', label: '3Y %', category: 'Performance', format: 'percent', getValue: (q) => q.performance3Y },
  // Valuation
  { key: 'peRatio', label: 'P/E', category: 'Valuation', format: 'ratio', getValue: (q) => q.peRatio },
  { key: 'forwardPE', label: 'Fwd P/E', category: 'Valuation', format: 'ratio', getValue: (q) => q.forwardPE },
  { key: 'evToEbitda', label: 'EV/EBITDA', category: 'Valuation', format: 'ratio', getValue: (q) => q.evToEbitda },
  { key: 'evToEbit', label: 'EV/EBIT', category: 'Valuation', format: 'ratio', getValue: (q) => q.evToEbit },
  { key: 'evToFcf', label: 'EV/FCF', category: 'Valuation', format: 'ratio', getValue: (q) => q.evToFcf },
  { key: 'priceToBook', label: 'P/B', category: 'Valuation', format: 'ratio', getValue: (q) => q.priceToBook },
  { key: 'targetMeanPrice', label: 'Target Price', category: 'Valuation', format: 'price', getValue: (q) => q.targetMeanPrice },
  // Growth
  { key: 'revenueGrowth', label: 'Rev Growth', category: 'Growth', format: 'percent', getValue: (q) => q.revenueGrowth },
  { key: 'earningsGrowth', label: 'EPS Growth', category: 'Growth', format: 'percent', getValue: (q) => q.earningsGrowth },
  { key: 'revenueEstimateY1', label: 'Rev Est Y1', category: 'Growth', format: 'number', getValue: (q) => q.revenueEstimateY1 },
  { key: 'revenueEstimateY2', label: 'Rev Est Y2', category: 'Growth', format: 'number', getValue: (q) => q.revenueEstimateY2 },
  { key: 'revenueEstimateY3', label: 'Rev Est Y3', category: 'Growth', format: 'number', getValue: (q) => q.revenueEstimateY3 },
  { key: 'epsEstimateY1', label: 'EPS Est Y1', category: 'Growth', format: 'ratio', getValue: (q) => q.epsEstimateY1 },
  { key: 'epsEstimateY2', label: 'EPS Est Y2', category: 'Growth', format: 'ratio', getValue: (q) => q.epsEstimateY2 },
  { key: 'epsEstimateY3', label: 'EPS Est Y3', category: 'Growth', format: 'ratio', getValue: (q) => q.epsEstimateY3 },
  // Quality
  { key: 'grossMargin', label: 'Gross Margin', category: 'Quality', format: 'percent', getValue: (q) => q.grossMargin },
  { key: 'ebitMargin', label: 'EBIT Margin', category: 'Quality', format: 'percent', getValue: (q) => q.ebitMargin },
  { key: 'profitMargin', label: 'Net Margin', category: 'Quality', format: 'percent', getValue: (q) => q.profitMargin },
  { key: 'returnOnEquity', label: 'ROE', category: 'Quality', format: 'percent', getValue: (q) => q.returnOnEquity },
  { key: 'fcfYield', label: 'FCF Yield', category: 'Quality', format: 'percent', getValue: (q) => q.fcfYield },
  { key: 'netDebtToEbitda', label: 'Net Debt/EBITDA', category: 'Quality', format: 'ratio', getValue: (q) => q.netDebtToEbitda },
  // Other
  { key: 'marketCap', label: 'Market Cap', category: 'Other', format: 'number', getValue: (q) => q.marketCap },
  { key: 'dividendYield', label: 'Div Yield', category: 'Other', format: 'percent', getValue: (q) => q.dividendYield },
  { key: 'distTo52wHigh', label: 'vs 52w High', category: 'Other', format: 'percent', getValue: (q) => q.distTo52wHigh },
  { key: 'distTo52wLow', label: 'vs 52w Low', category: 'Other', format: 'percent', getValue: (q) => q.distTo52wLow },
];

export const DEFAULT_PORTFOLIO_COLUMNS = ['currentPrice', 'dayChangePercent', 'performance1Y', 'peRatio', 'evToEbitda', 'targetMeanPrice', 'marketCap'];
export const DEFAULT_FAVORITES_COLUMNS = ['currentPrice', 'dayChangePercent', 'alarmDiffPercent', 'performance1Y', 'peRatio', 'evToEbitda', 'targetMeanPrice'];

// Available tags for favorites
export const AVAILABLE_TAGS = [
  'quality compounder',
  'cyclical',
  'deep value',
  'growth',
  'dividend',
  'turnaround',
  'speculative',
];
