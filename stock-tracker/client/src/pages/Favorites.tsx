import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Upload, Trash2, RefreshCw, Download, ArrowUpDown, Loader2, Clock, Edit2, X, Check, Bell, BellRing, Tag } from 'lucide-react';
import type { FavoriteItem, MarketQuote } from '../types';
import { ALL_COLUMNS, DEFAULT_FAVORITES_COLUMNS, AVAILABLE_TAGS } from '../types';
import { getFavorites, addFavorite, addFavoritesBatch, updateFavorite, deleteFavorite, getQuotes } from '../api';
import { formatValue, formatPercent, getPercentColor, calcTargetDiffPercent, exportToCsv } from '../utils';
import ColumnPicker from '../components/ColumnPicker';
import AddStockModal from '../components/AddStockModal';
import ImportModal from '../components/ImportModal';
import ConfirmDialog from '../components/ConfirmDialog';

const TARGET_COLUMN = { key: 'targetDiffPercent', label: 'vs Alarm' };

// Track which tickers already triggered a notification (avoid spam)
const notifiedTickers = new Set<string>();

function sendTargetNotification(ticker: string, name: string, currentPrice: number, targetPrice: number) {
  if (notifiedTickers.has(ticker)) return;
  notifiedTickers.add(ticker);

  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(`${ticker} onder alarm price!`, {
      body: `${name} staat op ${currentPrice.toFixed(2)} — onder je alarm price van ${targetPrice.toFixed(2)}`,
      icon: '/favicon.ico',
    });
  }
}

export default function Favorites() {
  const [items, setItems] = useState<FavoriteItem[]>([]);
  const [quotes, setQuotes] = useState<Record<string, MarketQuote>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [columns, setColumns] = useState<string[]>(() => {
    const stored = localStorage.getItem('favoritesColumns');
    return stored ? JSON.parse(stored) : DEFAULT_FAVORITES_COLUMNS;
  });
  const [sortKey, setSortKey] = useState<string>('targetDiffPercent');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [filter, setFilter] = useState('');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<FavoriteItem | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<{target_price: string; notes: string; tags: string[]}>({ target_price: '', notes: '', tags: [] });
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  // Request notification permission on mount
  useEffect(() => {
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        setNotificationsEnabled(true);
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then((perm) => {
          setNotificationsEnabled(perm === 'granted');
        });
      }
    }
  }, []);

  // Check for target price alerts whenever quotes update
  const checkAlerts = useCallback((currentItems: FavoriteItem[], currentQuotes: Record<string, MarketQuote>) => {
    for (const item of currentItems) {
      if (item.target_price === null || item.target_price === undefined) continue;
      const q = currentQuotes[item.ticker];
      if (!q?.currentPrice) continue;
      if (q.currentPrice <= item.target_price) {
        sendTargetNotification(item.ticker, q.name || item.name, q.currentPrice, item.target_price);
      } else {
        // Price recovered above target: reset so we can notify again if it drops
        notifiedTickers.delete(item.ticker);
      }
    }
  }, []);

  const loadData = useCallback(async () => {
    try {
      const data = await getFavorites();
      setItems(data);
      if (data.length > 0) {
        const q = await getQuotes(data.map((d) => d.ticker));
        setQuotes(q);
        setLastUpdated(new Date().toLocaleTimeString());
        checkAlerts(data, q);
      }
    } catch (err) {
      console.error('Failed to load favorites:', err);
    }
    setLoading(false);
  }, [checkAlerts]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { localStorage.setItem('favoritesColumns', JSON.stringify(columns)); }, [columns]);

  const handleRefresh = async () => {
    setRefreshing(true);
    if (items.length > 0) {
      try {
        const q = await getQuotes(items.map((i) => i.ticker));
        setQuotes(q);
        setLastUpdated(new Date().toLocaleTimeString());
        checkAlerts(items, q);
      } catch {}
    }
    setRefreshing(false);
  };

  const handleAdd = async (data: { ticker: string; targetPrice?: number }) => {
    try {
      const added = await addFavorite({
        ticker: data.ticker,
        target_price: data.targetPrice,
      });
      setItems((prev) => [...prev, added]);
      const q = await getQuotes([added.ticker]);
      setQuotes((prev) => ({ ...prev, ...q }));
    } catch (err: any) {
      alert('Failed to add: ' + err.message);
    }
  };

  const handleImport = async (importedItems: { ticker: string; name: string }[]) => {
    try {
      const tickers = importedItems.map(i => i.ticker);
      await addFavoritesBatch(tickers);
      await loadData();
    } catch (err: any) {
      alert('Import failed: ' + err.message);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteFavorite(deleteTarget.id);
      setItems((prev) => prev.filter((i) => i.id !== deleteTarget.id));
    } catch (err: any) {
      alert('Delete failed: ' + err.message);
    }
    setDeleteTarget(null);
  };

  const startEdit = (item: FavoriteItem) => {
    setEditingId(item.id);
    setEditForm({
      target_price: item.target_price !== null ? String(item.target_price) : '',
      notes: item.notes || '',
      tags: item.tags || [],
    });
  };

  const saveEdit = async (id: number) => {
    try {
      const updated = await updateFavorite(id, {
        target_price: editForm.target_price ? Number(editForm.target_price) : null,
        notes: editForm.notes || null,
        tags: editForm.tags,
      });
      setItems((prev) => prev.map((i) => i.id === id ? updated : i));
    } catch (err: any) {
      alert('Update failed: ' + err.message);
    }
    setEditingId(null);
  };

  const toggleTag = (tag: string) => {
    setEditForm((prev) => ({
      ...prev,
      tags: prev.tags.includes(tag) ? prev.tags.filter((t) => t !== tag) : [...prev.tags, tag],
    }));
  };

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'targetDiffPercent' ? 'desc' : 'asc'); }
  };

  const allTags = Array.from(new Set(items.flatMap((i) => i.tags || [])));

  const filteredItems = items.filter((item) => {
    if (filter) {
      const q = filter.toLowerCase();
      if (!item.name.toLowerCase().includes(q) && !item.ticker.toLowerCase().includes(q)) return false;
    }
    if (tagFilter && !(item.tags || []).includes(tagFilter)) return false;
    return true;
  });

  const sortedItems = [...filteredItems].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    if (sortKey === 'name') return dir * a.name.localeCompare(b.name);
    if (sortKey === 'ticker') return dir * a.ticker.localeCompare(b.ticker);
    if (sortKey === 'targetDiffPercent') {
      const qa = quotes[a.ticker];
      const qb = quotes[b.ticker];
      const va = calcTargetDiffPercent(a.target_price, qa?.currentPrice ?? null);
      const vb = calcTargetDiffPercent(b.target_price, qb?.currentPrice ?? null);
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      return dir * (va - vb);
    }
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

  const handleExport = () => {
    const headers = ['Name', 'Ticker', 'Alarm Price', 'Notes', 'Tags', ...columns.map((c) => {
      if (c === 'targetDiffPercent') return 'vs Alarm';
      return ALL_COLUMNS.find((ac) => ac.key === c)?.label || c;
    })];
    const rows = sortedItems.map((item) => {
      const q = quotes[item.ticker];
      return [
        item.name, item.ticker,
        item.target_price !== null ? String(item.target_price) : '',
        item.notes || '', (item.tags || []).join('; '),
        ...columns.map((c) => {
          if (c === 'targetDiffPercent') {
            const v = calcTargetDiffPercent(item.target_price, q?.currentPrice ?? null);
            return v !== null ? v.toFixed(2) + '%' : 'n/a';
          }
          const col = ALL_COLUMNS.find((ac) => ac.key === c);
          if (!col || !q) return 'n/a';
          const val = col.getValue(q);
          return val !== null ? String(val) : 'n/a';
        }),
      ];
    });
    exportToCsv(headers, rows, 'favorites.csv');
  };

  const activeColumns = columns.map((key) => {
    if (key === 'targetDiffPercent') return null; // handled separately
    return ALL_COLUMNS.find((c) => c.key === key);
  });

  // Count how many are at or below target
  const alertCount = items.filter(item => {
    if (item.target_price === null) return false;
    const q = quotes[item.ticker];
    return q?.currentPrice != null && q.currentPrice <= item.target_price;
  }).length;

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>;
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold">Favorietenlijst</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {items.length} stocks watching
            {alertCount > 0 && (
              <span className="ml-2 text-green-600 dark:text-green-400 font-semibold">
                <BellRing className="w-3.5 h-3.5 inline mr-0.5" />
                {alertCount} onder alarm price!
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span className="text-xs text-gray-400 flex items-center gap-1"><Clock className="w-3 h-3" /> {lastUpdated}</span>
          )}
          <button onClick={handleRefresh} disabled={refreshing} className="btn-secondary flex items-center gap-1.5">
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <ColumnPicker selectedColumns={columns} onChange={setColumns} extraColumns={[TARGET_COLUMN]} />
          <button onClick={handleExport} className="btn-secondary flex items-center gap-1.5"><Download className="w-4 h-4" /> CSV</button>
          <button onClick={() => setShowImport(true)} className="btn-secondary flex items-center gap-1.5"><Upload className="w-4 h-4" /> Import</button>
          <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-1.5"><Plus className="w-4 h-4" /> Add</button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-3">
        <input
          type="text"
          className="input-field max-w-sm"
          placeholder="Filter op naam of ticker..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        {allTags.length > 0 && (
          <div className="flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5 text-gray-400" />
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
                className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                  tagFilter === tag
                    ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                    : 'border-gray-200 dark:border-gray-600 hover:border-gray-300'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Table */}
      {sortedItems.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-gray-500 dark:text-gray-400">
            {items.length === 0 ? 'Nog geen favorieten.' : 'Geen resultaten voor je filter.'}
          </p>
          {items.length === 0 && (
            <button onClick={() => setShowAdd(true)} className="btn-primary mt-4"><Plus className="w-4 h-4 inline mr-1" /> Voeg eerste favoriet toe</button>
          )}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-max">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="table-header" onClick={() => handleSort('name')}>
                  <span className="flex items-center gap-1">Name {sortKey === 'name' && <ArrowUpDown className="w-3 h-3" />}</span>
                </th>
                <th className="table-header" onClick={() => handleSort('ticker')}>
                  <span className="flex items-center gap-1">Ticker {sortKey === 'ticker' && <ArrowUpDown className="w-3 h-3" />}</span>
                </th>
                <th className="table-header">Tags</th>
                <th className="table-header text-right">Alarm Price</th>
                {columns.includes('targetDiffPercent') && (
                  <th className="table-header text-right" onClick={() => handleSort('targetDiffPercent')}>
                    <span className="flex items-center justify-end gap-1">vs Alarm {sortKey === 'targetDiffPercent' && <ArrowUpDown className="w-3 h-3" />}</span>
                  </th>
                )}
                {activeColumns.map((col) => col && (
                  <th key={col.key} className="table-header text-right" onClick={() => handleSort(col.key)}>
                    <span className="flex items-center justify-end gap-1">{col.label} {sortKey === col.key && <ArrowUpDown className="w-3 h-3" />}</span>
                  </th>
                ))}
                <th className="table-header w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {sortedItems.map((item) => {
                const q = quotes[item.ticker];
                const targetDiff = calcTargetDiffPercent(item.target_price, q?.currentPrice ?? null);
                const isAlert = item.target_price !== null && q?.currentPrice !== null && q?.currentPrice !== undefined && q.currentPrice <= item.target_price;
                const isEditing = editingId === item.id;

                return (
                  <tr key={item.id} className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${
                    isAlert ? 'bg-green-50 dark:bg-green-900/10' : ''
                  }`}>
                    <td className="table-cell font-medium max-w-[180px] truncate">
                      <div className="flex items-center gap-1.5">
                        {isAlert && <Bell className="w-3.5 h-3.5 text-green-600 dark:text-green-400 flex-shrink-0" />}
                        {q?.name || item.name}
                      </div>
                    </td>
                    <td className="table-cell text-blue-600 dark:text-blue-400 font-mono text-xs">{item.ticker}</td>
                    <td className="table-cell">
                      <div className="flex gap-1">
                        {(item.tags || []).map((tag) => (
                          <span key={tag} className="badge badge-blue">{tag}</span>
                        ))}
                      </div>
                    </td>
                    <td className="table-cell text-right font-mono text-xs">
                      {isEditing ? (
                        <input
                          type="number"
                          className="input-field w-24 text-right text-xs"
                          value={editForm.target_price}
                          onChange={(e) => setEditForm((p) => ({ ...p, target_price: e.target.value }))}
                          step="0.01"
                        />
                      ) : (
                        item.target_price !== null ? item.target_price.toFixed(2) : 'n/a'
                      )}
                    </td>
                    {columns.includes('targetDiffPercent') && (
                      <td className={`table-cell text-right font-mono text-xs font-semibold ${
                        targetDiff !== null && targetDiff <= 0
                          ? 'text-green-600 dark:text-green-400'
                          : targetDiff !== null
                            ? 'text-red-600 dark:text-red-400'
                            : ''
                      }`}>
                        {targetDiff !== null ? formatPercent(targetDiff) : 'n/a'}
                      </td>
                    )}
                    {activeColumns.map((col) => {
                      if (!col) return null;
                      const val = q ? col.getValue(q) : null;
                      const formatted = formatValue(val, col.format);
                      const colorClass = col.format === 'percent' ? getPercentColor(val as number | null) : '';
                      return (
                        <td key={col.key} className={`table-cell text-right font-mono text-xs ${colorClass}`}>
                          {formatted}
                        </td>
                      );
                    })}
                    <td className="table-cell">
                      <div className="flex items-center gap-0.5">
                        {isEditing ? (
                          <>
                            <button onClick={() => saveEdit(item.id)} className="p-1 rounded hover:bg-green-50 dark:hover:bg-green-900/20 text-green-600"><Check className="w-3.5 h-3.5" /></button>
                            <button onClick={() => setEditingId(null)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"><X className="w-3.5 h-3.5" /></button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => startEdit(item)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-blue-600"><Edit2 className="w-3.5 h-3.5" /></button>
                            <button onClick={() => setDeleteTarget(item)} className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit panel for tags/notes */}
      {editingId !== null && (
        <div className="card mt-3 p-4">
          <h3 className="text-sm font-semibold mb-2">Details bewerken</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Notities</label>
              <textarea
                className="input-field h-20 resize-none"
                value={editForm.notes}
                onChange={(e) => setEditForm((p) => ({ ...p, notes: e.target.value }))}
                placeholder="Voeg notities toe..."
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Tags</label>
              <div className="flex flex-wrap gap-1.5">
                {AVAILABLE_TAGS.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      editForm.tags.includes(tag)
                        ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                        : 'border-gray-200 dark:border-gray-600 hover:border-gray-300'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <button onClick={() => setEditingId(null)} className="btn-secondary">Annuleren</button>
            <button onClick={() => saveEdit(editingId)} className="btn-primary">Opslaan</button>
          </div>
        </div>
      )}

      {/* Modals */}
      <AddStockModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onAdd={handleAdd}
        title="Toevoegen aan Favorieten"
        showTargetPrice
      />
      <ImportModal open={showImport} onClose={() => setShowImport(false)} onConfirm={handleImport} title="Import naar Favorieten" />
      <ConfirmDialog
        open={!!deleteTarget}
        title="Verwijderen uit Favorieten"
        message={`${deleteTarget?.name} (${deleteTarget?.ticker}) verwijderen uit je favorieten?`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
