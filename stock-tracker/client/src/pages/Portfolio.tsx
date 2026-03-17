import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Upload, Trash2, RefreshCw, Download, ArrowUpDown, Loader2, Clock } from 'lucide-react';
import type { PortfolioItem, MarketQuote } from '../types';
import { ALL_COLUMNS, DEFAULT_PORTFOLIO_COLUMNS } from '../types';
import { getPortfolio, addPortfolioItem, addPortfolioBatch, deletePortfolioItem, getQuotes } from '../api';
import { formatValue, getPercentColor, exportToCsv } from '../utils';
import ColumnPicker from '../components/ColumnPicker';
import AddStockModal from '../components/AddStockModal';
import ImportModal from '../components/ImportModal';
import ConfirmDialog from '../components/ConfirmDialog';

export default function Portfolio() {
  const [items, setItems] = useState<PortfolioItem[]>([]);
  const [quotes, setQuotes] = useState<Record<string, MarketQuote>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [columns, setColumns] = useState<string[]>(() => {
    const stored = localStorage.getItem('portfolioColumns');
    return stored ? JSON.parse(stored) : DEFAULT_PORTFOLIO_COLUMNS;
  });
  const [sortKey, setSortKey] = useState<string>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [filter, setFilter] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [deleteItem, setDeleteItem] = useState<PortfolioItem | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const data = await getPortfolio();
      setItems(data);
      if (data.length > 0) {
        const tickers = data.map((d) => d.ticker);
        const q = await getQuotes(tickers);
        setQuotes(q);
        setLastUpdated(new Date().toLocaleTimeString());
      }
    } catch (err) {
      console.error('Failed to load portfolio:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    localStorage.setItem('portfolioColumns', JSON.stringify(columns));
  }, [columns]);

  const handleRefresh = async () => {
    setRefreshing(true);
    if (items.length > 0) {
      try {
        const q = await getQuotes(items.map((i) => i.ticker));
        setQuotes(q);
        setLastUpdated(new Date().toLocaleTimeString());
      } catch (err) {
        console.error('Refresh failed:', err);
      }
    }
    setRefreshing(false);
  };

  const handleAdd = async (data: { ticker: string }) => {
    try {
      const added = await addPortfolioItem(data.ticker);
      setItems((prev) => [...prev, added]);
      const q = await getQuotes([added.ticker]);
      setQuotes((prev) => ({ ...prev, ...q }));
    } catch (err: any) {
      alert('Failed to add: ' + err.message);
    }
  };

  const handleImport = async (importedItems: { ticker: string; name: string; exchange?: string }[]) => {
    try {
      const tickers = importedItems.map(i => i.ticker);
      const added = await addPortfolioBatch(tickers);
      setItems((prev) => [...prev, ...added]);
      const q = await getQuotes(added.map((a: PortfolioItem) => a.ticker));
      setQuotes((prev) => ({ ...prev, ...q }));
    } catch (err: any) {
      alert('Import failed: ' + err.message);
    }
  };

  const handleDelete = async () => {
    if (!deleteItem) return;
    try {
      await deletePortfolioItem(deleteItem.id);
      setItems((prev) => prev.filter((i) => i.id !== deleteItem.id));
    } catch (err: any) {
      alert('Delete failed: ' + err.message);
    }
    setDeleteItem(null);
  };

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const handleExport = () => {
    const headers = ['Name', 'Ticker', 'Exchange', 'Currency', ...columns.map((c) => ALL_COLUMNS.find((ac) => ac.key === c)?.label || c)];
    const rows = sortedItems.map((item) => {
      const q = quotes[item.ticker];
      return [
        item.name,
        item.ticker,
        item.exchange || '',
        item.currency || q?.currency || '',
        ...columns.map((c) => {
          const col = ALL_COLUMNS.find((ac) => ac.key === c);
          if (!col || !q) return 'n/a';
          const val = col.getValue(q);
          return val !== null ? String(val) : 'n/a';
        }),
      ];
    });
    exportToCsv(headers, rows, 'portfolio.csv');
  };

  // Filter and sort
  const filteredItems = items.filter((item) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return item.name.toLowerCase().includes(q) || item.ticker.toLowerCase().includes(q);
  });

  const sortedItems = [...filteredItems].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    if (sortKey === 'name') return dir * a.name.localeCompare(b.name);
    if (sortKey === 'ticker') return dir * a.ticker.localeCompare(b.ticker);
    const colDef = ALL_COLUMNS.find((c) => c.key === sortKey);
    if (colDef) {
      const qa = quotes[a.ticker];
      const qb = quotes[b.ticker];
      const va = qa ? colDef.getValue(qa) : null;
      const vb = qb ? colDef.getValue(qb) : null;
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      return dir * (Number(va) - Number(vb));
    }
    return 0;
  });

  const activeColumns = columns.map((key) => ALL_COLUMNS.find((c) => c.key === key)).filter(Boolean);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold">Portefeuille</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{items.length} holdings</p>
        </div>
        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <Clock className="w-3 h-3" /> {lastUpdated}
            </span>
          )}
          <button onClick={handleRefresh} disabled={refreshing} className="btn-secondary flex items-center gap-1.5">
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <ColumnPicker selectedColumns={columns} onChange={setColumns} />
          <button onClick={handleExport} className="btn-secondary flex items-center gap-1.5">
            <Download className="w-4 h-4" />
            CSV
          </button>
          <button onClick={() => setShowImport(true)} className="btn-secondary flex items-center gap-1.5">
            <Upload className="w-4 h-4" />
            Import
          </button>
          <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-1.5">
            <Plus className="w-4 h-4" />
            Add
          </button>
        </div>
      </div>

      {/* Filter */}
      <div className="mb-3">
        <input
          type="text"
          className="input-field max-w-sm"
          placeholder="Filter by name or ticker..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      {/* Table */}
      {sortedItems.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-gray-500 dark:text-gray-400">
            {items.length === 0
              ? 'Nog geen holdings. Voeg stocks toe om je portefeuille te monitoren.'
              : 'Geen resultaten voor je filter.'}
          </p>
          {items.length === 0 && (
            <button onClick={() => setShowAdd(true)} className="btn-primary mt-4">
              <Plus className="w-4 h-4 inline mr-1" />
              Voeg je eerste stock toe
            </button>
          )}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-max">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="table-header" onClick={() => handleSort('name')}>
                  <span className="flex items-center gap-1">
                    Name {sortKey === 'name' && <ArrowUpDown className="w-3 h-3" />}
                  </span>
                </th>
                <th className="table-header" onClick={() => handleSort('ticker')}>
                  <span className="flex items-center gap-1">
                    Ticker {sortKey === 'ticker' && <ArrowUpDown className="w-3 h-3" />}
                  </span>
                </th>
                <th className="table-header">Ccy</th>
                {activeColumns.map((col) => (
                  <th key={col!.key} className="table-header text-right" onClick={() => handleSort(col!.key)}>
                    <span className="flex items-center justify-end gap-1">
                      {col!.label} {sortKey === col!.key && <ArrowUpDown className="w-3 h-3" />}
                    </span>
                  </th>
                ))}
                <th className="table-header w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {sortedItems.map((item) => {
                const q = quotes[item.ticker];
                return (
                  <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="table-cell font-medium max-w-[200px] truncate">{q?.name || item.name}</td>
                    <td className="table-cell text-blue-600 dark:text-blue-400 font-mono text-xs">{item.ticker}</td>
                    <td className="table-cell text-gray-400 text-xs">{q?.currency || item.currency || '-'}</td>
                    {activeColumns.map((col) => {
                      const val = q ? col!.getValue(q) : null;
                      const formatted = formatValue(val, col!.format);
                      const colorClass = col!.format === 'percent' ? getPercentColor(val as number | null) : '';
                      return (
                        <td key={col!.key} className={`table-cell text-right font-mono text-xs ${colorClass}`}>
                          {formatted}
                        </td>
                      );
                    })}
                    <td className="table-cell">
                      <button
                        onClick={() => setDeleteItem(item)}
                        className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      <AddStockModal open={showAdd} onClose={() => setShowAdd(false)} onAdd={handleAdd} title="Toevoegen aan Portefeuille" />
      <ImportModal open={showImport} onClose={() => setShowImport(false)} onConfirm={handleImport} title="Import naar Portefeuille" />
      <ConfirmDialog
        open={!!deleteItem}
        title="Verwijderen uit Portefeuille"
        message={`${deleteItem?.name} (${deleteItem?.ticker}) verwijderen uit je portefeuille?`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteItem(null)}
      />
    </div>
  );
}
