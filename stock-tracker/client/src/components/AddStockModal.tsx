import React, { useState, useEffect } from 'react';
import { X, Search, Loader2 } from 'lucide-react';
import { searchTicker } from '../api';
import type { SearchResult } from '../types';

interface Props {
  open: boolean;
  onClose: () => void;
  onAdd: (item: { ticker: string; name: string; exchange?: string }) => void;
  title?: string;
}

export default function AddStockModal({ open, onClose, onAdd, title = 'Add Stock' }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [manualTicker, setManualTicker] = useState('');
  const [manualName, setManualName] = useState('');
  const [searchTimeout, setSearchTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
      setManualTicker('');
      setManualName('');
    }
  }, [open]);

  const handleSearch = (value: string) => {
    setQuery(value);
    if (searchTimeout) clearTimeout(searchTimeout);
    if (value.length < 2) {
      setResults([]);
      return;
    }
    setSearchTimeout(
      setTimeout(async () => {
        setLoading(true);
        try {
          const res = await searchTicker(value);
          setResults(res);
        } catch {
          setResults([]);
        }
        setLoading(false);
      }, 400)
    );
  };

  const handleSelect = (result: SearchResult) => {
    onAdd({ ticker: result.ticker, name: result.name, exchange: result.exchange });
    onClose();
  };

  const handleManualAdd = () => {
    if (manualTicker.trim() && manualName.trim()) {
      onAdd({ ticker: manualTicker.trim().toUpperCase(), name: manualName.trim() });
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/50" onClick={onClose}>
      <div className="card w-full max-w-lg mx-4 max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="btn-icon"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            <input
              type="text"
              className="input-field pl-9"
              placeholder="Search by company name or ticker..."
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              autoFocus
            />
            {loading && <Loader2 className="absolute right-3 top-2.5 w-4 h-4 text-gray-400 animate-spin" />}
          </div>

          {/* Results */}
          {results.length > 0 && (
            <div className="mt-3 max-h-60 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-100 dark:divide-gray-700">
              {results.map((r) => (
                <button
                  key={r.ticker}
                  onClick={() => handleSelect(r)}
                  className="w-full text-left px-3 py-2.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium text-sm">{r.ticker}</span>
                      <span className="text-gray-500 dark:text-gray-400 text-sm ml-2">{r.name}</span>
                    </div>
                    <span className="text-xs text-gray-400">{r.exchange}</span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Manual entry */}
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Or add manually:</p>
            <div className="flex gap-2">
              <input
                type="text"
                className="input-field w-28"
                placeholder="Ticker"
                value={manualTicker}
                onChange={(e) => setManualTicker(e.target.value.toUpperCase())}
              />
              <input
                type="text"
                className="input-field flex-1"
                placeholder="Company name"
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
              />
              <button
                onClick={handleManualAdd}
                disabled={!manualTicker.trim() || !manualName.trim()}
                className="btn-primary whitespace-nowrap"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
