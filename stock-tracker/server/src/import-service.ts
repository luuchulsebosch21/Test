import type { ImportReviewItem, SearchResult } from './types.js';
import { marketDataProvider } from './yahoo-provider.js';

// Common public company names to help with matching
const COMPANY_PATTERNS = [
  // Pattern: words that often appear in company names
  /\b(?:Inc|Corp|Ltd|LLC|PLC|NV|SA|AG|SE|Group|Holdings|Technologies|Semiconductor|Pharma|Energy|Financial|Capital|Industries|International|Global|Digital|Software|Systems|Networks|Solutions|Therapeutics|Biosciences|Entertainment|Communications|Enterprises|Resources|Properties|Brands|Motors|Electronics|Materials|Services|Healthcare|Aerospace|Defense|Partners)\b/i,
];

export async function extractCompaniesFromText(text: string): Promise<ImportReviewItem[]> {
  // Split text into lines and find potential company names
  const lines = text.split(/\n/);
  const candidates = new Set<string>();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length < 2 || trimmed.length > 100) continue;

    // Check if line looks like it could contain a company name
    // Strategy: look for capitalized words, company suffixes, or known patterns
    const words = trimmed.split(/\s+/);

    // If the line is mostly capitalized words (2-6 words), it might be a company name
    if (words.length >= 1 && words.length <= 8) {
      const capitalizedWords = words.filter(w => /^[A-Z]/.test(w));
      if (capitalizedWords.length >= Math.ceil(words.length * 0.5)) {
        // Clean the candidate
        const cleaned = trimmed
          .replace(/[^\w\s&.',-]/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        if (cleaned.length >= 2 && cleaned.length <= 80) {
          candidates.add(cleaned);
        }
      }
    }

    // Also look for company-like patterns within longer lines
    for (const pattern of COMPANY_PATTERNS) {
      if (pattern.test(trimmed)) {
        // Extract the phrase around the match
        const match = trimmed.match(/([A-Z][\w&.']+(?:\s+[A-Z][\w&.']*){0,5}\s+(?:Inc|Corp|Ltd|LLC|PLC|NV|SA|AG|SE|Group|Holdings|Technologies|Semiconductor|Pharma|Energy|Financial)\b\.?)/i);
        if (match) {
          candidates.add(match[1].trim());
        }
      }
    }

    // Check for ticker-like patterns (1-5 uppercase letters)
    const tickerMatch = trimmed.match(/\b([A-Z]{1,5})\b/g);
    if (tickerMatch) {
      for (const t of tickerMatch) {
        if (t.length >= 2 && t.length <= 5 && !['THE', 'AND', 'FOR', 'NOT', 'BUT', 'ARE', 'WAS', 'HAS', 'HAD', 'HER', 'HIS', 'ITS', 'OUR', 'OUT', 'ALL', 'CAN', 'WHO', 'DID', 'GET', 'MAY', 'NEW', 'OLD', 'USE', 'WAY', 'DAY', 'SAY', 'SHE', 'ONE', 'TWO'].includes(t)) {
          candidates.add(t);
        }
      }
    }
  }

  // Search Yahoo Finance for each candidate
  const results: ImportReviewItem[] = [];
  const seen = new Set<string>();

  for (const candidate of Array.from(candidates).slice(0, 30)) { // Limit to 30 candidates
    try {
      const searchResults = await marketDataProvider.search(candidate);
      if (searchResults.length > 0) {
        const best = searchResults[0];
        if (!seen.has(best.ticker)) {
          seen.add(best.ticker);
          results.push({
            extractedName: candidate,
            suggestedTicker: best.ticker,
            suggestedName: best.name,
            alternatives: searchResults.slice(0, 5),
            confirmed: false,
          });
        }
      } else {
        results.push({
          extractedName: candidate,
          suggestedTicker: null,
          suggestedName: null,
          alternatives: [],
          confirmed: false,
        });
      }
    } catch {
      results.push({
        extractedName: candidate,
        suggestedTicker: null,
        suggestedName: null,
        alternatives: [],
        confirmed: false,
      });
    }

    // Rate limit
    await new Promise((r) => setTimeout(r, 300));
  }

  return results;
}

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const pdfParse = (await import('pdf-parse')).default;
  const data = await pdfParse(buffer);
  return data.text;
}
