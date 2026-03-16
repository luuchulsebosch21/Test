import YahooFinance from 'yahoo-finance2';
import type { MarketDataProvider, MarketQuote, SearchResult } from './types.js';

// yahoo-finance2 v2.14 exports a class constructor
const yahooFinance = new (YahooFinance as any)();

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const quoteCache = new Map<string, { data: MarketQuote; timestamp: number }>();

function safeNum(val: unknown): number | null {
  if (val === undefined || val === null || val === 0) return null;
  const n = Number(val);
  return isFinite(n) ? n : null;
}

function mapQuoteToMarketQuote(ticker: string, q: any): MarketQuote {
  const currentPrice = safeNum(q.regularMarketPrice);
  const previousClose = safeNum(q.regularMarketPreviousClose);
  const fiftyTwoWeekHigh = safeNum(q.fiftyTwoWeekHigh);
  const fiftyTwoWeekLow = safeNum(q.fiftyTwoWeekLow);
  const marketCap = safeNum(q.marketCap);

  // Day change percent
  let dayChangePercent: number | null = null;
  if (q.regularMarketChangePercent !== undefined) {
    dayChangePercent = safeNum(q.regularMarketChangePercent);
  } else if (currentPrice && previousClose) {
    dayChangePercent = ((currentPrice - previousClose) / previousClose) * 100;
  }

  // Distance to 52w high/low
  let distTo52wHigh: number | null = null;
  if (currentPrice && fiftyTwoWeekHigh && fiftyTwoWeekHigh > 0) {
    distTo52wHigh = ((currentPrice - fiftyTwoWeekHigh) / fiftyTwoWeekHigh) * 100;
  }
  let distTo52wLow: number | null = null;
  if (currentPrice && fiftyTwoWeekLow && fiftyTwoWeekLow > 0) {
    distTo52wLow = ((currentPrice - fiftyTwoWeekLow) / fiftyTwoWeekLow) * 100;
  }

  return {
    ticker,
    name: q.shortName || q.longName || ticker,
    exchange: q.exchange || q.fullExchangeName || null,
    currency: q.currency || null,
    currentPrice,
    previousClose,
    dayChangePercent,
    marketCap,
    peRatio: safeNum(q.trailingPE),
    forwardPE: safeNum(q.forwardPE),
    evToEbitda: safeNum(q.enterpriseToEbitda),
    evToRevenue: safeNum(q.enterpriseToRevenue),
    priceToBook: safeNum(q.priceToBook),
    dividendYield: safeNum(q.trailingAnnualDividendYield ? (q.trailingAnnualDividendYield as number) * 100 : q.dividendYield),
    fiftyTwoWeekHigh,
    fiftyTwoWeekLow,
    grossMargin: null, // Not available in quote endpoint
    ebitMargin: null,
    profitMargin: safeNum(q.profitMargins ? (q.profitMargins as number) * 100 : null),
    returnOnEquity: null,
    freeCashFlow: null,
    totalDebt: null,
    totalCash: null,
    ebitda: safeNum(q.ebitda),
    enterpriseValue: safeNum(q.enterpriseValue),
    revenue: safeNum(q.totalRevenue || q.revenue),
    earningsGrowth: safeNum(q.earningsQuarterlyGrowth ? (q.earningsQuarterlyGrowth as number) * 100 : null),
    revenueGrowth: safeNum(q.revenueGrowth ? (q.revenueGrowth as number) * 100 : null),
    targetMeanPrice: safeNum(q.targetMeanPrice),
    performance1Y: safeNum(q.fiftyTwoWeekChangePercent),
    performance3Y: null, // Not available in quote endpoint
    revenueEstimateY1: null,
    revenueEstimateY2: null,
    revenueEstimateY3: null,
    epsEstimateY1: safeNum(q.epsForward),
    epsEstimateY2: null,
    epsEstimateY3: null,
    evToEbit: null,
    evToFcf: null,
    fcfYield: null,
    netDebtToEbitda: null,
    distTo52wHigh,
    distTo52wLow,
    lastUpdated: new Date().toISOString(),
  };
}

export class YahooFinanceProvider implements MarketDataProvider {
  async getQuote(ticker: string): Promise<MarketQuote> {
    // Check cache
    const cached = quoteCache.get(ticker);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }

    try {
      const q = await yahooFinance.quote(ticker);
      if (!q || !q.symbol) {
        return createEmptyQuote(ticker);
      }

      const quote = mapQuoteToMarketQuote(ticker, q);
      quoteCache.set(ticker, { data: quote, timestamp: Date.now() });
      return quote;
    } catch (error: any) {
      console.error(`Failed to fetch quote for ${ticker}:`, error.message);
      return createEmptyQuote(ticker);
    }
  }

  async getQuotes(tickers: string[]): Promise<Map<string, MarketQuote>> {
    const results = new Map<string, MarketQuote>();

    try {
      // yahoo-finance2 quote() accepts an array of symbols
      const quotes = await yahooFinance.quote(tickers, { return: 'array' });
      if (Array.isArray(quotes)) {
        for (const q of quotes) {
          if (q && q.symbol) {
            const ticker = tickers.find(t => t.toUpperCase() === q.symbol.toUpperCase()) || q.symbol;
            const mapped = mapQuoteToMarketQuote(ticker, q);
            quoteCache.set(ticker, { data: mapped, timestamp: Date.now() });
            results.set(ticker, mapped);
          }
        }
      }
    } catch (error: any) {
      console.error('Batch quote fetch failed, falling back to individual:', error.message);
    }

    // Fill in any missing tickers with individual calls
    for (const ticker of tickers) {
      if (!results.has(ticker)) {
        try {
          const quote = await this.getQuote(ticker);
          results.set(ticker, quote);
        } catch {
          results.set(ticker, createEmptyQuote(ticker));
        }
      }
    }

    return results;
  }

  async getHistoricalPrice(ticker: string, _date: string): Promise<number | null> {
    // historical() is not available in yahoo-finance2 v2.14
    // Fall back to current price
    try {
      const q = await yahooFinance.quote(ticker);
      return q?.regularMarketPrice ?? null;
    } catch {
      return null;
    }
  }

  async search(query: string): Promise<SearchResult[]> {
    try {
      const result = await yahooFinance.autoc(query);
      const items = result?.Result || result?.quotes || [];
      return items
        .filter((q: any) => q.symbol)
        .slice(0, 10)
        .map((q: any) => ({
          ticker: q.symbol,
          name: q.name || q.shortname || q.longname || q.symbol,
          exchange: q.exchDisp || q.exchange || '',
          type: q.typeDisp || q.type || 'EQUITY',
        }));
    } catch (error: any) {
      console.error('Search failed:', error.message);
      return [];
    }
  }
}

function createEmptyQuote(ticker: string): MarketQuote {
  return {
    ticker,
    name: ticker,
    exchange: null,
    currency: null,
    currentPrice: null,
    previousClose: null,
    dayChangePercent: null,
    marketCap: null,
    peRatio: null,
    forwardPE: null,
    evToEbitda: null,
    evToRevenue: null,
    priceToBook: null,
    dividendYield: null,
    fiftyTwoWeekHigh: null,
    fiftyTwoWeekLow: null,
    grossMargin: null,
    ebitMargin: null,
    profitMargin: null,
    returnOnEquity: null,
    freeCashFlow: null,
    totalDebt: null,
    totalCash: null,
    ebitda: null,
    enterpriseValue: null,
    revenue: null,
    earningsGrowth: null,
    revenueGrowth: null,
    targetMeanPrice: null,
    performance1Y: null,
    performance3Y: null,
    revenueEstimateY1: null,
    revenueEstimateY2: null,
    revenueEstimateY3: null,
    epsEstimateY1: null,
    epsEstimateY2: null,
    epsEstimateY3: null,
    evToEbit: null,
    evToFcf: null,
    fcfYield: null,
    netDebtToEbitda: null,
    distTo52wHigh: null,
    distTo52wLow: null,
    lastUpdated: new Date().toISOString(),
  };
}

export const marketDataProvider = new YahooFinanceProvider();
