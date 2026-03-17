import React, { useState, useEffect } from 'react';
import { X, Search, Loader2 } from 'lucide-react';
import { searchTicker } from '../api';
import type { SearchResult } from '../types';

interface Props {
  open: boolean;
  onClose: () => void;
  onAdd: (data: { ticker: string; targetPrice?: number }) => void;
  title?: string;
  showTargetPrice?: boolean;
}

export default function AddStockModal({ open, onClose, onAdd, title = 'Add Stock', showTargetPrice = false }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTicker, setSelectedTicker] = useState('');
  const [selectedName, setSelectedName] = useState('');
  const [targetPrice, setTargetPrice] = useState('');
  const [searchTimeout, setSearchTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
      setSelectedTicker('');
      setSelectedName('');
      setTargetPrice('');
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
    if (showTargetPrice) {
      // For favorites: select ticker first, let user set target price before confirming
      setSelectedTicker(result.ticker);
      setSelectedName(result.name);
      setResults([]);
      setQuery('');
    } else {
      // For portfolio: add immediately
      onAdd({ ticker: result.ticker });
      onClose();
    }
  };

  const handleConfirmAdd = () => {
    if (!selectedTicker) return;
    onAdd({
      ticker: selectedTicker,
      targetPrice: targetPrice ? Number(targetPrice) : undefined,
    });
    onClose();
  };

  const handleTickerSubmit = () => {
    const ticker = query.trim().toUpperCase();
    if (!ticker) return;
    if (showTargetPrice) {
      setSelectedTicker(ticker);
      setSelectedName(ticker);
      setResults([]);
      setQuery('');
    } else {
      onAdd({ ticker });
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
          {!selectedTicker ? (
            <>
              {/* Search / ticker input */}
              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  className="input-field pl-9"
                  placeholder="Zoek op naam of voer ticker in..."
                  value={query}
                  onChange={(e) => handleSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && results.length === 0 && query.trim()) {
                      handleTickerSubmit();
                    }
                  }}
                  autoFocus
                />
                {loading && <Loader2 className="absolute right-3 top-2.5 w-4 h-4 text-gray-400 animate-spin" />}
              </div>

              <p className="text-xs text-gray-400 mt-1.5">Typ een ticker (bijv. MSFT) en druk Enter, of zoek op bedrijfsnaam</p>

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
            </>
          ) : (
            <>
              {/* Selected ticker + target price */}
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 mb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-bold text-blue-700 dark:text-blue-400">{selectedTicker}</span>
                    <span className="text-gray-600 dark:text-gray-300 text-sm ml-2">{selectedName}</span>
                  </div>
                  <button
                    onClick={() => { setSelectedTicker(''); setSelectedName(''); }}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {showTargetPrice && (
                <div className="mb-4">
                  <label className="text-sm text-gray-600 dark:text-gray-400 block mb-1">Alarm Price (optioneel)</label>
                  <input
                    type="number"
                    className="input-field w-full"
                    placeholder="Voer je alarm price in..."
                    value={targetPrice}
                    onChange={(e) => setTargetPrice(e.target.value)}
                    step="0.01"
                    autoFocus
                  />
                  <p className="text-xs text-gray-400 mt-1">Je krijgt een melding als de koers onder deze prijs komt</p>
                </div>
              )}

              <button onClick={handleConfirmAdd} className="btn-primary w-full">
                Toevoegen
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
