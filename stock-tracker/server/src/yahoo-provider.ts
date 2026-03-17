import YahooFinance from 'yahoo-finance2';
import type { MarketDataProvider, MarketQuote, SearchResult } from './types.js';

const yahooFinance = new (YahooFinance as any)();

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const quoteCache = new Map<string, { data: MarketQuote; timestamp: number }>();

function safeNum(val: unknown): number | null {
  if (val === undefined || val === null) return null;
  if (typeof val === 'object' && val !== null && 'raw' in val) {
    return safeNum((val as any).raw);
  }
  const n = Number(val);
  if (n === 0) return 0;
  return isFinite(n) ? n : null;
}

// Fetch full data: quote + quoteSummary with financialData, defaultKeyStatistics, earningsTrend
async function fetchFullQuote(ticker: string): Promise<{ quote: any; summary: any }> {
  try {
    const [quote, summary] = await Promise.all([
      yahooFinance.quote(ticker).catch((e: any) => {
        console.warn(`quote() failed for ${ticker}:`, e.message);
        return null;
      }),
      yahooFinance.quoteSummary(ticker, {
        modules: ['defaultKeyStatistics', 'financialData', 'earningsTrend'],
      }).catch((e: any) => {
        console.warn(`quoteSummary() failed for ${ticker}:`, e.message);
        return null;
      }),
    ]);
    return { quote, summary };
  } catch (error: any) {
    console.error(`fetchFullQuote failed for ${ticker}:`, error.message);
    return { quote: null, summary: null };
  }
}

function buildMarketQuote(ticker: string, q: any, summary: any): MarketQuote {
  if (!q) return createEmptyQuote(ticker);

  const currentPrice = safeNum(q.regularMarketPrice);
  const previousClose = safeNum(q.regularMarketPreviousClose);
  const fiftyTwoWeekHigh = safeNum(q.fiftyTwoWeekHigh);
  const fiftyTwoWeekLow = safeNum(q.fiftyTwoWeekLow);
  const marketCap = safeNum(q.marketCap);

  const keyStats = summary?.defaultKeyStatistics || {};
  const fd = summary?.financialData || {};
  const earningsTrend = summary?.earningsTrend?.trend || [];

  // Day change %
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

  // Key financial data from quoteSummary
  const enterpriseValue = safeNum(keyStats.enterpriseValue);
  const ebitda = safeNum(fd.ebitda);
  const revenue = safeNum(fd.totalRevenue);
  const freeCashFlow = safeNum(fd.freeCashflow);
  const totalDebt = safeNum(fd.totalDebt);
  const totalCash = safeNum(fd.totalCash);

  // Valuation ratios
  const evToEbitda = safeNum(keyStats.enterpriseToEbitda);
  const evToRevenue = safeNum(keyStats.enterpriseToRevenue);

  // Margins (decimals → %)
  const grossMarginRaw = safeNum(fd.grossMargins);
  const grossMargin = grossMarginRaw !== null ? grossMarginRaw * 100 : null;

  const ebitMarginRaw = safeNum(fd.ebitdaMargins);
  const ebitMargin = ebitMarginRaw !== null ? ebitMarginRaw * 100 : null;

  const profitMarginRaw = safeNum(fd.profitMargins);
  const profitMargin = profitMarginRaw !== null ? profitMarginRaw * 100 : null;

  const returnOnEquityRaw = safeNum(fd.returnOnEquity);
  const returnOnEquity = returnOnEquityRaw !== null ? returnOnEquityRaw * 100 : null;

  // Growth
  const revenueGrowthRaw = safeNum(fd.revenueGrowth);
  const revenueGrowth = revenueGrowthRaw !== null ? revenueGrowthRaw * 100 : null;

  const earningsGrowthRaw = safeNum(fd.earningsGrowth);
  const earningsGrowth = earningsGrowthRaw !== null ? earningsGrowthRaw * 100 : null;

  const targetMeanPrice = safeNum(fd.targetMeanPrice);

  // Computed ratios
  const operatingIncome = safeNum(fd.operatingIncome) || safeNum(fd.ebit);
  const evToEbit = (enterpriseValue && operatingIncome && operatingIncome > 0)
    ? enterpriseValue / operatingIncome : null;
  const evToFcf = (enterpriseValue && freeCashFlow && freeCashFlow > 0)
    ? enterpriseValue / freeCashFlow : null;
  const fcfYield = (freeCashFlow && marketCap && marketCap > 0)
    ? (freeCashFlow / marketCap) * 100 : null;
  const netDebtToEbitda = (totalDebt !== null && totalCash !== null && ebitda && ebitda > 0)
    ? (totalDebt - totalCash) / ebitda : null;

  // EPS estimates from earningsTrend
  let epsEstimateY1: number | null = safeNum(q.epsForward);
  let epsEstimateY2: number | null = null;
  for (const trend of earningsTrend) {
    if (trend.period === '0y') epsEstimateY1 = safeNum(trend.earningsEstimate?.avg) || epsEstimateY1;
    if (trend.period === '+1y') epsEstimateY2 = safeNum(trend.earningsEstimate?.avg);
  }

  // Dividend yield
  const divYieldRaw = safeNum(q.trailingAnnualDividendYield);
  const dividendYield = divYieldRaw !== null ? divYieldRaw * 100 : safeNum(q.dividendYield);

  return {
    ticker,
    name: q.shortName || q.longName || ticker,
    exchange: q.fullExchangeName || q.exchange || null,
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
    const cached = quoteCache.get(ticker);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }

    const { quote: q, summary } = await fetchFullQuote(ticker);
    if (!q || !q.symbol) {
      return createEmptyQuote(ticker);
    }

    const result = buildMarketQuote(ticker, q, summary);
    quoteCache.set(ticker, { data: result, timestamp: Date.now() });
    return result;
  }

  async getQuotes(tickers: string[]): Promise<Map<string, MarketQuote>> {
    const results = new Map<string, MarketQuote>();

    // Fetch all in parallel
    const fetchPromises = tickers.map(async (ticker) => {
      const quote = await this.getQuote(ticker);
      results.set(ticker, quote);
    });

    await Promise.all(fetchPromises);
    return results;
  }

  async getHistoricalPrice(ticker: string, date: string): Promise<number | null> {
    try {
      const result = await yahooFinance.historical(ticker, {
        period1: date,
        period2: date,
      });
      if (result && result.length > 0) {
        return result[0].close ?? null;
      }
      // Fallback to current price
      const q = await yahooFinance.quote(ticker);
      return q?.regularMarketPrice ?? null;
    } catch {
      return null;
    }
  }

  async search(query: string): Promise<SearchResult[]> {
    try {
      // Try search() first (v3), fall back to autoc()
      let items: any[] = [];
      try {
        const result = await yahooFinance.search(query);
        items = result?.quotes || [];
      } catch {
        const result = await yahooFinance.autoc(query);
        items = result?.Result || result?.quotes || [];
      }

      return items
        .filter((q: any) => q.symbol)
        .slice(0, 10)
        .map((q: any) => ({
          ticker: q.symbol,
          name: q.shortname || q.longname || q.name || q.symbol,
          exchange: q.exchDisp || q.exchange || '',
          type: q.typeDisp || q.quoteType || q.type || 'EQUITY',
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
