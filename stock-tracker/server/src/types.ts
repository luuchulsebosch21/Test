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

// ===== Market Data =====

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
  // 1Y/3Y performance
  performance1Y: number | null;
  performance3Y: number | null;
  // Forward estimates (often unavailable)
  revenueEstimateY1: number | null;
  revenueEstimateY2: number | null;
  revenueEstimateY3: number | null;
  epsEstimateY1: number | null;
  epsEstimateY2: number | null;
  epsEstimateY3: number | null;
  // Computed metrics
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
}

// ===== Market Data Provider Interface =====

export interface MarketDataProvider {
  getQuote(ticker: string): Promise<MarketQuote>;
  getQuotes(tickers: string[]): Promise<Map<string, MarketQuote>>;
  getHistoricalPrice(ticker: string, date: string): Promise<number | null>;
  search(query: string): Promise<SearchResult[]>;
}

// ===== User Preferences =====

export interface UserPreferences {
  darkMode: boolean;
  portfolioColumns: string[];
  favoritesColumns: string[];
  benchmarkTicker: string;
}
