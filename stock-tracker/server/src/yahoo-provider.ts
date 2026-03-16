import yahooFinance from 'yahoo-finance2';
import type { MarketDataProvider, MarketQuote, SearchResult } from './types.js';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const quoteCache = new Map<string, { data: MarketQuote; timestamp: number }>();

function safeNum(val: unknown): number | null {
  if (val === undefined || val === null || val === 0) return null;
  const n = Number(val);
  return isFinite(n) ? n : null;
}

function computeDerived(q: Partial<MarketQuote>): Partial<MarketQuote> {
  const ev = q.enterpriseValue;
  const ebitda = q.ebitda;
  const fcf = q.freeCashFlow;
  const price = q.currentPrice;
  const mcap = q.marketCap;

  // EV/EBIT: approximate EBIT = EBITDA * ebitMargin/ebitdaMargin if available
  // Actually, we can compute from ebitMargin and revenue
  let evToEbit: number | null = null;
  if (ev && q.ebitMargin && q.revenue) {
    const ebit = q.revenue * q.ebitMargin;
    if (ebit > 0) evToEbit = ev / ebit;
  }

  let evToFcf: number | null = null;
  if (ev && fcf && fcf > 0) {
    evToFcf = ev / fcf;
  }

  let fcfYield: number | null = null;
  if (fcf && mcap && mcap > 0) {
    fcfYield = (fcf / mcap) * 100;
  }

  let netDebtToEbitda: number | null = null;
  if (q.totalDebt !== null && q.totalDebt !== undefined &&
      q.totalCash !== null && q.totalCash !== undefined && ebitda && ebitda > 0) {
    netDebtToEbitda = ((q.totalDebt ?? 0) - (q.totalCash ?? 0)) / ebitda;
  }

  let distTo52wHigh: number | null = null;
  if (price && q.fiftyTwoWeekHigh && q.fiftyTwoWeekHigh > 0) {
    distTo52wHigh = ((price - q.fiftyTwoWeekHigh) / q.fiftyTwoWeekHigh) * 100;
  }

  let distTo52wLow: number | null = null;
  if (price && q.fiftyTwoWeekLow && q.fiftyTwoWeekLow > 0) {
    distTo52wLow = ((price - q.fiftyTwoWeekLow) / q.fiftyTwoWeekLow) * 100;
  }

  return { evToEbit, evToFcf, fcfYield, netDebtToEbitda, distTo52wHigh, distTo52wLow };
}

async function fetchPerformance(ticker: string): Promise<{ perf1Y: number | null; perf3Y: number | null }> {
  try {
    const now = new Date();
    const oneYearAgo = new Date(now);
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const threeYearsAgo = new Date(now);
    threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);

    const historical = await yahooFinance.historical(ticker, {
      period1: threeYearsAgo.toISOString().split('T')[0],
      period2: now.toISOString().split('T')[0],
      interval: '1mo',
    });

    if (!historical || historical.length === 0) return { perf1Y: null, perf3Y: null };

    const latestPrice = historical[historical.length - 1]?.close;
    if (!latestPrice) return { perf1Y: null, perf3Y: null };

    // Find closest to 1 year ago
    let perf1Y: number | null = null;
    const target1Y = oneYearAgo.getTime();
    let closest1Y = historical[0];
    for (const h of historical) {
      if (Math.abs(new Date(h.date).getTime() - target1Y) <
          Math.abs(new Date(closest1Y.date).getTime() - target1Y)) {
        closest1Y = h;
      }
    }
    if (closest1Y?.close && closest1Y.close > 0) {
      perf1Y = ((latestPrice - closest1Y.close) / closest1Y.close) * 100;
    }

    // 3 year performance
    let perf3Y: number | null = null;
    const first = historical[0];
    if (first?.close && first.close > 0) {
      perf3Y = ((latestPrice - first.close) / first.close) * 100;
    }

    return { perf1Y, perf3Y };
  } catch {
    return { perf1Y: null, perf3Y: null };
  }
}

export class YahooFinanceProvider implements MarketDataProvider {
  async getQuote(ticker: string): Promise<MarketQuote> {
    // Check cache
    const cached = quoteCache.get(ticker);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }

    try {
      const [summary, perf] = await Promise.all([
        yahooFinance.quoteSummary(ticker, {
          modules: [
            'price',
            'summaryDetail',
            'defaultKeyStatistics',
            'financialData',
            'earningsTrend',
          ],
        }),
        fetchPerformance(ticker),
      ]);

      const price = summary.price;
      const detail = summary.summaryDetail;
      const stats = summary.defaultKeyStatistics;
      const fin = summary.financialData;
      const trend = summary.earningsTrend;

      // Extract forward estimates from earningsTrend
      let epsEstimateY1: number | null = null;
      let epsEstimateY2: number | null = null;
      let revenueEstimateY1: number | null = null;
      let revenueEstimateY2: number | null = null;

      if (trend?.trend) {
        for (const t of trend.trend) {
          if (t.period === '+1y') {
            epsEstimateY1 = safeNum(t.earningsEstimate?.avg);
            revenueEstimateY1 = safeNum(t.revenueEstimate?.avg);
          }
          if (t.period === '+2y' || t.period === '+5y') {
            epsEstimateY2 = safeNum(t.earningsEstimate?.avg);
            revenueEstimateY2 = safeNum(t.revenueEstimate?.avg);
          }
        }
      }

      const quote: MarketQuote = {
        ticker,
        name: price?.shortName || price?.longName || ticker,
        exchange: price?.exchangeName || null,
        currency: price?.currency || null,
        currentPrice: safeNum(price?.regularMarketPrice),
        previousClose: safeNum(detail?.previousClose ?? price?.regularMarketPreviousClose),
        dayChangePercent: safeNum(price?.regularMarketChangePercent
          ? (price.regularMarketChangePercent as number) * 100
          : null),
        marketCap: safeNum(price?.marketCap),
        peRatio: safeNum(detail?.trailingPE ?? stats?.trailingEps),
        forwardPE: safeNum(detail?.forwardPE ?? stats?.forwardPE),
        evToEbitda: safeNum(stats?.enterpriseToEbitda),
        evToRevenue: safeNum(stats?.enterpriseToRevenue),
        priceToBook: safeNum(stats?.priceToBook),
        dividendYield: safeNum(detail?.dividendYield ? (detail.dividendYield as number) * 100 : null),
        fiftyTwoWeekHigh: safeNum(detail?.fiftyTwoWeekHigh),
        fiftyTwoWeekLow: safeNum(detail?.fiftyTwoWeekLow),
        grossMargin: safeNum(fin?.grossMargins ? (fin.grossMargins as number) * 100 : null),
        ebitMargin: safeNum(fin?.ebitdaMargins ? (fin.ebitdaMargins as number) * 100 : null),
        profitMargin: safeNum(fin?.profitMargins ? (fin.profitMargins as number) * 100 : null),
        returnOnEquity: safeNum(fin?.returnOnEquity ? (fin.returnOnEquity as number) * 100 : null),
        freeCashFlow: safeNum(fin?.freeCashflow),
        totalDebt: safeNum(fin?.totalDebt),
        totalCash: safeNum(fin?.totalCash),
        ebitda: safeNum(fin?.ebitda),
        enterpriseValue: safeNum(stats?.enterpriseValue),
        revenue: safeNum(fin?.totalRevenue),
        earningsGrowth: safeNum(fin?.earningsGrowth ? (fin.earningsGrowth as number) * 100 : null),
        revenueGrowth: safeNum(fin?.revenueGrowth ? (fin.revenueGrowth as number) * 100 : null),
        targetMeanPrice: safeNum(fin?.targetMeanPrice),
        performance1Y: perf.perf1Y !== null ? Math.round(perf.perf1Y * 100) / 100 : null,
        performance3Y: perf.perf3Y !== null ? Math.round(perf.perf3Y * 100) / 100 : null,
        revenueEstimateY1,
        revenueEstimateY2,
        revenueEstimateY3: null,
        epsEstimateY1,
        epsEstimateY2,
        epsEstimateY3: null,
        evToEbit: null,
        evToFcf: null,
        fcfYield: null,
        netDebtToEbitda: null,
        distTo52wHigh: null,
        distTo52wLow: null,
        lastUpdated: new Date().toISOString(),
      };

      // Compute derived metrics
      const derived = computeDerived(quote);
      Object.assign(quote, derived);

      // Fix P/E - use trailingPE from summaryDetail which is the standard P/E
      if (detail?.trailingPE) {
        quote.peRatio = safeNum(detail.trailingPE);
      }

      // Fix dayChangePercent - yahoo-finance2 returns it as a fraction
      if (price?.regularMarketChangePercent !== undefined) {
        const raw = price.regularMarketChangePercent as number;
        // If it looks like it's already a percentage (>1 or <-1), keep it, otherwise multiply
        quote.dayChangePercent = Math.abs(raw) < 0.5 ? raw * 100 : raw;
      }

      quoteCache.set(ticker, { data: quote, timestamp: Date.now() });
      return quote;
    } catch (error: any) {
      console.error(`Failed to fetch quote for ${ticker}:`, error.message);
      return createEmptyQuote(ticker);
    }
  }

  async getQuotes(tickers: string[]): Promise<Map<string, MarketQuote>> {
    const results = new Map<string, MarketQuote>();
    // Fetch in batches of 5 to avoid rate limiting
    const batchSize = 5;
    for (let i = 0; i < tickers.length; i += batchSize) {
      const batch = tickers.slice(i, i + batchSize);
      const promises = batch.map((t) => this.getQuote(t));
      const quotes = await Promise.allSettled(promises);
      quotes.forEach((result, idx) => {
        if (result.status === 'fulfilled') {
          results.set(batch[idx], result.value);
        } else {
          results.set(batch[idx], createEmptyQuote(batch[idx]));
        }
      });
      // Small delay between batches
      if (i + batchSize < tickers.length) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    return results;
  }

  async getHistoricalPrice(ticker: string, date: string): Promise<number | null> {
    try {
      const targetDate = new Date(date);
      const dayBefore = new Date(targetDate);
      dayBefore.setDate(dayBefore.getDate() - 5); // Look back 5 days for weekends
      const dayAfter = new Date(targetDate);
      dayAfter.setDate(dayAfter.getDate() + 5);

      const historical = await yahooFinance.historical(ticker, {
        period1: dayBefore.toISOString().split('T')[0],
        period2: dayAfter.toISOString().split('T')[0],
        interval: '1d',
      });

      if (!historical || historical.length === 0) return null;

      // Find the closest date to target
      let closest = historical[0];
      const targetTime = targetDate.getTime();
      for (const h of historical) {
        if (Math.abs(new Date(h.date).getTime() - targetTime) <
            Math.abs(new Date(closest.date).getTime() - targetTime)) {
          closest = h;
        }
      }
      return closest?.close ?? null;
    } catch {
      return null;
    }
  }

  async search(query: string): Promise<SearchResult[]> {
    try {
      const result = await yahooFinance.search(query, { newsCount: 0 });
      return (result.quotes || [])
        .filter((q: any) => q.symbol && (q.quoteType === 'EQUITY' || q.quoteType === 'ETF'))
        .slice(0, 10)
        .map((q: any) => ({
          ticker: q.symbol,
          name: q.shortname || q.longname || q.symbol,
          exchange: q.exchange || '',
          type: q.quoteType || 'EQUITY',
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
