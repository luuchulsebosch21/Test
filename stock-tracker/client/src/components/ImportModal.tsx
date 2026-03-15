import React, { useState } from 'react';
import { X, Upload, Loader2, Check, AlertCircle, Search } from 'lucide-react';
import { extractFromFile, searchTicker } from '../api';
import type { ImportReviewItem, SearchResult } from '../types';

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (items: { ticker: string; name: string; exchange?: string }[]) => void;
  title?: string;
}

export default function ImportModal({ open, onClose, onConfirm, title = 'Import from File' }: Props) {
  const [step, setStep] = useState<'upload' | 'review'>('upload');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<ImportReviewItem[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const result = await extractFromFile(file);
      setItems(result.items.map((item) => ({
        ...item,
        selectedTicker: item.suggestedTicker || '',
        selectedName: item.suggestedName || item.extractedName,
      })));
      setMessage(result.message || null);
      setStep('review');
    } catch (err: any) {
      setError(err.message || 'Failed to process file');
    }
    setLoading(false);
  };

  const toggleItem = (idx: number) => {
    setItems((prev) => prev.map((item, i) =>
      i === idx ? { ...item, confirmed: !item.confirmed } : item
    ));
  };

  const updateTicker = (idx: number, ticker: string, name?: string) => {
    setItems((prev) => prev.map((item, i) =>
      i === idx ? { ...item, selectedTicker: ticker, selectedName: name || item.selectedName } : item
    ));
  };

  const handleConfirm = () => {
    const confirmed = items
      .filter((item) => item.confirmed && item.selectedTicker)
      .map((item) => ({
        ticker: item.selectedTicker!,
        name: item.selectedName || item.extractedName,
      }));
    if (confirmed.length > 0) {
      onConfirm(confirmed);
    }
    handleClose();
  };

  const handleClose = () => {
    setStep('upload');
    setItems([]);
    setError(null);
    setMessage(null);
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/50" onClick={handleClose}>
      <div className="card w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={handleClose} className="btn-icon"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          {step === 'upload' && (
            <div className="flex flex-col items-center justify-center py-12">
              <Upload className="w-12 h-12 text-gray-400 mb-4" />
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Upload a PDF or text file to extract company names
              </p>
              <label className="btn-primary cursor-pointer">
                {loading ? (
                  <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Processing...</span>
                ) : (
                  'Choose File'
                )}
                <input
                  type="file"
                  accept=".pdf,.txt,.png,.jpg,.jpeg"
                  className="hidden"
                  onChange={handleUpload}
                  disabled={loading}
                />
              </label>
              {error && (
                <div className="mt-4 flex items-center gap-2 text-red-600 dark:text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4" />
                  {error}
                </div>
              )}
            </div>
          )}

          {step === 'review' && (
            <>
              {message && (
                <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg text-sm text-yellow-800 dark:text-yellow-200">
                  {message}
                </div>
              )}

              {items.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500 dark:text-gray-400">No companies found in the file.</p>
                  <button onClick={() => setStep('upload')} className="btn-secondary mt-4">Try Another File</button>
                </div>
              ) : (
                <>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                    Found {items.length} potential matches. Review and confirm:
                  </p>
                  <div className="space-y-2">
                    {items.map((item, idx) => (
                      <ImportReviewRow
                        key={idx}
                        item={item}
                        onToggle={() => toggleItem(idx)}
                        onUpdateTicker={(ticker, name) => updateTicker(idx, ticker, name)}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {step === 'review' && items.length > 0 && (
          <div className="flex items-center justify-between p-4 border-t border-gray-200 dark:border-gray-700">
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {items.filter((i) => i.confirmed).length} selected
            </span>
            <div className="flex gap-2">
              <button onClick={() => setStep('upload')} className="btn-secondary">Back</button>
              <button
                onClick={handleConfirm}
                disabled={items.filter((i) => i.confirmed && i.selectedTicker).length === 0}
                className="btn-primary"
              >
                Add Selected
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ImportReviewRow({
  item,
  onToggle,
  onUpdateTicker,
}: {
  item: ImportReviewItem;
  onToggle: () => void;
  onUpdateTicker: (ticker: string, name?: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const handleSearch = async () => {
    if (searchQuery.length < 2) return;
    setSearching(true);
    try {
      const results = await searchTicker(searchQuery);
      setSearchResults(results);
    } catch {
      setSearchResults([]);
    }
    setSearching(false);
  };

  return (
    <div className={`border rounded-lg p-3 transition-colors ${
      item.confirmed
        ? 'border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/20'
        : 'border-gray-200 dark:border-gray-700'
    }`}>
      <div className="flex items-center gap-3">
        <button onClick={onToggle} className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 ${
          item.confirmed
            ? 'bg-blue-600 border-blue-600'
            : 'border-gray-300 dark:border-gray-600'
        }`}>
          {item.confirmed && <Check className="w-3.5 h-3.5 text-white" />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="text-xs text-gray-400">Found: {item.extractedName}</div>
          <div className="flex items-center gap-2 mt-0.5">
            {item.selectedTicker ? (
              <span className="font-medium text-sm">{item.selectedTicker}</span>
            ) : (
              <span className="text-sm text-red-500">No ticker</span>
            )}
            {item.selectedName && (
              <span className="text-sm text-gray-500 dark:text-gray-400 truncate">{item.selectedName}</span>
            )}
          </div>
        </div>

        <button
          onClick={() => {
            setEditing(!editing);
            setSearchQuery(item.extractedName);
          }}
          className="btn-secondary text-xs px-2 py-1"
        >
          {editing ? 'Close' : 'Edit'}
        </button>
      </div>

      {/* Alternatives */}
      {!editing && item.alternatives.length > 1 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {item.alternatives.slice(0, 4).map((alt) => (
            <button
              key={alt.ticker}
              onClick={() => onUpdateTicker(alt.ticker, alt.name)}
              className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                item.selectedTicker === alt.ticker
                  ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                  : 'border-gray-200 dark:border-gray-600 hover:border-blue-300'
              }`}
            >
              {alt.ticker}
            </button>
          ))}
        </div>
      )}

      {/* Manual search */}
      {editing && (
        <div className="mt-2">
          <div className="flex gap-2">
            <input
              type="text"
              className="input-field flex-1 text-sm"
              placeholder="Search ticker or name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            <button onClick={handleSearch} disabled={searching} className="btn-secondary text-xs">
              {searching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            </button>
          </div>
          {searchResults.length > 0 && (
            <div className="mt-1 border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-100 dark:divide-gray-700 max-h-32 overflow-y-auto">
              {searchResults.map((r) => (
                <button
                  key={r.ticker}
                  onClick={() => { onUpdateTicker(r.ticker, r.name); setEditing(false); }}
                  className="w-full text-left px-2 py-1.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-xs"
                >
                  <span className="font-medium">{r.ticker}</span>
                  <span className="text-gray-400 ml-1.5">{r.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
