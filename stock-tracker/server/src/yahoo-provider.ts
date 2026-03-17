import YahooFinance from 'yahoo-finance2';
import type { MarketDataProvider, MarketQuote, SearchResult } from './types.js';

// yahoo-finance2 v2.14 exports a class constructor
const yahooFinance = new (YahooFinance as any)();

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const quoteCache = new Map<string, { data: MarketQuote; timestamp: number }>();
const summaryCache = new Map<string, { data: any; timestamp: number }>();

function safeNum(val: unknown): number | null {
  if (val === undefined || val === null) return null;
  // For objects with 'raw' property (Yahoo API format)
  if (typeof val === 'object' && val !== null && 'raw' in val) {
    return safeNum((val as any).raw);
  }
  const n = Number(val);
  if (n === 0) return 0; // Allow zero as a valid value
  return isFinite(n) ? n : null;
}

// Fetch detailed financial data directly from Yahoo Finance quoteSummary API
async function fetchQuoteSummary(ticker: string): Promise<any> {
  const cached = summaryCache.get(ticker);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const modules = [
    'defaultKeyStatistics',
    'financialData',
    'earningsTrend',
  ].join(',');

  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=${modules}`;

  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!resp.ok) {
      console.warn(`quoteSummary HTTP ${resp.status} for ${ticker}`);
      return null;
    }

    const json = await resp.json() as any;
    const result = json?.quoteSummary?.result?.[0] || null;
    if (result) {
      summaryCache.set(ticker, { data: result, timestamp: Date.now() });
    }
    return result;
  } catch (error: any) {
    console.warn(`quoteSummary fetch failed for ${ticker}:`, error.message);
    return null;
  }
}

function mapQuoteToMarketQuote(ticker: string, q: any, summary?: any): MarketQuote {
  const currentPrice = safeNum(q.regularMarketPrice);
  const previousClose = safeNum(q.regularMarketPreviousClose);
  const fiftyTwoWeekHigh = safeNum(q.fiftyTwoWeekHigh);
  const fiftyTwoWeekLow = safeNum(q.fiftyTwoWeekLow);
  const marketCap = safeNum(q.marketCap);

  const keyStats = summary?.defaultKeyStatistics || {};
  const financialData = summary?.financialData || {};
  const earningsTrend = summary?.earningsTrend?.trend || [];

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

  // Enterprise value & related
  const enterpriseValue = safeNum(keyStats.enterpriseValue) || safeNum(q.enterpriseValue);
  const ebitda = safeNum(financialData.ebitda) || safeNum(q.ebitda);
  const revenue = safeNum(financialData.totalRevenue) || safeNum(q.totalRevenue) || safeNum(q.revenue);
  const freeCashFlow = safeNum(financialData.freeCashflow);
  const totalDebt = safeNum(financialData.totalDebt);
  const totalCash = safeNum(financialData.totalCash);

  // Valuation ratios from keyStats
  const evToEbitda = safeNum(keyStats.enterpriseToEbitda) || safeNum(q.enterpriseToEbitda);
  const evToRevenue = safeNum(keyStats.enterpriseToRevenue) || safeNum(q.enterpriseToRevenue);

  // Margins (stored as decimals in Yahoo API, convert to %)
  const grossMarginRaw = safeNum(financialData.grossMargins);
  const grossMargin = grossMarginRaw !== null ? grossMarginRaw * 100 : null;

  const ebitMarginRaw = safeNum(financialData.ebitdaMargins);
  const ebitMargin = ebitMarginRaw !== null ? ebitMarginRaw * 100 : null;

  const profitMarginRaw = safeNum(financialData.profitMargins) || safeNum(q.profitMargins);
  const profitMargin = profitMarginRaw !== null ? profitMarginRaw * 100 : null;

  const returnOnEquityRaw = safeNum(financialData.returnOnEquity);
  const returnOnEquity = returnOnEquityRaw !== null ? returnOnEquityRaw * 100 : null;

  // Growth metrics
  const revenueGrowthRaw = safeNum(financialData.revenueGrowth) || safeNum(q.revenueGrowth);
  const revenueGrowth = revenueGrowthRaw !== null ? revenueGrowthRaw * 100 : null;

  const earningsGrowthRaw = safeNum(financialData.earningsGrowth) || safeNum(q.earningsQuarterlyGrowth);
  const earningsGrowth = earningsGrowthRaw !== null ? earningsGrowthRaw * 100 : null;

  const targetMeanPrice = safeNum(financialData.targetMeanPrice) || safeNum(q.targetMeanPrice);

  // Computed: EV/EBIT
  let evToEbit: number | null = null;
  const operatingIncome = safeNum(financialData.operatingIncome) || safeNum(financialData.ebit);
  if (enterpriseValue && operatingIncome && operatingIncome > 0) {
    evToEbit = enterpriseValue / operatingIncome;
  }

  // Computed: EV/FCF
  let evToFcf: number | null = null;
  if (enterpriseValue && freeCashFlow && freeCashFlow > 0) {
    evToFcf = enterpriseValue / freeCashFlow;
  }

  // Computed: FCF Yield
  let fcfYield: number | null = null;
  if (freeCashFlow && marketCap && marketCap > 0) {
    fcfYield = (freeCashFlow / marketCap) * 100;
  }

  // Computed: Net Debt / EBITDA
  let netDebtToEbitda: number | null = null;
  if (totalDebt !== null && totalCash !== null && ebitda && ebitda > 0) {
    netDebtToEbitda = (totalDebt - totalCash) / ebitda;
  }

  // EPS estimates from earningsTrend
  let epsEstimateY1: number | null = safeNum(q.epsForward);
  let epsEstimateY2: number | null = null;
  if (earningsTrend.length > 0) {
    // earningsTrend typically has: 0q, +1q, 0y, +1y
    for (const trend of earningsTrend) {
      const period = trend.period;
      if (period === '0y') epsEstimateY1 = safeNum(trend.earningsEstimate?.avg) || epsEstimateY1;
      if (period === '+1y') epsEstimateY2 = safeNum(trend.earningsEstimate?.avg);
    }
  }

  // Dividend yield
  const divYieldRaw = safeNum(q.trailingAnnualDividendYield);
  const dividendYield = divYieldRaw !== null ? divYieldRaw * 100 : safeNum(q.dividendYield);

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
    forwardPE: safeNum(keyStats.forwardPE) || safeNum(q.forwardPE),
    evToEbitda,
    evToRevenue,
    priceToBook: safeNum(keyStats.priceToBook) || safeNum(q.priceToBook),
    dividendYield,
    fiftyTwoWeekHigh,
    fiftyTwoWeekLow,
    grossMargin,
    ebitMargin,
    profitMargin,
    returnOnEquity,
    freeCashFlow,
    totalDebt,
    totalCash,
    ebitda,
    enterpriseValue,
    revenue,
    earningsGrowth,
    revenueGrowth,
    targetMeanPrice,
    performance1Y: safeNum(q.fiftyTwoWeekChangePercent),
    performance3Y: null,
    revenueEstimateY1: null,
    revenueEstimateY2: null,
    revenueEstimateY3: null,
    epsEstimateY1,
    epsEstimateY2,
    epsEstimateY3: null,
    evToEbit,
    evToFcf,
    fcfYield,
    netDebtToEbitda,
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
      // Fetch quote and summary in parallel
      const [q, summary] = await Promise.all([
        yahooFinance.quote(ticker),
        fetchQuoteSummary(ticker),
      ]);

      if (!q || !q.symbol) {
        return createEmptyQuote(ticker);
      }

      const quote = mapQuoteToMarketQuote(ticker, q, summary);
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
      // Fetch all quotes and summaries in parallel
      const [quotes, ...summaries] = await Promise.all([
        yahooFinance.quote(tickers, { return: 'array' }),
        ...tickers.map(t => fetchQuoteSummary(t)),
      ]);

      const summaryMap = new Map<string, any>();
      tickers.forEach((t, i) => {
        if (summaries[i]) summaryMap.set(t.toUpperCase(), summaries[i]);
      });

      if (Array.isArray(quotes)) {
        for (const q of quotes) {
          if (q && q.symbol) {
            const ticker = tickers.find(t => t.toUpperCase() === q.symbol.toUpperCase()) || q.symbol;
            const summary = summaryMap.get(ticker.toUpperCase());
            const mapped = mapQuoteToMarketQuote(ticker, q, summary);
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
